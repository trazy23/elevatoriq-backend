const db = require('../db');
const claudeService = require('../services/claudeService');
const benchmarkService = require('../services/benchmarkService');
const pdfService = require('../services/pdfService');
const emailService = require('../services/emailService');
const storageService = require('../services/storageService');
const { extractAllDocuments } = require('../services/extractionService');
const { validate } = require('../validation/extractionSchema');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

async function getCustomerEmail(caseId) {
  const result = await db.query(
    `SELECT c.customer_email, cu.email as cust_email
     FROM cases c
     LEFT JOIN customers cu ON c.customer_id = cu.id
     WHERE c.id = $1`,
    [caseId]
  );
  if (!result.rows.length) return null;
  return result.rows[0].customer_email || result.rows[0].cust_email || null;
}

// ■ CRITICAL: Strip vendor/building/owner names before insert
// In production, this should use NER or pattern matching
function anonymize(json) {
  const cleaned = { ...json };
  // Remove any fields that might contain identifying info
  delete cleaned.vendor_name;
  delete cleaned.building_name;
  delete cleaned.owner_name;
  delete cleaned.address;
  delete cleaned.contact;
  return cleaned;
}

async function saveExtraction(caseId, result) {
  let json;
  try {
    json = JSON.parse(result.extractionJson);
  } catch (e) {
    console.error('JSON parse failed for case', caseId, e.message);
    return null; // do not block customer report
  }

  const valid = validate(json);
  if (!valid) {
    console.error('Schema validation failed for case', caseId, validate.errors);
    return null; // do not block
  }

  const clean = anonymize(json);
  clean.case_id = caseId;

  // Insert into extractions_raw (append-only)
  const rawResult = await db.query(
    `INSERT INTO extractions_raw
     (case_id, module, state, market, equipment_type, contract_type,
      unit_count, confidence_overall, benchmark_version, raw_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id`,
    [
      caseId,
      clean.module,
      clean.state,
      clean.market,
      clean.equipment_type,
      clean.contract_type,
      clean.unit_count,
      clean.confidence_overall,
      clean.benchmark_version || '1.0',
      clean,
    ]
  );

  const extractionId = rawResult.rows[0].id;

  // Fan out to fact tables
  await saveFactTables(extractionId, clean);
  return extractionId;
}

async function saveFactTables(extractionId, json) {
  try {
    // facts_labor
    if (json.labor_data && json.labor_data.length) {
      for (const l of json.labor_data) {
        await db.query(
          `INSERT INTO facts_labor
           (extraction_id, state, market, equipment_type, contract_type,
            rate_regular, rate_overtime, overtime_multiplier, travel_minimum_hours)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            extractionId, json.state, json.market, json.equipment_type,
            json.contract_type,
            l.rate_regular, l.rate_overtime, l.overtime_multiplier, l.travel_minimum_hours,
          ]
        );
      }
    }

    // facts_line_items
    if (json.line_items && json.line_items.length) {
      for (const li of json.line_items) {
        await db.query(
          `INSERT INTO facts_line_items
           (extraction_id, taxonomy_category, description_normalized,
            amount_billed, labor_hours, scope_flag, billing_flag)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            extractionId, li.taxonomy_category, li.description_normalized,
            li.amount_billed, li.labor_hours, li.scope_flag, li.billing_flag,
          ]
        );
      }
    }

    // facts_parts
    if (json.parts_data && json.parts_data.length) {
      for (const p of json.parts_data) {
        await db.query(
          `INSERT INTO facts_parts
           (extraction_id, taxonomy_category, equipment_type,
            part_cost, material_markup_percent, parts_coverage_type)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            extractionId, p.taxonomy_category, json.equipment_type,
            p.part_cost, p.material_markup_percent, p.parts_coverage_type,
          ]
        );
      }
    }

    // facts_contract_terms
    const ct = json.contract_terms;
    if (ct && Object.keys(ct).length) {
      await db.query(
        `INSERT INTO facts_contract_terms
         (extraction_id, state, market, equipment_type, contract_type,
          base_price_per_unit, term_years, auto_renew_flag, escalation_type,
          escalation_percent, warranty_months, pm_frequency_per_year, after_hours_policy)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          extractionId, json.state, json.market, json.equipment_type, json.contract_type,
          ct.base_price_per_unit, ct.term_years, ct.auto_renew_flag, ct.escalation_type,
          ct.escalation_percent, ct.warranty_months, ct.pm_frequency_per_year, ct.after_hours_policy,
        ]
      );
    }
  } catch (err) {
    console.error('Fact table insert error for extraction', extractionId, err.message);
    // Non-blocking — don't fail the job
  }
}

// Main job processor
async function processCase(caseId) {
  console.log(`[Worker] Starting analysis for case: ${caseId}`);
  try {
    // 1. Load case from DB
    const caseResult = await db.query('SELECT * FROM cases WHERE id=$1', [caseId]);
    if (!caseResult.rows.length) throw new Error(`Case not found: ${caseId}`);
    const caseRow = caseResult.rows[0];

    // 2. Load documents
    const docs = await db.query('SELECT * FROM documents WHERE case_id=$1', [caseId]);
    if (!docs.rows.length) throw new Error('No documents found for case');

    // 3. Extract text from each document (PDF, DOCX, DOC)
    console.log(`[Worker] Extracting text from ${docs.rows.length} document(s)`);
    const combinedText = await extractAllDocuments(docs.rows);

    // 4. Get benchmark context
    const benchmarks = await benchmarkService.getBenchmarkContext(
      caseRow.state, caseRow.equipment_type
    );

    // 5. Call Claude API
    console.log(`[Worker] Calling Claude API for case: ${caseId}`);
    const analysisResult = await claudeService.analyze(
      combinedText, caseRow.review_type, benchmarks
    );

    // 6. Validate + save extraction (non-blocking on failure)
    if (analysisResult.extractionJson) {
      await saveExtraction(caseId, analysisResult);
    }

    // 7. Generate PDF
    const { key: pdfKey, buffer: pdfBuffer } = await pdfService.generateAndUploadPDF(
      analysisResult.reportBody, caseId, caseRow.review_type
    );

    // 8. Save report record with download token
    const token = uuidv4();
    await db.query(
      `INSERT INTO reports (case_id, storage_path, download_token) VALUES ($1,$2,$3)`,
      [caseId, pdfKey, token]
    );

    // 9. Send email (if we have an email address)
    const customerEmail = await getCustomerEmail(caseId);
    if (customerEmail) {
      await emailService.sendReport(customerEmail, pdfBuffer, caseRow.review_type, token);
      await db.query(`UPDATE reports SET emailed_at=NOW() WHERE download_token=$1`, [token]);
    }

    // 10. Mark case complete
    await db.query(
      `UPDATE cases SET status='complete', completed_at=NOW() WHERE id=$1`,
      [caseId]
    );
    console.log(`[Worker] Case complete: ${caseId}`);

  } catch (err) {
    console.error(`[Worker] Failed for case ${caseId}:`, err.message);
    await db.query(`UPDATE cases SET status='failed' WHERE id=$1`, [caseId]);
  }
}

// Bull queue integration
let queue = null;

function initQueue() {
  try {
    const Bull = require('bull');
    queue = new Bull('analysis', {
      redis: { host: process.env.REDIS_HOST || '127.0.0.1', port: 6379 }
    });
    queue.process(async (job) => {
      await processCase(job.data.caseId);
    });
    console.log('[Worker] Bull queue initialized');
  } catch (err) {
    console.warn('[Worker] Bull/Redis not available, using direct processing:', err.message);
    queue = null;
  }
}

async function addJob(caseId) {
  if (queue) {
    try {
      await queue.add({ caseId }, { attempts: 2, backoff: 5000 });
      return;
    } catch (err) {
      console.warn('[Worker] Bull queue unavailable, falling back to direct processing:', err.message);
      queue = null; // disable queue for future calls
    }
  }
  // Fallback: process directly (fine for local dev without Redis)
  setImmediate(() => processCase(caseId));
}

// Only initialize Bull queue if REDIS_ENABLED is explicitly set
if (process.env.REDIS_ENABLED === 'true') {
  initQueue();
} else {
  console.log('[Worker] Redis disabled — using direct processing (set REDIS_ENABLED=true to enable queue)');
}

module.exports = { addJob, processCase };
