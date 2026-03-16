const express = require('express');
const router = express.Router();
const db = require('../db');
const { addJob } = require('../workers/analysisWorker');
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
    label: 'Single Review — $49',
    amount: 4900,
  },
  invoice_monitor: {
    priceId: () => process.env.STRIPE_PRICE_INVOICE_MONITOR,
    mode: 'subscription',
    label: 'Invoice Monitor — $79/month',
    amount: 7900,
  },
  portfolio_pro: {
    priceId: () => process.env.STRIPE_PRICE_PORTFOLIO_PRO,
    mode: 'subscription',
    label: 'Portfolio Pro — $149/month',
    amount: 14900,
  },
  portfolio_pro_annual: {
    priceId: () => process.env.STRIPE_PRICE_PORTFOLIO_PRO_ANNUAL,
    mode: 'subscription',
    label: 'Portfolio Pro Annual — $1,199/year',
    amount: 119900,
  },
};

// ─── Helpers ───────────────────────────────────────────────────────────────

// Returns array of valid access codes from env var ACCESS_CODES (comma-separated)
// e.g. ACCESS_CODES=PILOT2026,BETA123,TREYZTEST
function getValidCodes() {
  const raw = process.env.ACCESS_CODES || '';
  return raw.split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
}

function isValidAccessCode(code) {
  if (!code) return false;
  const valid = getValidCodes();
  if (!valid.length) return false;
  return valid.includes(code.trim().toUpperCase());
}

async function getAccessLevel(email, code) {
  const normalizedEmail = (email || '').toLowerCase().trim();
  if (!normalizedEmail) return { access: 'none', tier: null };

  // Access code bypass — grants unlimited free access (for pilots, testing, gifted access)
  if (isValidAccessCode(code)) {
    return { access: 'free', tier: 'access_code', unlimited: true };
  }

  // Check active subscription
  const sub = await db.query(
    `SELECT plan_type FROM subscriptions
     WHERE customer_email = $1
       AND status = 'active'
       AND (current_period_end IS NULL OR current_period_end > NOW())
     ORDER BY created_at DESC LIMIT 1`,
    [normalizedEmail]
  );
  if (sub.rows.length) {
    return { access: 'subscribed', tier: sub.rows[0].plan_type };
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
        const email = (session.metadata?.customer_email || session.customer_email || '').toLowerCase();
        const caseId = session.metadata?.case_id;

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
            [caseId, email, session.id, 4900]
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
    // Return 200 to prevent Stripe from retrying — log for manual investigation
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
