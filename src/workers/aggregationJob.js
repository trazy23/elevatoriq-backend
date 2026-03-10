const db = require('../db');

async function getNextVersion() {
  const result = await db.query(
    `SELECT benchmark_version FROM benchmarks ORDER BY aggregated_at DESC LIMIT 1`
  );
  if (!result.rows.length) return '1.0';
  const current = parseFloat(result.rows[0].benchmark_version) || 1.0;
  return (current + 0.1).toFixed(1);
}

async function runAggregation() {
  console.log('[Aggregation] Starting aggregation job...');
  const VERSION = await getNextVersion();
  const MIN_SAMPLE = 25;

  // Labor rate aggregation
  const labor = await db.query(`
    SELECT state, market, equipment_type,
           COUNT(*) as n,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rate_regular) as median,
           PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY rate_regular) as p25,
           PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY rate_regular) as p75,
           AVG(rate_regular) as mean,
           STDDEV(rate_regular) as stddev
    FROM facts_labor
    WHERE rate_regular IS NOT NULL
    GROUP BY state, market, equipment_type
    HAVING COUNT(*) >= 10
  `);

  for (const row of labor.rows) {
    await db.query(
      `INSERT INTO benchmarks
       (benchmark_version, dimension, state, market, equipment_type,
        sample_size, median_value, p25_value, p75_value, mean_value, stddev_value, published)
       VALUES ($1,'labor_regular',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        VERSION, row.state, row.market, row.equipment_type,
        row.n, row.median, row.p25, row.p75, row.mean, row.stddev,
        row.n >= MIN_SAMPLE,
      ]
    );
  }

  // Overtime multiplier
  const overtime = await db.query(`
    SELECT state, market, equipment_type,
           COUNT(*) as n,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY overtime_multiplier) as median,
           PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY overtime_multiplier) as p25,
           PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY overtime_multiplier) as p75,
           AVG(overtime_multiplier) as mean,
           STDDEV(overtime_multiplier) as stddev
    FROM facts_labor
    WHERE overtime_multiplier IS NOT NULL
    GROUP BY state, market, equipment_type
    HAVING COUNT(*) >= 10
  `);

  for (const row of overtime.rows) {
    await db.query(
      `INSERT INTO benchmarks
       (benchmark_version, dimension, state, market, equipment_type,
        sample_size, median_value, p25_value, p75_value, mean_value, stddev_value, published)
       VALUES ($1,'overtime_multiplier',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        VERSION, row.state, row.market, row.equipment_type,
        row.n, row.median, row.p25, row.p75, row.mean, row.stddev,
        row.n >= MIN_SAMPLE,
      ]
    );
  }

  // Base price per unit from contract terms
  const basePrices = await db.query(`
    SELECT state, market, equipment_type, contract_type,
           COUNT(*) as n,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY base_price_per_unit) as median,
           PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY base_price_per_unit) as p25,
           PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY base_price_per_unit) as p75,
           AVG(base_price_per_unit) as mean,
           STDDEV(base_price_per_unit) as stddev
    FROM facts_contract_terms
    WHERE base_price_per_unit IS NOT NULL
    GROUP BY state, market, equipment_type, contract_type
    HAVING COUNT(*) >= 10
  `);

  for (const row of basePrices.rows) {
    await db.query(
      `INSERT INTO benchmarks
       (benchmark_version, dimension, state, market, equipment_type, contract_type,
        sample_size, median_value, p25_value, p75_value, mean_value, stddev_value, published)
       VALUES ($1,'base_price_per_unit',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        VERSION, row.state, row.market, row.equipment_type, row.contract_type,
        row.n, row.median, row.p25, row.p75, row.mean, row.stddev,
        row.n >= MIN_SAMPLE,
      ]
    );
  }

  // Escalation percent
  const escalation = await db.query(`
    SELECT state, market, equipment_type,
           COUNT(*) as n,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY escalation_percent) as median,
           PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY escalation_percent) as p25,
           PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY escalation_percent) as p75,
           AVG(escalation_percent) as mean,
           STDDEV(escalation_percent) as stddev
    FROM facts_contract_terms
    WHERE escalation_percent IS NOT NULL
    GROUP BY state, market, equipment_type
    HAVING COUNT(*) >= 10
  `);

  for (const row of escalation.rows) {
    await db.query(
      `INSERT INTO benchmarks
       (benchmark_version, dimension, state, market, equipment_type,
        sample_size, median_value, p25_value, p75_value, mean_value, stddev_value, published)
       VALUES ($1,'escalation_percent',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        VERSION, row.state, row.market, row.equipment_type,
        row.n, row.median, row.p25, row.p75, row.mean, row.stddev,
        row.n >= MIN_SAMPLE,
      ]
    );
  }

  // Warranty months
  const warranty = await db.query(`
    SELECT state, market, equipment_type,
           COUNT(*) as n,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY warranty_months) as median,
           PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY warranty_months) as p25,
           PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY warranty_months) as p75,
           AVG(warranty_months) as mean,
           STDDEV(warranty_months) as stddev
    FROM facts_contract_terms
    WHERE warranty_months IS NOT NULL
    GROUP BY state, market, equipment_type
    HAVING COUNT(*) >= 10
  `);

  for (const row of warranty.rows) {
    await db.query(
      `INSERT INTO benchmarks
       (benchmark_version, dimension, state, market, equipment_type,
        sample_size, median_value, p25_value, p75_value, mean_value, stddev_value, published)
       VALUES ($1,'warranty_months',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        VERSION, row.state, row.market, row.equipment_type,
        row.n, row.median, row.p25, row.p75, row.mean, row.stddev,
        row.n >= MIN_SAMPLE,
      ]
    );
  }

  console.log(`[Aggregation] Complete. Version: ${VERSION}`);
  return VERSION;
}

// Allow running directly: node aggregationJob.js
if (require.main === module) {
  runAggregation()
    .then(v => { console.log('Done. Version:', v); process.exit(0); })
    .catch(err => { console.error('Aggregation failed:', err); process.exit(1); });
}

module.exports = { runAggregation };
