const express = require('express');
const router = express.Router();
const db = require('../db');
const storageService = require('../services/storageService');

// GET /api/reports/download/:token — Secure PDF download
router.get('/download/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const result = await db.query(
      `SELECT * FROM reports WHERE download_token=$1 AND token_expires_at > NOW()`,
      [token]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Report not found or link has expired' });
    }

    const report = result.rows[0];
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
