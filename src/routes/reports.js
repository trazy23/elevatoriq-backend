const express = require('express');
const router = express.Router();
const db = require('../db');
const storageService = require('../services/storageService');
const { buildReportFilename } = require('../services/pdfService');

// GET /api/reports/download/:token — Secure PDF download
router.get('/download/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Look up the report record by token, joining case + customer for filename
    const result = await db.query(
      `SELECT r.*, c.review_type, cu.company
       FROM reports r
       JOIN cases c ON r.case_id = c.id
       LEFT JOIN customers cu ON c.customer_id = cu.id
       WHERE r.download_token=$1`,
      [token]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Report not found or link has expired' });
    }

    const report = result.rows[0];
    if (report.token_expires_at && new Date(report.token_expires_at).getTime() <= Date.now()) {
      return res.status(404).json({ error: 'Report not found or link has expired' });
    }

    // storageService.download falls back to mock storage when S3 is unavailable
    const pdfBuffer = await storageService.download(report.storage_path);

    const filename = buildReportFilename(report.review_type, report.company);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('GET /reports/download error:', err);
    res.status(500).json({ error: 'Failed to download report' });
  }
});

module.exports = router;
