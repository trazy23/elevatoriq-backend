const { Pool } = require('pg');
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL || process.env.DATABASE_URL_;

const pool = new Pool({
  connectionString: DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected DB pool error', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
