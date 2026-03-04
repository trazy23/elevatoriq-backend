const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../db');
const { addJob } = require('../workers/analysisWorker');
const { persistDocument, MAX_BATCH_FILES } = require('./documents');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

function resolveRecipientEmail(body = {}) {
  const candidates = [
    ['customer_email', body.customer_email],
    ['request_email', body.request_email],
    ['uploaded_request_email', body.uploaded_request_email],
    ['requester_email', body.requester_email],
    ['from_email', body.from_email],
    ['email', body.email],
  ];

  for (const [source, value] of candidates) {
    const normalized = normalizeEmail(value);
    if (normalized) {
      return { email: normalized, source };
    }
  }

  return { email: null, source: null };
}

function getModule(reviewType) {
  const mapping = {
    invoice_review: 'A',
    contract_coverage: 'A',
    maintenance_bid_comparison: 'C',
    modernization_comparison: 'B',
    single_modernization: 'B',
  };
  return mapping[reviewType] || 'B';
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * POST /api/prompt — End-to-end analysis endpoint
 * Handles: multi-file upload → case creation → document storage → analysis queue
 */
router.post('/', upload.any(), async (req, res) => {
  try {
    const { email: resolvedRecipientEmail, source: recipientSource } = resolveRecipientEmail(req.body);
    const reviewType = (req.body.review_type || req.body.function_mode || '').trim();

    const files = (req.files || []).filter((f) => f.fieldname === 'file' || f.fieldname === 'files');

    if (!reviewType) return res.status(400).json({ error: 'review_type (or function_mode) is required' });
    if (!resolvedRecipientEmail) {
      return res.status(400).json({
        error: 'A valid recipient email is required (customer_email preferred, request_email accepted as fallback)',
      });
    }
    if (!files.length) return res.status(400).json({ error: 'No files uploaded (use file or files field)' });
    if (files.length > MAX_BATCH_FILES) {
      return res.status(400).json({ error: `Too many files. Max ${MAX_BATCH_FILES} files per request.` });
    }

    const module = getModule(reviewType);
    const company = req.body.company?.trim() || null;

    const caseResult = await db.query(
      `INSERT INTO cases (review_type, module, customer_email, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id`,
      [reviewType, module, resolvedRecipientEmail]
    );
    const caseId = caseResult.rows[0].id;

    const explicitTypes = toArray(req.body.file_types);
    const docs = [];
    for (let i = 0; i < files.length; i += 1) {
      const record = await persistDocument({
        caseId,
        file: files[i],
        fileType: explicitTypes[i] || req.body.file_type || null,
      });
      docs.push(record);
    }

    await db.query(`UPDATE cases SET status='processing' WHERE id=$1`, [caseId]);
    await addJob(caseId);

    return res.json({
      case_id: caseId,
      review_type: reviewType,
      module,
      company,
      uploaded_count: docs.length,
      documents: docs,
      status: 'processing',
      message: `Analysis started for ${docs.length} document(s). Report will be emailed to ${resolvedRecipientEmail}`,
      recipient: {
        email: resolvedRecipientEmail,
        source: recipientSource,
      },
      links: {
        status: `/api/cases/${caseId}/status`,
        output: `/api/cases/${caseId}/output`,
      },
    });
  } catch (err) {
    console.error('[/api/prompt] Fatal error:', err.message, err.stack);
    return res.status(500).json({ error: 'Analysis failed. Please try again.' });
  }
});

module.exports = router;
module.exports.resolveRecipientEmail = resolveRecipientEmail;
module.exports.normalizeEmail = normalizeEmail;
