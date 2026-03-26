const express = require('express');
const router = express.Router();
const db = require('../db');

// Simple API key auth middleware
function requireAdminKey(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) {
    return res.status(503).json({ error: 'Admin key not configured on server' });
  }
  if (!key || key !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// GET /api/admin/submissions — Full submission log with customer info
router.get('/submissions', requireAdminKey, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = parseInt(req.query.offset) || 0;

    const result = await db.query(
      `SELECT
         c.id            AS case_id,
         c.created_at,
         c.completed_at,
         c.status,
         c.review_type,
         c.module,
         c.customer_email,
         cu.company,
         cu.plan_tier,
         cu.id           AS customer_id,
         (SELECT COUNT(*) FROM cases c2 WHERE c2.customer_email = c.customer_email) AS total_reviews,
         (SELECT COUNT(*) FROM documents d WHERE d.case_id = c.id)                  AS doc_count,
         (SELECT r.download_token FROM reports r WHERE r.case_id = c.id LIMIT 1)    AS download_token
       FROM cases c
       LEFT JOIN customers cu ON cu.id = c.customer_id
       ORDER BY c.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await db.query('SELECT COUNT(*) FROM cases');
    const total = parseInt(countResult.rows[0].count);

    res.json({
      total,
      limit,
      offset,
      submissions: result.rows,
    });
  } catch (err) {
    console.error('GET /admin/submissions error:', err);
    res.status(500).json({ error: 'Failed to load submissions' });
  }
});

// GET /api/admin/customers — Unique customer list with stats
router.get('/customers', requireAdminKey, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         cu.id,
         cu.email,
         cu.company,
         cu.plan_tier,
         cu.created_at,
         COUNT(c.id)                                       AS total_reviews,
         MAX(c.created_at)                                 AS last_review_at,
         COUNT(c.id) FILTER (WHERE c.status = 'complete') AS completed_reviews,
         COUNT(c.id) FILTER (WHERE c.status = 'failed')   AS failed_reviews,
         array_agg(DISTINCT c.review_type)                 AS review_types_used
       FROM customers cu
       LEFT JOIN cases c ON c.customer_id = cu.id
       GROUP BY cu.id
       ORDER BY cu.created_at DESC`
    );

    res.json({
      total: result.rows.length,
      customers: result.rows,
    });
  } catch (err) {
    console.error('GET /admin/customers error:', err);
    res.status(500).json({ error: 'Failed to load customers' });
  }
});

// GET /api/admin/stats — Dashboard numbers
router.get('/stats', requireAdminKey, async (req, res) => {
  try {
    const [totals, daily, reviewTypes] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*)                                          AS total_submissions,
          COUNT(*) FILTER (WHERE status = 'complete')      AS completed,
          COUNT(*) FILTER (WHERE status = 'failed')        AS failed,
          COUNT(*) FILTER (WHERE status = 'processing')    AS processing,
          COUNT(DISTINCT customer_email)                   AS unique_emails,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')  AS last_7_days,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS last_30_days
        FROM cases
      `),
      db.query(`
        SELECT
          DATE(created_at) AS day,
          COUNT(*)          AS submissions
        FROM cases
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY day DESC
      `),
      db.query(`
        SELECT review_type, COUNT(*) AS count
        FROM cases
        GROUP BY review_type
        ORDER BY count DESC
      `),
    ]);

    res.json({
      totals: totals.rows[0],
      daily_last_30: daily.rows,
      review_types: reviewTypes.rows,
    });
  } catch (err) {
    console.error('GET /admin/stats error:', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// GET /api/admin/queue — Live queue depth and concurrency status
router.get('/queue', requireAdminKey, async (req, res) => {
  try {
    const { getQueueStatus } = require('../workers/analysisWorker');
    const status = await getQueueStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get queue status', detail: err.message });
  }
});

// POST /api/admin/cases/:id/retry — Reset a stuck/orphaned case and re-queue it
router.post('/cases/:id/retry', requireAdminKey, async (req, res) => {
  const { id } = req.params;
  try {
    const check = await db.query(`SELECT id, status FROM cases WHERE id=$1`, [id]);
    if (!check.rows.length) {
      return res.status(404).json({ error: 'Case not found' });
    }
    const current = check.rows[0].status;
    if (current === 'complete') {
      return res.status(409).json({ error: 'Case already complete', status: current });
    }
    await db.query(`UPDATE cases SET status='pending' WHERE id=$1`, [id]);
    const { addJob } = require('../workers/analysisWorker');
    await addJob(id);
    console.log(`[Admin] Manual retry triggered for case ${id} (was: ${current})`);
    res.json({ ok: true, case_id: id, previous_status: current, new_status: 'pending' });
  } catch (err) {
    console.error(`POST /admin/cases/${id}/retry error:`, err);
    res.status(500).json({ error: 'Retry failed', detail: err.message });
  }
});

module.exports = router;
