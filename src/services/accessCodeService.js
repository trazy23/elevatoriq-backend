// ─── Access Code Service ──────────────────────────────────────────────────────
// Supports legacy env-var codes plus database-backed one-time unlock codes.
//
// Env var fallback: ACCESS_CODES (comma-separated, case-insensitive)
// Database table: access_codes (see migrations/011_one_time_access_codes.sql)

const crypto = require('crypto');
const db = require('../db');

function normalizeCode(code) {
  if (!code || typeof code !== 'string') return null;
  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  return normalized || null;
}

function getValidCodes() {
  const raw = process.env.ACCESS_CODES || '';
  return raw.split(',').map(normalizeCode).filter(Boolean);
}

function isValidAccessCode(code) {
  const normalized = normalizeCode(code);
  if (!normalized) return false;
  const valid = getValidCodes();
  if (!valid.length) return false;
  return valid.includes(normalized);
}

async function isAvailableAccessCode(code) {
  const normalized = normalizeCode(code);
  if (!normalized) return false;

  // Legacy env-var codes remain valid, but they are not one-time-use.
  if (isValidAccessCode(normalized)) return true;

  try {
    const result = await db.query(
      `SELECT code
       FROM access_codes
       WHERE code = $1
         AND active = TRUE
         AND redeemed_at IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 1`,
      [normalized]
    );
    return result.rows.length > 0;
  } catch (err) {
    if (err.code === '42P01' || /relation .*access_codes.* does not exist/i.test(err.message || '')) {
      console.warn('[AccessCode] access_codes table unavailable; falling back to ACCESS_CODES env only');
      return false;
    }
    throw err;
  }
}

function generateCode(prefix = 'EIQ') {
  const body = crypto.randomBytes(5).toString('hex').toUpperCase();
  return `${prefix}-${body.slice(0, 5)}-${body.slice(5, 10)}`;
}

async function createAccessCodes({ count = 1, label = null, expiresAt = null, createdBy = 'admin' } = {}) {
  const safeCount = Math.max(1, Math.min(Number(count) || 1, 100));
  const codes = [];

  for (let i = 0; i < safeCount; i += 1) {
    let code;
    let inserted = false;
    let attempts = 0;

    while (!inserted && attempts < 5) {
      attempts += 1;
      code = generateCode();
      try {
        await db.query(
          `INSERT INTO access_codes (code, label, expires_at, created_by)
           VALUES ($1, $2, $3, $4)`,
          [code, label, expiresAt, createdBy]
        );
        inserted = true;
      } catch (err) {
        if (err.code !== '23505') throw err;
      }
    }

    if (!inserted) throw new Error('Failed to generate a unique access code');
    codes.push(code);
  }

  return codes;
}

async function listAccessCodes({ limit = 100 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  const result = await db.query(
    `SELECT code, label, active, created_by, created_at, expires_at, redeemed_at, redeemed_case_id, redeemed_email
     FROM access_codes
     ORDER BY created_at DESC
     LIMIT $1`,
    [safeLimit]
  );
  return result.rows;
}


async function deactivateAccessCode(code) {
  const normalized = normalizeCode(code);
  if (!normalized) return { ok: false, code: 'invalid_code', message: 'Enter a valid access code.' };

  const result = await db.query(
    `UPDATE access_codes
     SET active = FALSE
     WHERE code = $1
       AND redeemed_at IS NULL
     RETURNING code, active`,
    [normalized]
  );

  if (!result.rows.length) {
    return { ok: false, code: 'not_found_or_used', message: 'Code was not found or has already been used.' };
  }

  return { ok: true, code: normalized };
}

async function redeemAccessCode({ code, caseId, email }) {
  const normalized = normalizeCode(code);
  const normalizedEmail = (email || '').toLowerCase().trim() || null;
  if (!normalized) return { ok: false, code: 'invalid_code', message: 'Enter a valid access code.' };
  if (!caseId) return { ok: false, code: 'missing_case', message: 'Missing case ID.' };

  // Legacy env-var codes behave as reusable admin/pilot bypasses.
  if (isValidAccessCode(normalized)) {
    await db.query(`UPDATE cases SET payment_status='paid' WHERE id=$1`, [caseId]);
    return { ok: true, code: normalized, legacy: true };
  }

  if (!db.pool?.connect) throw new Error('Database transaction client unavailable');
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const redeemResult = await client.query(
      `UPDATE access_codes
       SET redeemed_at = NOW(), redeemed_case_id = $2, redeemed_email = $3
       WHERE code = $1
         AND active = TRUE
         AND redeemed_at IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())
       RETURNING code`,
      [normalized, caseId, normalizedEmail]
    );

    if (!redeemResult.rows.length) {
      await client.query('ROLLBACK');
      return { ok: false, code: 'code_unavailable', message: 'That access code is invalid, expired, or already used.' };
    }

    await client.query(`UPDATE cases SET payment_status='paid' WHERE id=$1`, [caseId]);
    await client.query('COMMIT');
    return { ok: true, code: normalized, legacy: false };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  normalizeCode,
  isValidAccessCode,
  isAvailableAccessCode,
  getValidCodes,
  createAccessCodes,
  listAccessCodes,
  deactivateAccessCode,
  redeemAccessCode,
};
