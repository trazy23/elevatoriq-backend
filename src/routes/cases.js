const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { addJob } = require('../workers/analysisWorker');
const { getStructuredReportKey } = require('../utils/reportArtifacts');
const { inferReviewTypeFromDocuments } = require('../services/documentTypeService');
const { sendSubmissionAlert } = require('../services/emailService');
const { checkFreeEligibility } = require('../services/freeEligibilityService');
const { isValidAccessCode } = require('../services/accessCodeService');

// Extract real client IP — respects X-Forwarded-For from Render/proxies
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip || null;
}

// Rate limiter: 5 requests per IP per hour on submission endpoints
const submissionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many submissions from this IP. Please wait before submitting again.',
    retryAfter: 'Try again in 1 hour.',
  },
});

function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

function getModule(review_type) {
  if (review_type === 'invoice_review') return 'A';
  if (review_type === 'contract_coverage') return 'A';
  if (review_type === 'maintenance_bid_comparison') return 'C';
  return 'B'; // modernization_comparison, single_modernization
}

// POST /api/cases — Create a case
router.post('/', submissionLimiter, async (req, res) => {
  try {
    const {
      customer_id,
      review_type,
      state,
      market,
      equipment_type,
      customer_email,
      request_email,
      uploaded_request_email,
      requester_email,
      from_email,
      email,
      company,
      name,
      role,
      access_code,
    } = req.body;
    const resolvedRecipientEmail =
      normalizeEmail(customer_email)
      || normalizeEmail(request_email)
      || normalizeEmail(uploaded_request_email)
      || normalizeEmail(requester_email)
      || normalizeEmail(from_email)
      || normalizeEmail(email);
    const normalizedReviewType = review_type || 'auto';
    const normalizedCompany = (company && typeof company === 'string' && company.trim() !== '(not provided)')
      ? company.trim() : null;
    const normalizedName = (name && typeof name === 'string') ? name.trim() || null : null;
    const validRoles = ['property_manager', 'facilities_director', 'building_owner', 'consultant', 'other'];
    const normalizedRole = validRoles.includes(role) ? role : null;

    // Upsert customer record — update name/role only if newly provided (don't overwrite with null)
    let resolvedCustomerId = customer_id || null;
    if (resolvedRecipientEmail) {
      try {
        const upsertResult = await db.query(
          `INSERT INTO customers (email, company, name, role)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (email) DO UPDATE
             SET company = COALESCE(EXCLUDED.company, customers.company),
                 name    = COALESCE(EXCLUDED.name, customers.name),
                 role    = COALESCE(EXCLUDED.role, customers.role),
                 updated_at = NOW()
           RETURNING id`,
          [resolvedRecipientEmail, normalizedCompany, normalizedName, normalizedRole]
        );
        resolvedCustomerId = upsertResult.rows[0]?.id || resolvedCustomerId;
      } catch (upsertErr) {
        // Non-fatal — log but don't block case creation
        console.warn('[Cases] Customer upsert failed:', upsertErr.message);
      }
    }

    const module = getModule(normalizedReviewType === 'auto' ? 'contract_coverage' : normalizedReviewType);
    // payment_status: 'pending_payment' for pay-per Stripe flow (webhook triggers run)
    // 'free' for first-review-free and subscription flows (run triggered directly)
    const paymentStatus = req.body.payment_status === 'pending_payment' ? 'pending_payment' : 'free';
    const clientIp = getClientIp(req);

    // Free tier abuse check — email normalization + IP + disposable domain
    // Bypass entirely for valid access codes (pilot users, internal testing, gifted access)
    if (paymentStatus === 'free' && !isValidAccessCode(access_code)) {
      const eligibility = await checkFreeEligibility(resolvedRecipientEmail, clientIp);
      if (!eligibility.eligible) {
        return res.status(403).json({
          error: 'Free review not available',
          code: eligibility.reason,
          message: eligibility.message,
        });
      }
    }

    const result = await db.query(
      `INSERT INTO cases (customer_id, review_type, module, state, market, equipment_type, customer_email, payment_status, client_ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [resolvedCustomerId, normalizedReviewType, module, state, market, equipment_type, resolvedRecipientEmail, paymentStatus, clientIp]
    );
    const caseId = result.rows[0].id;

    // Fire-and-forget owner alert — never blocks the response
    sendSubmissionAlert({
      customerEmail: resolvedRecipientEmail,
      company: normalizedCompany,
      name: normalizedName,
      role: normalizedRole,
      reviewType: normalizedReviewType,
      caseId,
    });

    res.json({ case_id: caseId, status: 'pending' });
  } catch (err) {
    console.error('POST /cases error:', err);
    res.status(500).json({ error: 'Failed to create case' });
  }
});

// POST /api/cases/:id/run — Trigger analysis
router.post('/:id/run', submissionLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const caseRow = await db.query('SELECT * FROM cases WHERE id=$1', [id]);
    if (!caseRow.rows.length) return res.status(404).json({ error: 'Case not found' });

    // Block analysis if payment is pending (Stripe webhook will trigger run after payment)
    if (caseRow.rows[0].payment_status === 'pending_payment') {
      return res.status(402).json({
        error: 'Payment required',
        code: 'PAYMENT_REQUIRED',
        message: 'Complete payment to run this analysis',
      });
    }

    const docs = await db.query('SELECT * FROM documents WHERE case_id=$1', [id]);
    if (!docs.rows.length) return res.status(400).json({ error: 'No documents uploaded for this case' });

    let resolvedReviewType = caseRow.rows[0].review_type;
    if (!resolvedReviewType || resolvedReviewType === 'auto') {
      resolvedReviewType = inferReviewTypeFromDocuments(docs.rows);
      const resolvedModule = getModule(resolvedReviewType);
      await db.query(
        `UPDATE cases SET review_type=$2, module=$3 WHERE id=$1`,
        [id, resolvedReviewType, resolvedModule]
      );
    }

    await db.query(`UPDATE cases SET status='processing' WHERE id=$1`, [id]);

    // Run analysis synchronously BEFORE responding so Vercel keeps the function
    // alive for the full maxDuration (300s). Frontend is fire-and-forget so
    // the user never waits on this response.
    const { runCaseWithGuard } = require('../workers/analysisWorker');
    // Respond immediately so frontend isn't blocked, then await analysis
    res.json({ case_id: id, status: 'processing', review_type: resolvedReviewType, message: 'Analysis queued' });
    // Await keeps the Vercel function alive for up to 300s (maxDuration)
    await runCaseWithGuard(id).catch((err) => {
      console.error(`[Run] Analysis failed for case ${id}:`, err.message);
    });
  } catch (err) {
    console.error('POST /cases/:id/run error:', err);
    res.status(500).json({ error: 'Failed to queue analysis' });
  }
});

// GET /api/cases/:id/status — Poll status
router.get('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'SELECT id, status, created_at, completed_at FROM cases WHERE id=$1', [id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Case not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /cases/:id/status error:', err);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

// GET /api/cases/:id/output — Structured output metadata for completed workflows
router.get('/:id/output', async (req, res) => {
  try {
    const { id } = req.params;

    const caseResult = await db.query(
      'SELECT id, review_type, status, customer_email, created_at, completed_at, elevatoriq_score, payment_status FROM cases WHERE id=$1',
      [id]
    );
    if (!caseResult.rows.length) return res.status(404).json({ error: 'Case not found' });

    const [documentsResult, reportResult, extractionResult] = await Promise.all([
      db.query(
        `SELECT id, file_name, file_type, storage_path, uploaded_at
         FROM documents
         WHERE case_id=$1
         ORDER BY uploaded_at ASC`,
        [id]
      ),
      db.query(
        `SELECT id, storage_path, download_token, token_expires_at, emailed_at, created_at
         FROM reports
         WHERE case_id=$1
         ORDER BY created_at DESC
         LIMIT 1`,
        [id]
      ),
      db.query(
        `SELECT id, module, benchmark_version, confidence_overall, raw_json, created_at
         FROM extractions_raw
         WHERE case_id=$1
         ORDER BY created_at DESC
         LIMIT 1`,
        [id]
      ),
    ]);

    const latestReport = reportResult.rows[0] || null;
    const latestExtraction = extractionResult.rows[0] || null;
    const caseRow = caseResult.rows[0];
    const isFree = caseRow.payment_status === 'free';

    // ── Free-tier gating ────────────────────────────────────────────────────
    // Free users get a diagnostic view (verdict + findings) but not the
    // actionable content (dollar quantification, recommendations, PDF/QR).
    // The full analysis still runs underneath — gating is display-only.
    if (isFree && caseRow.status === 'completed') {
      const raw = latestExtraction?.raw_json || {};
      const flags = Array.isArray(raw.flags) ? raw.flags : [];

      // Redact each flag: keep what/where/why (title, finding, risk) — remove how/how-much (recommendation)
      const diagnosticFlags = flags.map(f => ({
        title: f.title || f.item || null,
        severity: f.severity || null,
        finding: f.finding || f.description || null,
        risk: f.risk || null,
        // recommendation intentionally omitted
      }));

      const highCount = flags.filter(f => (f.severity || '').toUpperCase() === 'HIGH').length;
      const medCount  = flags.filter(f => (f.severity || '').toUpperCase() === 'MEDIUM').length;
      const lowCount  = flags.filter(f => (f.severity || '').toUpperCase() === 'LOW').length;

      return res.json({
        tier: 'free',
        case: {
          id: caseRow.id,
          review_type: caseRow.review_type,
          status: caseRow.status,
          created_at: caseRow.created_at,
          completed_at: caseRow.completed_at,
          elevatoriq_score: caseRow.elevatoriq_score,
        },
        diagnostic: {
          score_label: raw.score_label || null,
          elevatoriq_score: caseRow.elevatoriq_score ?? raw.elevatoriq_score ?? null,
          flag_summary: { high: highCount, medium: medCount, low: lowCount, total: flags.length },
          flags: diagnosticFlags,
          // Gated fields — shown as locked to prompt upgrade
          gated: ['dollar_quantification', 'negotiation_recommendations', 'scope_line_items', 'pdf_report'],
        },
        documents: documentsResult.rows,
      });
    }

    // ── Paid / subscription / pending response (unchanged) ──────────────────
    res.json({
      case: caseRow,
      artifacts: {
        report_pdf_path: latestReport?.storage_path || null,
        report_download_path: latestReport?.download_token ? `/api/reports/download/${latestReport.download_token}` : null,
        report_email_recipient: caseRow.customer_email || null,
        structured_report_path: getStructuredReportKey(id),
      },
      documents: documentsResult.rows,
      extraction: latestExtraction ? {
        extraction_id: latestExtraction.id,
        module: latestExtraction.module,
        benchmark_version: latestExtraction.benchmark_version,
        confidence_overall: latestExtraction.confidence_overall,
        raw_json: latestExtraction.raw_json,
        created_at: latestExtraction.created_at,
      } : null,
    });
  } catch (err) {
    console.error('GET /cases/:id/output error:', err);
    res.status(500).json({ error: 'Failed to get case output metadata' });
  }
});

module.exports = router;
