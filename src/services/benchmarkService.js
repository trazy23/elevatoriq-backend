const db = require('../db');

async function getBenchmarkContext(state, equipment_type) {
  if (!state || !equipment_type) return '';

  const result = await db.query(`
    SELECT DISTINCT ON (dimension) dimension, median_value, p25_value,
           p75_value, sample_size, benchmark_version
    FROM benchmarks
    WHERE published = TRUE
      AND state = $1 AND equipment_type = $2
    ORDER BY dimension, benchmark_version DESC
  `, [state, equipment_type]);

  if (!result.rows.length) return '';

  let ctx = '[BENCHMARK CONTEXT]\n';
  result.rows.forEach(r => {
    ctx += `${r.dimension}: $${r.median_value} median `;
    ctx += `(p25=$${r.p25_value}, p75=$${r.p75_value}, `;
    ctx += `n=${r.sample_size}, v${r.benchmark_version})\n`;
  });
  return ctx;
}

module.exports = { getBenchmarkContext };
