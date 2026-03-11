const express = require('express');
const router = express.Router();
const db = require('../db');
const storageService = require('../services/storageService');

// GET /api/reports/download/:token — Secure PDF download
router.get('/download/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Look up the report record by token (works in both mock and production)
    const result = await db.query(
      `SELECT * FROM reports WHERE download_token=$1`,
      [token]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Report not found or link has expired' });
    }

    const report = result.rows[0];
    // storageService.download falls back to mock storage when S3 is unavailable
    const pdfBuffer = await storageService.download(report.storage_path);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="ElevatorIQ_Report.pdf"',
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('GET /reports/download error:', err);
    res.status(500).json({ error: 'Failed to download report' });
  }
});

module.exports = router;
