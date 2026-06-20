const express = require('express');
const router = express.Router();
const db = require('../db');
const { addJob } = require('../workers/analysisWorker');
const {
  isValidAccessCode: _isValidAccessCode,
  isAvailableAccessCode,
  redeemAccessCode,
} = require('../services/accessCodeService');
const storageService = require('../services/storageService');
const pdfService = require('../services/pdfService');
const emailService = require('../services/emailService');
const { getStructuredReportKey } = require('../utils/reportArtifacts');
const { randomUUID } = require('crypto');
require('dotenv').config();

// Lazy-init Stripe so the server still boots if STRIPE_SECRET_KEY is not yet set
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured');
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

// Plan definitions — price IDs come from env vars (set after Stripe product creation)
const PLANS = {
  pay_per: {
    priceId: () => process.env.STRIPE_PRICE_PAY_PER,
    mode: 'payment',
    label: 'Single Review — $99',
    amount: 9900,
  },
  owner_plan: {
    priceId: () => process.env.STRIPE_PRICE_OWNER_PLAN,
    mode: 'subscription',
    label: 'Owner Plan — $149/month',
    amount: 14900,
    monthlyReviewCap: 5,
  },
  manager_plan: {
    priceId: () => process.env.STRIPE_PRICE_MANAGER_PLAN,
    mode: 'subscription',
    label: 'Manager Plan — $399/month',
    amount: 39900,
  },
  manager_plan_annual: {
    priceId: () => process.env.STRIPE_PRICE_MANAGER_ANNUAL,
    mode: 'subscription',
    label: 'Manager Plan Annual — $3,199/year',
    amount: 319900,
  },
};

// ─── Helpers ───────────────────────────────────────────────────────────────

// Access code validation delegated to shared service
const isValidAccessCode = _isValidAccessCode;

async function getAccessLevel(email, code) {
  const normalizedEmail = (email || '').toLowerCase().trim();
  if (!normalizedEmail) return { access: 'none', tier: null };

  // Access code bypass — grants unlimited free access (for pilots, testing, gifted access)
  if (await isAvailableAccessCode(code)) {
    return { access: 'free', tier: 'access_code', unlimited: true };
  }

  // Check active subscription. Subscription tables/constraints may lag during pay-per
  // launch, so do not let subscription-read failures block the free/$99 path.
  try {
    const sub = await db.query(
      `SELECT plan_type FROM subscriptions
       WHERE customer_email = $1
         AND status = 'active'
         AND (current_period_end IS NULL OR current_period_end > NOW())
       ORDER BY created_at DESC LIMIT 1`,
      [normalizedEmail]
    );
    if (sub.rows.length) {
      const planType = sub.rows[0].plan_type;
      const planDef = PLANS[planType];

      // Owner Plan has a monthly review cap — check usage this calendar month
      if (planDef && planDef.monthlyReviewCap) {
        const used = await db.query(
          `SELECT COUNT(*) as count FROM cases
           WHERE customer_email = $1
             AND payment_status != 'pending_payment'
             AND created_at >= date_trunc('month', NOW())`,
          [normalizedEmail]
        );
        const usedCount = parseInt(used.rows[0].count, 10);
        const remaining = planDef.monthlyReviewCap - usedCount;
        if (remaining <= 0) {
          return { access: 'capped', tier: planType, monthlyReviewCap: planDef.monthlyReviewCap, used: usedCount };
        }
        return { access: 'subscribed', tier: planType, monthlyReviewCap: planDef.monthlyReviewCap, reviewsUsed: usedCount, reviewsRemaining: remaining };
      }

      return { access: 'subscribed', tier: planType };
    }
  } catch (err) {
    if (err.code === '42P01' || /relation .*subscriptions.* does not exist/i.test(err.message || '')) {
      console.warn('[Payments] subscriptions table unavailable; continuing with free/pay-per access check');
    } else {
      throw err;
    }
  }

  // Check free review (first review free per email)
  const used = await db.query(
    `SELECT COUNT(*) as count FROM cases
     WHERE customer_email = $1 AND payment_status != 'pending_payment'`,
    [normalizedEmail]
  );
  const count = parseInt(used.rows[0].count, 10);
  if (count === 0) {
    return { access: 'free', tier: 'free_trial', freeReviewsRemaining: 1 };
  }

  return { access: 'none', tier: null };
}

async function ensurePaidReportForCase(caseId) {
  const caseResult = await db.query(
    `SELECT c.*, cu.name, cu.company
     FROM cases c
     LEFT JOIN customers cu ON cu.id = c.customer_id
     WHERE c.id = $1`,
    [caseId]
  );
  if (!caseResult.rows.length) {
    const err = new Error('Case not found');
    err.status = 404;
    throw err;
  }

  const caseRow = caseResult.rows[0];

  const existingReport = await db.query(
    `SELECT storage_path, download_token
     FROM reports
     WHERE case_id=$1
     ORDER BY created_at DESC
     LIMIT 1`,
    [caseId]
  );
  if (existingReport.rows.length) {
    return {
      case: caseRow,
      reportDownloadPath: `/api/reports/download/${existingReport.rows[0].download_token}`,
    };
  }

  if (caseRow.status !== 'complete') {
    return { case: caseRow, reportDownloadPath: null, pending: true };
  }

  const structuredKey = getStructuredReportKey(caseId);
  const structuredBuffer = await storageService.download(structuredKey);
  const structured = JSON.parse(structuredBuffer.toString('utf8'));
  const reportBody = structured.report_body;
  if (!reportBody) throw new Error('Structured report body is unavailable for this case');

  const token = randomUUID();
  const { key: pdfKey, buffer: pdfBuffer } = await pdfService.generateAndUploadPDF(
    reportBody,
    caseId,
    caseRow.review_type,
    token,
    caseRow.elevatoriq_score
  );

  await db.query(
    `INSERT INTO reports (case_id, storage_path, download_token) VALUES ($1,$2,$3)`,
    [caseId, pdfKey, token]
  );

  if (caseRow.customer_email) {
    try {
      await emailService.sendReport(caseRow.customer_email, pdfBuffer, caseRow.review_type, token, caseRow.name, caseRow.company);
      await db.query(`UPDATE reports SET emailed_at=NOW() WHERE download_token=$1`, [token]);
    } catch (emailErr) {
      console.warn(`[AccessCode] Report email failed for redeemed case ${caseId}:`, emailErr.message);
    }
  }

  return { case: caseRow, reportDownloadPath: `/api/reports/download/${token}` };
}

// ─── GET /api/payments/status ───────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const { email, code } = req.query;
    if (!email) return res.status(400).json({ error: 'email query param required' });
    const result = await getAccessLevel(email, code);
    res.json(result);
  } catch (err) {
    console.error('[Payments] Status check error:', err.message);
    res.status(500).json({ error: 'Failed to check payment status' });
  }
});

// ─── POST /api/payments/redeem-access-code ──────────────────────────────────
// Lets a user unlock an already-created preview either by paying or by entering
// a one-time code supplied by ElevatorIQ.
router.post('/redeem-access-code', async (req, res) => {
  try {
    const { code, caseId, email } = req.body || {};
    const redeemed = await redeemAccessCode({ code, caseId, email });
    if (!redeemed.ok) {
      return res.status(400).json({ error: redeemed.message, code: redeemed.code });
    }

    const report = await ensurePaidReportForCase(caseId);
    res.json({
      ok: true,
      access: 'paid',
      tier: 'access_code',
      pending: !!report.pending,
      caseId,
      reportDownloadPath: report.reportDownloadPath,
    });
  } catch (err) {
    console.error('[Payments] Access code redemption error:', err.message);
    res.status(err.status || 500).json({ error: 'Failed to redeem access code', detail: err.message });
  }
});

// ─── POST /api/payments/checkout ────────────────────────────────────────────
router.post('/checkout', async (req, res) => {
  try {
    const stripe = getStripe();
    const { plan, email, caseId } = req.body;
    if (!plan || !email) return res.status(400).json({ error: 'plan and email required' });

    const planDef = PLANS[plan];
    if (!planDef) return res.status(400).json({ error: `Unknown plan: ${plan}` });

    const priceId = planDef.priceId();
    if (!priceId) return res.status(400).json({ error: `Stripe price ID not configured for plan: ${plan}` });

    const frontendUrl = process.env.FRONTEND_URL || 'https://elevatoriq.ai';
    const normalizedEmail = email.toLowerCase().trim();

    // Build success/cancel URLs
    const successUrl = plan === 'pay_per'
      ? `${frontendUrl}/?payment=success&case_id=${caseId}`
      : `${frontendUrl}/?subscribed=true&plan=${plan}&email=${encodeURIComponent(normalizedEmail)}`;
    const cancelUrl = `${frontendUrl}/?payment=cancelled`;

    // Find or create Stripe customer for this email
    let customerId;
    const existing = await stripe.customers.list({ email: normalizedEmail, limit: 1 });
    if (existing.data.length) {
      customerId = existing.data[0].id;
    } else {
      const newCustomer = await stripe.customers.create({ email: normalizedEmail });
      customerId = newCustomer.id;
    }

    // Create checkout session
    const sessionParams = {
      customer: customerId,
      mode: planDef.mode,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        plan,
        customer_email: normalizedEmail,
        case_id: caseId || '',
      },
    };

    // For subscriptions, allow promotion codes
    if (planDef.mode === 'subscription') {
      sessionParams.allow_promotion_codes = true;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.json({ checkoutUrl: session.url, sessionId: session.id });

  } catch (err) {
    console.error('[Payments] Checkout creation error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session', detail: err.message });
  }
});

// ─── GET /api/payments/verify-session ───────────────────────────────────────
router.get('/verify-session', async (req, res) => {
  try {
    const stripe = getStripe();
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'session_id required' });

    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status === 'paid' || session.status === 'complete') {
      res.json({
        verified: true,
        plan: session.metadata?.plan,
        email: session.metadata?.customer_email || session.customer_email,
        caseId: session.metadata?.case_id || null,
      });
    } else {
      res.json({ verified: false, status: session.status });
    }
  } catch (err) {
    console.error('[Payments] Verify session error:', err.message);
    res.status(500).json({ error: 'Failed to verify session' });
  }
});

// ─── POST /api/webhooks/stripe ───────────────────────────────────────────────
// NOTE: This route is registered in index.js with express.raw() body parser
// to receive the raw request body needed for webhook signature verification.
async function handleStripeWebhook(req, res) {
  const stripe = getStripe();
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      // Dev mode: no signature verification
      console.warn('[Webhook] STRIPE_WEBHOOK_SECRET not set — skipping signature verification');
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error('[Webhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  console.log(`[Webhook] Event: ${event.type}`);

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object;
        const plan = session.metadata?.plan;
        const planDef = PLANS[plan];
        const email = (session.metadata?.customer_email || session.customer_email || '').toLowerCase();
        const caseId = session.metadata?.case_id;

        if (plan && !planDef) {
          console.warn(`[Webhook] Unknown checkout plan in metadata: ${plan}`);
          break;
        }

        if (plan === 'pay_per' && caseId) {
          // Mark case as paid, then trigger analysis
          await db.query(
            `UPDATE cases SET payment_status = 'paid' WHERE id = $1`,
            [caseId]
          );
          await addJob(caseId);
          console.log(`[Webhook] Pay-per confirmed for case ${caseId}, analysis queued`);

          // Record payment
          await db.query(
            `INSERT INTO payments (case_id, customer_email, stripe_session_id, amount_cents, status)
             VALUES ($1, $2, $3, $4, 'completed')
             ON CONFLICT (stripe_session_id) DO NOTHING`,
            [caseId, email, session.id, planDef.amount]
          );

        } else if (plan && plan !== 'pay_per') {
          // Subscription checkout completed — subscription.created event will also fire
          // but we upsert here too for redundancy
          const stripeSubId = session.subscription;
          if (stripeSubId) {
            const stripe2 = getStripe();
            const sub = await stripe2.subscriptions.retrieve(stripeSubId);
            const periodEnd = sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null;
            await db.query(
              `INSERT INTO subscriptions
               (customer_email, stripe_customer_id, stripe_subscription_id, plan_type, status, current_period_end)
               VALUES ($1, $2, $3, $4, 'active', $5)
               ON CONFLICT (stripe_subscription_id)
               DO UPDATE SET status = 'active', current_period_end = $5, updated_at = NOW()`,
              [email, session.customer, stripeSubId, plan, periodEnd]
            );
            console.log(`[Webhook] Subscription activated: ${plan} for ${email}`);
          }
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const email = await resolveEmailFromCustomer(sub.customer);
        const plan = sub.metadata?.plan || sub.items?.data[0]?.price?.metadata?.plan || 'portfolio_pro';
        const periodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null;

        await db.query(
          `INSERT INTO subscriptions
           (customer_email, stripe_customer_id, stripe_subscription_id, plan_type, status, current_period_end)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (stripe_subscription_id)
           DO UPDATE SET status = $5, current_period_end = $6, updated_at = NOW()`,
          [email, sub.customer, sub.id, plan, sub.status, periodEnd]
        );
        console.log(`[Webhook] Subscription ${event.type}: ${plan} → ${sub.status} for ${email}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await db.query(
          `UPDATE subscriptions SET status = 'canceled', updated_at = NOW()
           WHERE stripe_subscription_id = $1`,
          [sub.id]
        );
        console.log(`[Webhook] Subscription canceled: ${sub.id}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          await db.query(
            `UPDATE subscriptions SET status = 'past_due', updated_at = NOW()
             WHERE stripe_subscription_id = $1`,
            [invoice.subscription]
          );
          console.log(`[Webhook] Payment failed, subscription marked past_due: ${invoice.subscription}`);
        }
        break;
      }

      default:
        // Unhandled event types — that's fine
        break;
    }
  } catch (err) {
    console.error('[Webhook] Handler error:', err.message, err.stack);
    // Return a non-2xx response so Stripe retries payment events that failed
    // because of transient DB/queue issues. Swallowing these would leave paid
    // customers without unlocked reports.
    return res.status(500).json({ error: 'Webhook handler failed' });
  }

  res.json({ received: true });
}

async function resolveEmailFromCustomer(customerId) {
  try {
    const stripe = getStripe();
    const customer = await stripe.customers.retrieve(customerId);
    return (customer.email || '').toLowerCase();
  } catch {
    return '';
  }
}

module.exports = { router, handleStripeWebhook };
