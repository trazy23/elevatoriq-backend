const express = require('express');
const router = express.Router();
const db = require('../db');
const { addJob } = require('../workers/analysisWorker');

function getModule(review_type) {
  if (review_type === 'invoice_review') return 'A';
  if (review_type === 'contract_coverage') return 'A';
  if (review_type === 'maintenance_bid_comparison') return 'C';
  return 'B'; // modernization_comparison, single_modernization
}

// POST /api/cases — Create a case
router.post('/', async (req, res) => {
  try {
    const { customer_id, review_type, state, market, equipment_type, customer_email } = req.body;
    if (!review_type) return res.status(400).json({ error: 'review_type is required' });

    const module = getModule(review_type);
    const result = await db.query(
      `INSERT INTO cases (customer_id, review_type, module, state, market, equipment_type, customer_email)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [customer_id || null, review_type, module, state, market, equipment_type, customer_email]
    );
    res.json({ case_id: result.rows[0].id, status: 'pending' });
  } catch (err) {
    console.error('POST /cases error:', err);
    res.status(500).json({ error: 'Failed to create case' });
  }
});

// POST /api/cases/:id/run — Trigger analysis
router.post('/:id/run', async (req, res) => {
  try {
    const { id } = req.params;
    const caseRow = await db.query('SELECT * FROM cases WHERE id=$1', [id]);
    if (!caseRow.rows.length) return res.status(404).json({ error: 'Case not found' });

    const docs = await db.query('SELECT * FROM documents WHERE case_id=$1', [id]);
    if (!docs.rows.length) return res.status(400).json({ error: 'No documents uploaded for this case' });

    await db.query(`UPDATE cases SET status='processing' WHERE id=$1`, [id]);
    await addJob(id);

    res.json({ case_id: id, status: 'processing', message: 'Analysis queued' });
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

module.exports = router;
