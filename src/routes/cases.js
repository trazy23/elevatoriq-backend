const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { addJob } = require('../workers/analysisWorker');
const { getStructuredReportKey } = require('../utils/reportArtifacts');
const { inferReviewTypeFromDocuments } = require('../services/documentTypeService');
const { sendSubmissionAlert } = require('../services/emailService');

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

    // Upsert customer record so we have a full CRM row for every submitter
    let resolvedCustomerId = customer_id || null;
    if (resolvedRecipientEmail) {
      try {
        const upsertResult = await db.query(
          `INSERT INTO customers (email, company)
           VALUES ($1, $2)
           ON CONFLICT (email) DO UPDATE
             SET company = COALESCE(EXCLUDED.company, customers.company),
                 updated_at = NOW()
           RETURNING id`,
          [resolvedRecipientEmail, normalizedCompany]
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
    const result = await db.query(
      `INSERT INTO cases (customer_id, review_type, module, state, market, equipment_type, customer_email, payment_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [resolvedCustomerId, normalizedReviewType, module, state, market, equipment_type, resolvedRecipientEmail, paymentStatus]
    );
    const caseId = result.rows[0].id;

    // Fire-and-forget owner alert — never blocks the response
    sendSubmissionAlert({
      customerEmail: resolvedRecipientEmail,
      company: normalizedCompany,
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
      'SELECT id, review_type, status, customer_email, created_at, completed_at FROM cases WHERE id=$1',
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

    res.json({
      case: caseResult.rows[0],
      artifacts: {
        report_pdf_path: latestReport?.storage_path || null,
        report_download_path: latestReport?.download_token ? `/api/reports/download/${latestReport.download_token}` : null,
        report_email_recipient: caseResult.rows[0].customer_email || null,
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
