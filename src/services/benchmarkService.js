const db = require('../db');

async function getBenchmarkContext(state, equipment_type) {
  let ctx = '';

  // 1. Static published benchmarks (manually curated)
  if (state && equipment_type) {
    try {
      const result = await db.query(`
        SELECT DISTINCT ON (dimension) dimension, median_value, p25_value,
               p75_value, sample_size, benchmark_version
        FROM benchmarks
        WHERE published = TRUE
          AND state = $1 AND equipment_type = $2
        ORDER BY dimension, benchmark_version DESC
      `, [state, equipment_type]);

      if (result.rows.length) {
        ctx += '[BENCHMARK CONTEXT — Published Data]\n';
        result.rows.forEach(r => {
          ctx += `${r.dimension}: $${r.median_value} median `;
          ctx += `(p25=$${r.p25_value}, p75=$${r.p75_value}, n=${r.sample_size})\n`;
        });
      }
    } catch (err) {
      console.warn('[Benchmark] Static benchmark query failed:', err.message);
    }
  }

  // 2. Live pricing from real submissions
  try {
    const params = [];
    let whereClause = `WHERE raw_json->>'contract_value' IS NOT NULL
      AND (raw_json->>'contract_value')::numeric > 0`;

    if (equipment_type) {
      params.push(equipment_type);
      whereClause += ` AND equipment_type = $${params.length}`;
    }
    if (state) {
      params.push(state);
      whereClause += ` AND state = $${params.length}`;
    }

    const submissions = await db.query(`
      SELECT raw_json, created_at
      FROM extractions_raw
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT 50
    `, params);

    if (submissions.rows.length >= 2) {
      const values = submissions.rows
        .map(r => {
          const v = parseFloat(r.raw_json?.contract_value);
          return isNaN(v) ? null : v;
        })
        .filter(v => v !== null && v > 0)
        .sort((a, b) => a - b);

      if (values.length >= 2) {
        const median = values[Math.floor(values.length / 2)];
        const p25 = values[Math.floor(values.length * 0.25)];
        const p75 = values[Math.floor(values.length * 0.75)];
        const fmt = n => '$' + Math.round(n).toLocaleString();

        const scopeCounts = {};
        submissions.rows.forEach(r => {
          const s = r.raw_json?.scope_type;
          if (s) scopeCounts[s] = (scopeCounts[s] || 0) + 1;
        });
        const topScopes = Object.entries(scopeCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([k, v]) => `${k} (${v})`)
          .join(', ');

        ctx += `\n[MARKET PRICING — ${values.length} real ${equipment_type || 'elevator'} submissions${state ? ` in ${state}` : ''}]\n`;
        ctx += `Contract value range: ${fmt(values[0])}–${fmt(values[values.length - 1])}\n`;
        ctx += `Median: ${fmt(median)} | p25: ${fmt(p25)} | p75: ${fmt(p75)}\n`;
        if (topScopes) ctx += `Common scope types: ${topScopes}\n`;
        ctx += `Note: This is anonymized market data from similar projects submitted to ElevatorIQ.\n`;
      }
    }
  } catch (err) {
    console.warn('[Benchmark] Live submission query failed:', err.message);
  }

  return ctx;
}

module.exports = { getBenchmarkContext };
