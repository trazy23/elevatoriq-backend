'use strict';

/**
 * migrate.js — Idempotent startup migration runner
 *
 * On every server boot, this:
 *   1. Creates a schema_migrations tracking table (IF NOT EXISTS)
 *   2. Applies schema_v1.sql if the base 'customers' table doesn't exist
 *   3. Applies each .sql file in migrations/ that hasn't been recorded yet
 *
 * Uses db.pool directly (not the wrapped db.query) so that connection errors
 * surface as hard failures rather than silently falling back to mock mode.
 * If any step fails, the error propagates and the server refuses to start.
 */

const fs = require('fs');
const path = require('path');
const db = require('./db');

const SCHEMA_FILE = path.join(__dirname, '..', 'schema_v1.sql');
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function runMigrations() {
  // Skip entirely in mock/test mode
  if (process.env.MOCK_DB === 'true' || !process.env.DATABASE_URL) {
    console.log('[Migrate] No DATABASE_URL or MOCK_DB=true — skipping migrations.');
    return;
  }

  // Use pool directly so errors propagate (db.query() silently falls back to mock on ENOTFOUND)
  const pool = db.pool;
  console.log('[Migrate] Starting migration check...');

  // ── 1. Ensure tracking table exists ──────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         SERIAL      PRIMARY KEY,
      name       TEXT        NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // ── 2. Apply base schema if the customers table doesn't exist ────────────
  const { rows: tableCheck } = await pool.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'customers'
    LIMIT 1
  `);

  if (tableCheck.length === 0) {
    console.log('[Migrate] Base schema missing — applying schema_v1.sql...');
    const schemaSql = fs.readFileSync(SCHEMA_FILE, 'utf8');
    await pool.query(schemaSql);
    await pool.query(
      `INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING`,
      ['schema_v1'],
    );
    console.log('[Migrate] schema_v1.sql applied successfully.');
  } else {
    console.log('[Migrate] Base schema already present — skipping schema_v1.sql.');
    // Record it even if it was applied outside this runner
    await pool.query(
      `INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING`,
      ['schema_v1'],
    );
  }

  // ── 3. Apply numbered migration files ────────────────────────────────────
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log('[Migrate] No migrations/ directory found — done.');
    return;
  }

  const { rows: appliedRows } = await pool.query(
    `SELECT name FROM schema_migrations`,
  );
  const applied = new Set(appliedRows.map((r) => r.name));

  // Sort alphabetically — zero-padded names (001_, 002_, …) guarantee order
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let newCount = 0;
  for (const file of files) {
    const name = path.basename(file, '.sql');
    if (applied.has(name)) {
      console.log(`[Migrate] ${file} — already applied, skipping.`);
      continue;
    }
    console.log(`[Migrate] Applying ${file}...`);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await pool.query(sql);
    await pool.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [name]);
    console.log(`[Migrate] ${file} — applied.`);
    newCount++;
  }

  if (newCount === 0) {
    console.log('[Migrate] All migrations already current — nothing to apply.');
  } else {
    console.log(`[Migrate] Done. ${newCount} new migration(s) applied.`);
  }
}

module.exports = { runMigrations };
