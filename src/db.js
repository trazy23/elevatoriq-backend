const { Pool } = require('pg');
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL || process.env.DATABASE_URL_;
const USE_MOCK_DB = process.env.MOCK_DB === 'true' || !DATABASE_URL;

let db = null;

if (USE_MOCK_DB) {
  console.log('[DB] Using MOCK database (in-memory for testing)');
  db = require('./db-mock');
} else {
  console.log('[DB] Using PostgreSQL (Supabase)');
  const needsSsl = /sslmode=require|render\.com/i.test(DATABASE_URL) || process.env.DATABASE_SSL === 'true';
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });

  pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err);
    console.log('[DB] Falling back to MOCK database');
    db = require('./db-mock');
  });

  db = {
    query: (text, params) => pool.query(text, params).catch(err => {
      if (err.code === 'ENOTFOUND' || err.message.includes('ENOTFOUND')) {
        console.error('[DB] Connection error, switching to MOCK:', err.message);
        // Fallback to mock DB on connection errors
        return require('./db-mock').query(text, params);
      }
      throw err;
    }),
    pool,
  };
}

module.exports = db;
