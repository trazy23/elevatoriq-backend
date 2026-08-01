const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const db = require('../db');
const { extractTextFromBuffer } = require('../services/extractionService');
const {
  buildFactsFromTerms,
  parseContractTermsFromText,
  calculatePortfolioWatchPrice,
  computeCancellationDeadline,
  buildRenewalAlertRows,
  reviewDocumentAgainstContract,
  asNumber,
  toIsoDate,
} = require('../services/contractAwareService');

const MAX_UPLOAD_FILE_SIZE_BYTES = 50 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_FILE_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (['.pdf', '.docx', '.doc', '.txt'].includes(ext)) return cb(null, true);
    cb(new Error('Unsupported contract file type. PDF, DOC, DOCX, or TXT only.'));
  },
});

function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

function parseBooleanLike(value) {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined || value === '') return null;
  return /yes|true|auto|renew/i.test(String(value));
}

async function upsertCustomer(email, company = null, name = null) {
  const normalized = normalizeEmail(email);
  if (!normalized) throw Object.assign(new Error('Valid email is required'), { status: 400 });
  const result = await db.query(
    `INSERT INTO customers (email, company, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE
       SET company = COALESCE(EXCLUDED.company, customers.company),
           name = COALESCE(EXCLUDED.name, customers.name),
           updated_at = NOW()
     RETURNING *`,
    [normalized, company || null, name || null]
  );
  return result.rows[0];
}

async function getOrg(orgId) {
  const result = await db.query('SELECT * FROM organizations WHERE id=$1', [orgId]);
  return result.rows[0] || null;
}

async function getActiveContractForUnit(unitId, propertyId = null) {
  let result;
  if (unitId) {
    result = await db.query(
      `SELECT pc.*
       FROM portfolio_contracts pc
       JOIN contract_units cu ON cu.contract_id = pc.id
       WHERE cu.unit_id=$1 AND pc.status='active'
       ORDER BY pc.created_at DESC
       LIMIT 1`,
      [unitId]
    );
  } else if (propertyId) {
    result = await db.query(
      `SELECT * FROM portfolio_contracts
       WHERE property_id=$1 AND status='active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [propertyId]
    );
  } else {
    return null;
  }
  return result.rows[0] || null;
}

async function getFactsForContract(contractId) {
  if (!contractId) return [];
  const result = await db.query(
    `SELECT * FROM extracted_facts WHERE contract_id=$1 ORDER BY field_name ASC, created_at DESC`,
    [contractId]
  );
  return result.rows;
}

async function getUnitHistory(unitId) {
  if (!unitId) return [];
  const result = await db.query(
    `SELECT id, review_type, decision_status, one_line_why, created_at
     FROM portfolio_reviews
     WHERE unit_id=$1
     ORDER BY created_at DESC
     LIMIT 10`,
    [unitId]
  );
  return result.rows;
}

router.get('/pricing', (req, res) => {
  const units = Number(req.query.units || 0);
  res.json({ pricing: calculatePortfolioWatchPrice(units) });
});

router.post('/organizations', async (req, res) => {
  try {
    const { email, company, name, organization_name, type = 'pm_firm' } = req.body;
    const customer = await upsertCustomer(email, company || organization_name, name);
    const orgName = organization_name || company || `${customer.email} Portfolio`;
    const result = await db.query(
      `INSERT INTO organizations (customer_id, name, type)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [customer.id, orgName, type]
    );
    res.json({ organization: result.rows[0], customer });
  } catch (err) {
    console.error('POST /portfolio/organizations error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to create organization' });
  }
});

router.get('/organizations/:orgId/overview', async (req, res) => {
  try {
    const { orgId } = req.params;
    const org = await getOrg(orgId);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const [properties, units, contracts, reviews, alerts] = await Promise.all([
      db.query('SELECT * FROM properties WHERE org_id=$1 ORDER BY created_at ASC', [orgId]),
      db.query(
        `SELECT eu.*, p.name AS property_name
         FROM elevator_units eu
         JOIN properties p ON p.id = eu.property_id
         WHERE p.org_id=$1
         ORDER BY p.name ASC, eu.label ASC`,
        [orgId]
      ),
      db.query(
        `SELECT pc.*, p.name AS property_name,
                COALESCE(json_agg(cu.unit_id) FILTER (WHERE cu.unit_id IS NOT NULL), '[]') AS unit_ids
         FROM portfolio_contracts pc
         JOIN properties p ON p.id = pc.property_id
         LEFT JOIN contract_units cu ON cu.contract_id = pc.id
         WHERE p.org_id=$1
         GROUP BY pc.id, p.name
         ORDER BY pc.created_at DESC`,
        [orgId]
      ),
      db.query(
        `SELECT pr.*, p.name AS property_name, eu.label AS unit_label
         FROM portfolio_reviews pr
         JOIN properties p ON p.id = pr.property_id
         LEFT JOIN elevator_units eu ON eu.id = pr.unit_id
         WHERE pr.org_id=$1
         ORDER BY pr.created_at DESC
         LIMIT 20`,
        [orgId]
      ),
      db.query(
        `SELECT pa.*, pc.vendor, p.name AS property_name
         FROM portfolio_alerts pa
         JOIN portfolio_contracts pc ON pc.id = pa.contract_id
         JOIN properties p ON p.id = pc.property_id
         WHERE pa.org_id=$1 AND pa.status='scheduled'
         ORDER BY pa.trigger_date ASC
         LIMIT 20`,
        [orgId]
      ),
    ]);

    const enrolledUnits = units.rows.filter((unit) => unit.enrolled);
    const totalMonthlyContractSpend = contracts.rows.reduce((sum, contract) => sum + (asNumber(contract.monthly_price) || 0), 0);
    const missingSetup = [];
    if (!properties.rows.length) missingSetup.push('Add first property');
    if (!units.rows.length) missingSetup.push('Add elevator units');
    if (!contracts.rows.length) missingSetup.push('Upload or enter active maintenance contract');
    for (const unit of units.rows) {
      const hasContract = contracts.rows.some((contract) => Array.isArray(contract.unit_ids) && contract.unit_ids.includes(unit.id));
      if (!hasContract) missingSetup.push(`${unit.property_name} / ${unit.label}: link active contract`);
    }

    res.json({
      organization: org,
      properties: properties.rows,
      units: units.rows,
      contracts: contracts.rows,
      reviews: reviews.rows,
      alerts: alerts.rows,
      summary: {
        enrolled_units: enrolledUnits.length,
        pricing: calculatePortfolioWatchPrice(enrolledUnits.length),
        total_monthly_contract_spend: totalMonthlyContractSpend,
        total_annual_contract_spend: totalMonthlyContractSpend * 12,
        red_or_yellow_open_items: reviews.rows.filter((r) => ['red', 'yellow'].includes(r.decision_status)).length,
        cancellation_deadlines_next_120: alerts.rows.length,
        missing_setup: Array.from(new Set(missingSetup)).slice(0, 10),
      },
    });
  } catch (err) {
    console.error('GET /portfolio/organizations/:orgId/overview error:', err);
    res.status(500).json({ error: err.message || 'Failed to load portfolio overview' });
  }
});

router.post('/properties', async (req, res) => {
  try {
    const { org_id, name, address, building_type, notes } = req.body;
    if (!org_id || !name) return res.status(400).json({ error: 'org_id and name are required' });
    const result = await db.query(
      `INSERT INTO properties (org_id, name, address, building_type, notes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [org_id, name, address || null, building_type || null, notes || null]
    );
    res.json({ property: result.rows[0] });
  } catch (err) {
    console.error('POST /portfolio/properties error:', err);
    res.status(500).json({ error: err.message || 'Failed to create property' });
  }
});

router.post('/units', async (req, res) => {
  try {
    const {
      property_id, label, unit_type = 'passenger', manufacturer, model, controller_type,
      drive_type, install_year, last_mod_year, capacity_lbs, speed_fpm, floors_served,
      enrolled = true, notes,
    } = req.body;
    if (!property_id || !label) return res.status(400).json({ error: 'property_id and label are required' });
    const result = await db.query(
      `INSERT INTO elevator_units
       (property_id, label, unit_type, manufacturer, model, controller_type, drive_type,
        install_year, last_mod_year, capacity_lbs, speed_fpm, floors_served, enrolled, enrolled_at, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, CASE WHEN $13 THEN NOW() ELSE NULL END, $14)
       RETURNING *`,
      [property_id, label, unit_type, manufacturer || null, model || null, controller_type || null,
        drive_type || null, install_year || null, last_mod_year || null, capacity_lbs || null,
        speed_fpm || null, floors_served || null, Boolean(enrolled), notes || null]
    );
    res.json({ unit: result.rows[0] });
  } catch (err) {
    console.error('POST /portfolio/units error:', err);
    res.status(500).json({ error: err.message || 'Failed to create unit' });
  }
});

router.post('/contracts/extract', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Contract file is required' });
    const ext = path.extname(req.file.originalname || '').toLowerCase();
    let text;
    if (ext === '.txt') {
      text = req.file.buffer.toString('utf8');
    } else {
      text = await extractTextFromBuffer(req.file.buffer, ext, req.file.originalname);
    }
    const extraction = parseContractTermsFromText(text);
    res.json({
      filename: req.file.originalname,
      ...extraction,
      preview_text: text.slice(0, 1500),
      warning: 'Heuristic extraction is confirm-before-reliance. Every material field should be reviewed against its source snippet.',
    });
  } catch (err) {
    console.error('POST /portfolio/contracts/extract error:', err);
    res.status(500).json({ error: err.message || 'Failed to extract contract terms' });
  }
});

router.post('/contracts', async (req, res) => {
  try {
    const { org_id, property_id, unit_ids = [], terms = {}, coverage_level, status = 'active' } = req.body;
    if (!org_id || !property_id) return res.status(400).json({ error: 'org_id and property_id are required' });

    const facts = buildFactsFromTerms(terms);
    const endDate = toIsoDate(terms.end_date?.value || terms.end_date);
    const cancellationNotice = Number(terms.cancellation_notice_days?.value || terms.cancellation_notice_days) || null;
    const cancellationDeadline = computeCancellationDeadline({ end_date: endDate, cancellation_notice_days: cancellationNotice });

    const contractResult = await db.query(
      `INSERT INTO portfolio_contracts
       (property_id, vendor, monthly_price, annual_price, start_date, end_date,
        auto_renew, renewal_term_months, cancellation_notice_days, cancellation_deadline,
        coverage_level, escalation_terms, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        property_id,
        terms.vendor?.value || terms.vendor || null,
        asNumber(terms.monthly_price?.value || terms.monthly_price),
        asNumber(terms.annual_price?.value || terms.annual_price),
        toIsoDate(terms.start_date?.value || terms.start_date),
        endDate,
        parseBooleanLike(terms.auto_renew?.value ?? terms.auto_renew),
        Number(terms.renewal_term_months?.value || terms.renewal_term_months) || null,
        cancellationNotice,
        cancellationDeadline,
        coverage_level || terms.coverage_level?.value || terms.coverage_level || null,
        terms.escalation_terms?.value || terms.escalation_terms || null,
        status,
      ]
    );
    const contract = contractResult.rows[0];

    for (const unitId of unit_ids) {
      await db.query(
        `INSERT INTO contract_units (contract_id, unit_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [contract.id, unitId]
      );
    }

    for (const fact of facts) {
      await db.query(
        `INSERT INTO extracted_facts
         (contract_id, field_name, field_value, confidence, source_snippet)
         VALUES ($1,$2,$3,$4,$5)`,
        [contract.id, fact.field_name, fact.field_value, fact.confidence, fact.source_snippet]
      );
    }

    const cancellationFact = facts.find((fact) => fact.field_name === 'cancellation_notice_days' || fact.field_name === 'auto_renew');
    if (cancellationDeadline && cancellationFact?.source_snippet) {
      for (const alert of buildRenewalAlertRows({ orgId: org_id, contractId: contract.id, cancellationDeadline, sourceSnippet: cancellationFact.source_snippet })) {
        await db.query(
          `INSERT INTO portfolio_alerts (org_id, contract_id, alert_type, trigger_date, source_snippet)
           VALUES ($1,$2,$3,$4,$5)`,
          [alert.org_id, alert.contract_id, alert.alert_type, alert.trigger_date, alert.source_snippet]
        );
      }
    }

    const savedFacts = await getFactsForContract(contract.id);
    res.json({ contract, facts: savedFacts });
  } catch (err) {
    console.error('POST /portfolio/contracts error:', err);
    res.status(500).json({ error: err.message || 'Failed to create contract memory' });
  }
});

router.post('/facts/:factId/confirm', async (req, res) => {
  try {
    const { factId } = req.params;
    const { value, corrected_by } = req.body;
    const result = await db.query(
      `UPDATE extracted_facts
       SET user_confirmed=TRUE,
           user_corrected_value=COALESCE($2, field_value),
           corrected_by=$3,
           corrected_at=NOW()
       WHERE id=$1
       RETURNING *`,
      [factId, value === undefined ? null : String(value), corrected_by || null]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Fact not found' });
    res.json({ fact: result.rows[0] });
  } catch (err) {
    console.error('POST /portfolio/facts/:factId/confirm error:', err);
    res.status(500).json({ error: err.message || 'Failed to confirm fact' });
  }
});

router.post('/reviews/run', async (req, res) => {
  try {
    const { org_id, property_id, unit_id = null, review_type, document_text, amount = null } = req.body;
    if (!org_id || !property_id || !review_type || !document_text) {
      return res.status(400).json({ error: 'org_id, property_id, review_type, and document_text are required' });
    }
    const propertyResult = await db.query('SELECT * FROM properties WHERE id=$1', [property_id]);
    if (!propertyResult.rows.length) return res.status(404).json({ error: 'Property not found' });
    const unitResult = unit_id ? await db.query('SELECT * FROM elevator_units WHERE id=$1', [unit_id]) : { rows: [] };
    const contract = await getActiveContractForUnit(unit_id, property_id);
    const facts = await getFactsForContract(contract?.id);
    const unitHistory = await getUnitHistory(unit_id);

    const analysis = reviewDocumentAgainstContract({
      reviewType: review_type,
      documentText: document_text,
      amount,
      contract,
      facts,
      property: propertyResult.rows[0],
      unit: unitResult.rows[0] || null,
      unitHistory,
    });

    const reviewResult = await db.query(
      `INSERT INTO portfolio_reviews
       (org_id, property_id, unit_id, review_type, decision_status, one_line_why, summary,
        next_steps, missing_information, what_to_upload_next, escalated, escalation_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [org_id, property_id, unit_id, review_type, analysis.decision_status, analysis.one_line_why,
        analysis.summary, JSON.stringify(analysis.next_steps), JSON.stringify(analysis.missing_information),
        JSON.stringify(analysis.what_to_upload_next), analysis.escalated, analysis.escalation_reason]
    );
    const review = reviewResult.rows[0];

    for (const finding of analysis.findings) {
      await db.query(
        `INSERT INTO portfolio_findings
         (review_id, severity, category, title, detail, contract_reference, dollar_estimate, source_snippet)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [review.id, finding.severity, finding.category, finding.title, finding.detail,
          finding.contract_reference || null, finding.dollar_estimate || null, finding.source_snippet || finding.contract_reference || null]
      );
    }
    const emailResult = await db.query(
      `INSERT INTO vendor_emails (review_id, subject, body) VALUES ($1,$2,$3) RETURNING *`,
      [review.id, analysis.vendor_email.subject, analysis.vendor_email.body]
    );

    const findingsResult = await db.query('SELECT * FROM portfolio_findings WHERE review_id=$1 ORDER BY created_at ASC', [review.id]);
    res.json({ review, findings: findingsResult.rows, vendor_email: emailResult.rows[0], contract, facts });
  } catch (err) {
    console.error('POST /portfolio/reviews/run error:', err);
    res.status(500).json({ error: err.message || 'Failed to run contract-aware review' });
  }
});

module.exports = router;
