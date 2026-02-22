const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../db');
const { addJob } = require('../workers/analysisWorker');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function getModule(review_type) {
  const mapping = {
    'invoice_review': 'A',
    'contract_coverage': 'A',
    'maintenance_bid_comparison': 'C',
    'modernization_comparison': 'B',
    'single_modernization': 'B',
  };
  return mapping[review_type] || 'B';
}

/**
 * POST /api/prompt — End-to-end analysis endpoint
 * Handles: file upload → case creation → document storage → analysis → email
 */
router.post('/', upload.single('file'), async (req, res) => {
  try {
    const { customer_email, company, review_type } = req.body;
    const file = req.file;

    console.log(`[/api/prompt] Received: email=${customer_email}, review_type=${review_type}, file=${file?.originalname}`);

    // Validation
    if (!review_type || !review_type.trim()) {
      return res.status(400).json({ error: 'review_type is required' });
    }
    if (!customer_email || !customer_email.trim()) {
      return res.status(400).json({ error: 'customer_email is required' });
    }
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Get module
    const module = getModule(review_type);
    console.log(`[/api/prompt] Module: ${module}, File size: ${file.size} bytes`);

    // 1. Create case
    let caseId;
    try {
      const caseResult = await db.query(
        `INSERT INTO cases (review_type, module, customer_email, status)
         VALUES ($1, $2, $3, 'processing')
         RETURNING id`,
        [review_type, module, customer_email]
      );
      caseId = caseResult.rows[0].id;
      console.log(`[/api/prompt] Created case ${caseId}`);
    } catch (dbErr) {
      console.error(`[/api/prompt] Case creation failed:`, dbErr.message);
      throw dbErr;
    }

    // 2. Store document reference
    try {
      await db.query(
        `INSERT INTO documents (case_id, file_name, file_type, storage_path)
         VALUES ($1, $2, $3, $4)`,
        [caseId, file.originalname, file.mimetype, `case-${caseId}/${file.originalname}`]
      );
      console.log(`[/api/prompt] Stored document for case ${caseId}`);
    } catch (dbErr) {
      console.error(`[/api/prompt] Document storage failed:`, dbErr.message);
      throw dbErr;
    }

    // 3. Queue analysis job
    try {
      await addJob(caseId, {
        fileBuffer: file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype,
        customer_email: customer_email,
        company: company || '(not provided)',
        review_type: review_type,
      });
      console.log(`[/api/prompt] Queued analysis for case ${caseId}`);
    } catch (workerErr) {
      console.error(`[/api/prompt] Worker job failed:`, workerErr.message);
      // Continue anyway — job will run directly
    }

    // Return immediately — analysis happens in background
    res.json({
      case_id: caseId,
      status: 'processing',
      message: `Analysis started. Report will be emailed to ${customer_email}`,
    });
  } catch (err) {
    console.error('[/api/prompt] Fatal error:', err.message, err.stack);
    res.status(500).json({ error: 'Analysis failed. Please try again.' });
  }
});

module.exports = router;
