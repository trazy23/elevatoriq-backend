const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../db');
const { addJob } = require('../workers/analysisWorker');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function getModule(review_type) {
  if (review_type === 'invoice_review') return 'A';
  if (review_type === 'contract_coverage') return 'A';
  if (review_type === 'maintenance_bid_comparison') return 'C';
  return 'B';
}

/**
 * POST /api/prompt — End-to-end analysis endpoint
 * Handles: file upload → case creation → document storage → analysis → email
 */
router.post('/', upload.single('file'), async (req, res) => {
  try {
    const { customer_email, company, review_type } = req.body;
    const file = req.file;

    if (!review_type) {
      return res.status(400).json({ error: 'review_type is required' });
    }
    if (!customer_email) {
      return res.status(400).json({ error: 'customer_email is required' });
    }
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log(`[/api/prompt] Starting analysis for ${customer_email}, review_type=${review_type}`);

    // 1. Create case
    const module = getModule(review_type);
    const caseResult = await db.query(
      `INSERT INTO cases (review_type, module, customer_email, status)
       VALUES ($1, $2, $3, 'processing')
       RETURNING id`,
      [review_type, module, customer_email]
    );
    const caseId = caseResult.rows[0].id;
    console.log(`[/api/prompt] Created case ${caseId}`);

    // 2. Store document (in memory for now, will be processed)
    const docResult = await db.query(
      `INSERT INTO documents (case_id, file_name, file_type, storage_path)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [caseId, file.originalname, file.mimetype, `case-${caseId}/${file.originalname}`]
    );
    console.log(`[/api/prompt] Stored document ${docResult.rows[0].id}`);

    // 3. Queue analysis job
    await addJob(caseId, {
      fileBuffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      customer_email: customer_email,
      company: company,
      review_type: review_type,
    });

    console.log(`[/api/prompt] Queued analysis for case ${caseId}`);

    // Return immediately — analysis happens in background
    res.json({
      case_id: caseId,
      status: 'processing',
      message: `Analysis started. Report will be emailed to ${customer_email}`,
    });
  } catch (err) {
    console.error('[/api/prompt] Error:', err.message, err.stack);
    res.status(500).json({ error: 'Analysis failed. Please try again.' });
  }
});

module.exports = router;
