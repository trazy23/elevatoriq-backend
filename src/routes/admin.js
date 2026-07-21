const express = require('express');
const router = express.Router();
const db = require('../db');

// Simple API key auth middleware
function requireAdminKey(req, res, next) {
  const key = req.headers['x-admin-key'];
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

// GET /api/admin/access-codes — List one-time access codes
router.get('/access-codes', requireAdminKey, async (req, res) => {
  try {
    const { listAccessCodes } = require('../services/accessCodeService');
    const codes = await listAccessCodes({ limit: req.query.limit });
    res.json({ total: codes.length, codes });
  } catch (err) {
    console.error('GET /admin/access-codes error:', err);
    res.status(500).json({ error: 'Failed to list access codes', detail: err.message });
  }
});

// POST /api/admin/access-codes — Generate one-time access codes
router.post('/access-codes', requireAdminKey, async (req, res) => {
  try {
    const { createAccessCodes } = require('../services/accessCodeService');
    const codes = await createAccessCodes({
      count: req.body?.count || 1,
      label: req.body?.label || null,
      expiresAt: req.body?.expires_at || null,
      createdBy: 'admin',
    });
    res.json({ ok: true, count: codes.length, codes });
  } catch (err) {
    console.error('POST /admin/access-codes error:', err);
    res.status(500).json({ error: 'Failed to create access codes', detail: err.message });
  }
});


// POST /api/admin/access-codes/:code/deactivate — Revoke an unused one-time access code
router.post('/access-codes/:code/deactivate', requireAdminKey, async (req, res) => {
  try {
    const { deactivateAccessCode } = require('../services/accessCodeService');
    const result = await deactivateAccessCode(req.params.code);
    if (!result.ok) {
      return res.status(404).json({ error: result.message || 'Access code not found or already used', code: result.code });
    }
    res.json(result);
  } catch (err) {
    console.error('POST /admin/access-codes/:code/deactivate error:', err);
    res.status(500).json({ error: 'Failed to deactivate access code', detail: err.message });
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

// POST /api/admin/process-nurture — Process pending nurture emails
router.post('/process-nurture', requireAdminKey, async (req, res) => {
  try {
    const { processNurtureQueue } = require('../services/nurtureService');
    const result = await processNurtureQueue();
    res.json({
      ok: true,
      processed: result.processed,
      failed: result.failed,
      error: result.error || null,
    });
  } catch (err) {
    console.error('POST /admin/process-nurture error:', err);
    res.status(500).json({ error: 'Failed to process nurture queue', detail: err.message });
  }
});

// GET /api/admin/metrics — Dashboard metrics for free/paid tier analytics
router.get('/growth/summary', requireAdminKey, async (req, res) => {
  try {
    const growth = require('../services/growthCommandService');
    res.json(await growth.getSummary());
  } catch (err) {
    console.error('GET /admin/growth/summary error:', err);
    res.status(500).json({ error: 'Failed to load growth summary', detail: err.message });
  }
});

router.get('/growth/approvals', requireAdminKey, async (req, res) => {
  try {
    const growth = require('../services/growthCommandService');
    res.json({ approvals: await growth.listApprovals() });
  } catch (err) {
    console.error('GET /admin/growth/approvals error:', err);
    res.status(500).json({ error: 'Failed to load growth approvals', detail: err.message });
  }
});

router.get('/growth/campaigns', requireAdminKey, async (req, res) => {
  try {
    const growth = require('../services/growthCommandService');
    res.json({ campaigns: await growth.listCampaigns() });
  } catch (err) {
    console.error('GET /admin/growth/campaigns error:', err);
    res.status(500).json({ error: 'Failed to load growth campaigns', detail: err.message });
  }
});

router.get('/growth/prospects', requireAdminKey, async (req, res) => {
  try {
    const growth = require('../services/growthCommandService');
    res.json({ prospects: await growth.listProspects() });
  } catch (err) {
    console.error('GET /admin/growth/prospects error:', err);
    res.status(500).json({ error: 'Failed to load growth prospects', detail: err.message });
  }
});

router.post('/growth/agents/:key/run', requireAdminKey, async (req, res) => {
  try {
    const growth = require('../services/growthCommandService');
    const result = await growth.runAgent(req.params.key, req.body || {});
    if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    console.error('POST /admin/growth/agents/:key/run error:', err);
    res.status(500).json({ error: 'Failed to run growth agent', detail: err.message });
  }
});

router.post('/growth/approvals/:id/approve', requireAdminKey, async (req, res) => {
  try {
    const growth = require('../services/growthCommandService');
    const result = await growth.approveItem(req.params.id, req.body?.notes || '');
    if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    console.error('POST /admin/growth/approvals/:id/approve error:', err);
    res.status(500).json({ error: 'Failed to approve growth item', detail: err.message });
  }
});

router.post('/growth/approvals/:id/reject', requireAdminKey, async (req, res) => {
  try {
    const growth = require('../services/growthCommandService');
    const status = req.body?.status === 'rejected' ? 'rejected' : 'needs_edits';
    const result = await growth.rejectItem(req.params.id, status, req.body?.notes || '');
    if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    console.error('POST /admin/growth/approvals/:id/reject error:', err);
    res.status(500).json({ error: 'Failed to reject growth item', detail: err.message });
  }
});

// GET /api/admin/metrics — Dashboard metrics for free/paid tier analytics
router.get('/metrics', requireAdminKey, async (req, res) => {
  try {
    const [summary, revenue, reviewTypes, dailyVolume, nurture] = await Promise.all([
      // Summary stats
      db.query(`
        SELECT
          COUNT(*) AS total_cases,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS cases_last_7_days,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS cases_last_30_days,
          COUNT(*) FILTER (WHERE payment_status = 'free') AS free_reviews,
          COUNT(*) FILTER (WHERE payment_status IN ('paid', 'subscribed')) AS paid_reviews
        FROM cases
      `),
      // Revenue stats
      db.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'active') AS active_subscriptions,
          SUM(CASE WHEN plan_type = 'owner_plan' THEN 1 ELSE 0 END) FILTER (WHERE status = 'active') AS owner_plan,
          SUM(CASE WHEN plan_type IN ('manager_plan', 'manager_plan_annual') THEN 1 ELSE 0 END) FILTER (WHERE status = 'active') AS manager_plan
        FROM subscriptions
      `),
      // Review types breakdown
      db.query(`
        SELECT review_type, COUNT(*) AS count
        FROM cases
        GROUP BY review_type
        ORDER BY count DESC
      `),
      // Daily volume last 30 days
      db.query(`
        SELECT DATE(created_at) AS date, COUNT(*) AS count
        FROM cases
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `),
      // Nurture stats
      db.query(`
        SELECT
          COUNT(*) FILTER (WHERE sent_at IS NOT NULL AND created_at > NOW() - INTERVAL '30 days') AS emails_sent_last_30d,
          COUNT(*) FILTER (WHERE sent_at IS NULL AND scheduled_for <= NOW()) AS pending_sends
        FROM nurture_emails
      `),
    ]);

    const summaryRow = summary.rows[0];
    const revenueRow = revenue.rows[0];
    const nurtureRow = nurture.rows[0];

    // Calculate conversion rate (free to paid)
    const totalFreeReviews = summaryRow.free_reviews || 0;
    const totalPaidReviews = summaryRow.paid_reviews || 0;
    const conversionRate = totalFreeReviews > 0 ? ((totalPaidReviews / (totalFreeReviews + totalPaidReviews)) * 100).toFixed(1) : '0';

    // Calculate MRR estimate (assuming standard pricing)
    const ownerPlan = revenueRow.owner_plan || 0;
    const managerPlan = revenueRow.manager_plan || 0;
    const mrrEstimateCents = (ownerPlan * 14900) + (managerPlan * 39900); // $149 and $399 monthly

    // Build review types object
    const reviewTypesObj = {};
    for (const row of reviewTypes.rows) {
      reviewTypesObj[row.review_type] = row.count;
    }

    // Build daily volume array
    const dailyVolumeArray = dailyVolume.rows.map(row => ({
      date: row.date.toISOString().split('T')[0],
      count: row.count,
    }));

    res.json({
      summary: {
        total_cases: summaryRow.total_cases || 0,
        cases_last_7_days: summaryRow.cases_last_7_days || 0,
        cases_last_30_days: summaryRow.cases_last_30_days || 0,
        free_reviews: summaryRow.free_reviews || 0,
        paid_reviews: summaryRow.paid_reviews || 0,
        free_to_paid_conversion_rate: `${conversionRate}%`,
      },
      revenue: {
        active_subscriptions: revenueRow.active_subscriptions || 0,
        subscription_breakdown: {
          owner_plan: ownerPlan,
          manager_plan: managerPlan,
        },
        mrr_estimate_cents: mrrEstimateCents,
      },
      review_types: reviewTypesObj,
      daily_volume_30d: dailyVolumeArray,
      nurture: {
        emails_sent_last_30d: nurtureRow.emails_sent_last_30d || 0,
        pending_sends: nurtureRow.pending_sends || 0,
      },
    });
  } catch (err) {
    console.error('GET /admin/metrics error:', err);
    res.status(500).json({ error: 'Failed to load metrics', detail: err.message });
  }
});

module.exports = router;
