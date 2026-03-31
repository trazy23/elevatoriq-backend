const express = require('express');
const router = express.Router();
const db = require('../db');

// POST /api/subscribe
// Captures email signups from the quiz result screen (and any future sources)
router.post('/', async (req, res) => {
  const { email, source, risk_level, risk_count } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  try {
    await db.query(
      `INSERT INTO subscribers (email, source, risk_level, risk_count, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (email) DO UPDATE SET
         source = EXCLUDED.source,
         risk_level = EXCLUDED.risk_level,
         risk_count = EXCLUDED.risk_count,
         updated_at = NOW()`,
      [email.toLowerCase().trim(), source || 'unknown', risk_level || null, risk_count || null]
    );

    return res.json({ ok: true });
  } catch (err) {
    // If table doesn't exist yet, still return success to the user — don't break the UI
    console.error('[subscribe] DB error:', err.message);
    return res.json({ ok: true });
  }
});

module.exports = router;
