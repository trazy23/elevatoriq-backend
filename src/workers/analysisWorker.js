const db = require('../db');
const claudeService = require('../services/claudeService');
const benchmarkService = require('../services/benchmarkService');
const knowledgeService = require('../services/knowledgeService');
const pdfService = require('../services/pdfService');
const emailService = require('../services/emailService');
const storageService = require('../services/storageService');
const { extractAllDocuments } = require('../services/extractionService');
const { validate } = require('../validation/extractionSchema');
const { inferReviewTypeFromDocuments } = require('../services/documentTypeService');
const { randomUUID } = require('crypto');
const uuidv4 = () => randomUUID();
const { getStructuredReportKey } = require('../utils/reportArtifacts');
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

async function getCustomerInfo(caseId) {
  const result = await db.query(
    `SELECT c.customer_email, cu.email as cust_email, cu.name, cu.company
     FROM cases c
     LEFT JOIN customers cu ON c.customer_id = cu.id
     WHERE c.id = $1`,
    [caseId]
  );
  if (!result.rows.length) return { email: null, name: null, company: null };
  const row = result.rows[0];
  return {
    email: row.customer_email || row.cust_email || null,
    name: row.name || null,
    company: row.company || null,
  };
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
  try {
    const json = JSON.parse(result.extractionJson);
    const insertResult = await db.query(
      `INSERT INTO extractions_raw
       (case_id, module, state, market, equipment_type, contract_type,
        unit_count, confidence_overall, benchmark_version, raw_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        caseId,
        json.module || null,
        json.state || null,
        json.market || null,
        json.equipment_type || null,
        json.contract_type || null,
        json.unit_count || null,
        json.confidence_overall || null,
        json.benchmark_version || '1.0',
        json,
      ]
    );
    console.log(`[Analysis] Extraction saved for case ${caseId}`);
    return insertResult.rows[0]?.id;
  } catch (err) {
    console.warn(`[Analysis] saveExtraction failed for ${caseId}:`, err.message);
    return null;
  }
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

function computeVerbatimOverlapScore(sourceText = '', reportBody = '') {
  const source = String(sourceText || '');
  const report = String(reportBody || '');
  if (!source || !report) return 0;

  const candidateLines = report
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length >= 140);

  if (!candidateLines.length) return 0;
  const copiedLines = candidateLines.filter((line) => source.includes(line)).length;
  return copiedLines / candidateLines.length;
}

function isReportDeliverable(reportBody = '', sourceText = '') {
  const text = String(reportBody || '');
  const hasSections = /SECTION\s+1/i.test(text) && /SECTION\s+2/i.test(text);
  const hasDecisionSignals = /(Recommendation|Risk|Assessment|Bottom Line)/i.test(text);
  // Catch legacy fallback text AND the new honest error message format
  const looksLikeFallback = /DOCUMENT PREVIEW|Automated fallback report|ANALYSIS INCOMPLETE|PROCESSING ERROR/i.test(text);
  const overlapScore = computeVerbatimOverlapScore(sourceText, text);
  const isLikelySourceCopy = overlapScore > 0.35;

  return hasSections && hasDecisionSignals && !looksLikeFallback && !isLikelySourceCopy && text.length > 1200;
}

async function persistStructuredReport(caseId, caseRow, docs, analysisResult, extractionId) {
  const payload = {
    case_id: caseId,
    review_type: caseRow.review_type,
    module: caseRow.module,
    status: 'complete',
    generated_at: new Date().toISOString(),
    source_documents: docs.rows.map((doc) => ({
      id: doc.id,
      file_name: doc.file_name,
      file_type: doc.file_type,
      storage_path: doc.storage_path,
      uploaded_at: doc.uploaded_at,
    })),
    report_body: analysisResult.reportBody,
    extraction_json: analysisResult.extractionJson ? JSON.parse(analysisResult.extractionJson) : null,
    extraction_id: extractionId,
  };

  const key = getStructuredReportKey(caseId);
  await storageService.uploadBuffer(
    Buffer.from(JSON.stringify(payload, null, 2), 'utf8'),
    key,
    'application/json'
  );

  return key;
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

    // 2b. Safety-net: resolve 'auto' review type here in the worker if it wasn't
    //     resolved upstream (e.g. race condition, old flow, direct job enqueue).
    //     Without this, Claude gets the generic default template and the quality
    //     gate rejects the output, marking the case failed.
    if (!caseRow.review_type || caseRow.review_type === 'auto') {
      const resolvedType = inferReviewTypeFromDocuments(docs.rows);
      const moduleMap = { invoice_review: 'A', contract_coverage: 'A' };
      const resolvedModule = moduleMap[resolvedType] || 'B';
      await db.query(
        `UPDATE cases SET review_type=$2, module=$3 WHERE id=$1`,
        [caseId, resolvedType, resolvedModule]
      );
      caseRow.review_type = resolvedType;
      caseRow.module = resolvedModule;
      console.log(`[Worker] Resolved 'auto' review_type to '${resolvedType}' for case ${caseId}`);
    }

    // 3. Extract text from each document (PDF, DOCX, DOC)
    console.log(`[Worker] Extracting text from ${docs.rows.length} document(s)`);
    const combinedText = await extractAllDocuments(docs.rows, caseRow.review_type);

    // 4. Get benchmark context + knowledge base context
    const [benchmarks, knowledge] = await Promise.all([
      benchmarkService.getBenchmarkContext(caseRow.state, caseRow.equipment_type),
      knowledgeService.getKnowledgeContext(caseRow.state, caseRow.equipment_type, caseRow.review_type),
    ]);
    const contextBlock = [benchmarks, knowledge].filter(Boolean).join('\n\n');

    // 5. Call Claude API
    console.log(`[Worker] Calling Claude API for case: ${caseId}`);
    const analysisResult = await claudeService.analyze(
      combinedText, caseRow.review_type, contextBlock
    );

    // Quality gate: verify analysis output meets minimum standards
    if (!isReportDeliverable(analysisResult.reportBody, combinedText)) {
      const customerEmail = await getCustomerEmail(caseId);
      if (customerEmail) {
        try {
          await emailService.sendQualityFailure(customerEmail, caseRow.review_type, caseId);
        } catch (emailErr) {
          console.warn(`[Worker] Quality failure email failed for ${caseId}: ${emailErr.message}`);
        }
      }
      throw new Error('Analysis output failed deliverable quality gate');
    }

    // 6. Validate + save extraction (non-blocking on failure)
    let extractionId = null;
    if (analysisResult.extractionJson) {
      extractionId = await saveExtraction(caseId, analysisResult);
      // Populate fact tables from the parsed extraction JSON so the portfolio
      // intelligence layer has structured data to query across cases.
      if (extractionId) {
        try {
          const extJson = JSON.parse(analysisResult.extractionJson);
          await saveFactTables(extractionId, extJson);
        } catch (factErr) {
          console.warn(`[Worker] saveFactTables failed for ${caseId}:`, factErr.message);
          // Non-blocking — fact table failure must not fail the job
        }
      }
    }

    // 6b. Parse ElevatorIQ assessment from extraction JSON and persist to cases table
    // score_label is the source of truth (High Performance / Moderate Inefficiencies / High Risk)
    // elevatoriq_score is derived: 85 / 60 / 25 — used only for gauge position, never shown as a number
    const LABEL_TO_SCORE = { 'High Performance': 85, 'Moderate Inefficiencies': 60, 'High Risk': 25 };
    let elevatoriqScore = null;
    if (analysisResult.extractionJson) {
      try {
        const extData = JSON.parse(analysisResult.extractionJson);
        // Prefer score_label; fall back to numeric elevatoriq_score if label absent
        const label = extData.score_label;
        if (label && LABEL_TO_SCORE[label] !== undefined) {
          elevatoriqScore = LABEL_TO_SCORE[label];
        } else {
          const raw = extData.elevatoriq_score;
          if (raw !== null && raw !== undefined) {
            const parsed = Math.round(Number(raw));
            if (!isNaN(parsed)) elevatoriqScore = Math.max(0, Math.min(100, parsed));
          }
        }
        if (elevatoriqScore !== null) {
          await db.query(`UPDATE cases SET elevatoriq_score=$2 WHERE id=$1`, [caseId, elevatoriqScore]);
          console.log(`[Worker] ElevatorIQ Assessment for case ${caseId}: ${label || elevatoriqScore}`);
        }
      } catch (err) {
        console.warn(`[Worker] Score parse failed for ${caseId}:`, err.message);
      }
    }

    // 6c. Fallback: if score still null (extraction JSON absent or malformed),
    //     derive it from HIGH/MEDIUM/LOW flag counts in the report body.
    //     This ensures the cover page score gauge always renders.
    if (elevatoriqScore === null && analysisResult.reportBody) {
      try {
        const body = analysisResult.reportBody;
        const highCount = (body.match(/^\[HIGH\]/gm) || []).length;
        const medCount  = (body.match(/^\[MEDIUM\]/gm) || []).length;
        if (highCount >= 4) {
          elevatoriqScore = 25; // High Risk
        } else if (highCount >= 2 || medCount >= 3) {
          elevatoriqScore = 60; // Moderate Inefficiencies
        } else {
          elevatoriqScore = 85; // High Performance
        }
        await db.query(`UPDATE cases SET elevatoriq_score=$2 WHERE id=$1`, [caseId, elevatoriqScore]);
        console.log(`[Worker] Score derived from flags for case ${caseId}: ${elevatoriqScore} (HIGH:${highCount} MED:${medCount})`);
      } catch (err) {
        console.warn(`[Worker] Flag-based score fallback failed for ${caseId}:`, err.message);
      }
    }

    // 7. Persist structured report JSON artifact (non-blocking)
    let structuredReportPath = null;
    try {
      structuredReportPath = await persistStructuredReport(caseId, caseRow, docs, analysisResult, extractionId);
    } catch (err) {
      console.warn(`[Worker] Structured report artifact upload failed for ${caseId}:`, err.message);
    }

    // ── Free-tier path: skip PDF and report email ──────────────────────────
    // Free users get a diagnostic view in the browser. PDF/QR/email are paid
    // deliverables. Full analysis still runs — gating is output-only.
    const isFreeCase = caseRow.payment_status === 'free';
    const { email: customerEmail, name: customerName, company: customerCompany } = await getCustomerInfo(caseId);

    if (!isFreeCase) {
      // 8. Generate download token first (so QR code can embed the link)
      const token = uuidv4();

      // 9. Generate PDF with QR code pointing to the download URL
      const { key: pdfKey, buffer: pdfBuffer } = await pdfService.generateAndUploadPDF(
        analysisResult.reportBody, caseId, caseRow.review_type, token, elevatoriqScore
      );
      await db.query(
        `INSERT INTO reports (case_id, storage_path, download_token) VALUES ($1,$2,$3)`,
        [caseId, pdfKey, token]
      );

      // 10. Send report email (paid users only)
      if (customerEmail) {
        try {
          await emailService.sendReport(customerEmail, pdfBuffer, caseRow.review_type, token, customerName, customerCompany);
          await db.query(`UPDATE reports SET emailed_at=NOW() WHERE download_token=$1`, [token]);
          console.log(`[Worker] Email sent to ${customerEmail} for case ${caseId}`);
        } catch (emailErr) {
          console.warn(`[Worker] Email send failed for case ${caseId}: ${emailErr.message}`);
        }
      }
    } else {
      console.log(`[Worker] Free case ${caseId} — skipping PDF generation and report email`);
    }

    // 10b. Schedule nurture sequence for free-tier users (fire-and-forget)
    if (isFreeCase && customerEmail) {
      try {
        const { scheduleNurtureSequence } = require('../services/nurtureService');
        await scheduleNurtureSequence(caseId, customerEmail, customerName);
      } catch (nurtureErr) {
        console.warn(`[Worker] Failed to schedule nurture sequence for ${caseId}: ${nurtureErr.message}`);
        // Non-blocking — don't prevent case completion
      }
    }

    // 11. Mark case complete
    await db.query(
      `UPDATE cases SET status='complete', completed_at=NOW() WHERE id=$1`,
      [caseId]
    );
    console.log(`[Worker] Case complete: ${caseId}`);
    if (structuredReportPath) {
      console.log(`[Worker] Structured report artifact: ${structuredReportPath}`);
    }

  } catch (err) {
    console.error(`[Worker] Failed for case ${caseId}:`, err.message);
    await db.query(`UPDATE cases SET status='failed' WHERE id=$1`, [caseId]);
  }
}

// ─── Concurrency control ──────────────────────────────────────────────────────
// Max simultaneous analyses. Each job spawns a Claude API call (~5-10 min)
// and a Puppeteer instance (~200-400MB RAM). Keep this at 2 for safety on
// standard Render instances; raise only if you have confirmed available RAM.
const WORKER_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || 2);
const WORKER_JOB_TIMEOUT_MS = Number(process.env.WORKER_JOB_TIMEOUT_MS || 15 * 60 * 1000);

// ─── In-process semaphore (used when Redis/Bull is unavailable) ───────────────
// Prevents simultaneous Puppeteer/Claude blowouts on the fallback path.
class Semaphore {
  constructor(limit) {
    this._limit = limit;
    this._active = 0;
    this._queue = [];
  }
  acquire() {
    return new Promise((resolve) => {
      const attempt = () => {
        if (this._active < this._limit) {
          this._active++;
          resolve();
        } else {
          this._queue.push(attempt);
        }
      };
      attempt();
    });
  }
  release() {
    this._active--;
    if (this._queue.length > 0) {
      const next = this._queue.shift();
      next();
    }
  }
  get active() { return this._active; }
  get waiting() { return this._queue.length; }
}
const fallbackSemaphore = new Semaphore(WORKER_CONCURRENCY);

// Bull queue integration
let queue = null;

function withWorkerTimeout(caseId, work) {
  return Promise.race([
    work(),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Worker timed out after ${WORKER_JOB_TIMEOUT_MS}ms for case ${caseId}`)), WORKER_JOB_TIMEOUT_MS);
    }),
  ]);
}

async function runCaseWithGuard(caseId) {
  try {
    await withWorkerTimeout(caseId, () => processCase(caseId));
  } catch (err) {
    console.error(`[Worker] Timeout guard triggered for case ${caseId}:`, err.message);
    try {
      await db.query(`UPDATE cases SET status='failed' WHERE id=$1`, [caseId]);
    } catch (dbErr) {
      console.error(`[Worker] Failed to mark timed-out case ${caseId} as failed:`, dbErr.message);
    }
  }
}

function initQueue() {
  try {
    const Bull = require('bull');
    queue = new Bull('analysis', {
      redis: { host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT || 6379) }
    });
    // Explicit concurrency — Bull defaults to 1 if omitted, which is safe but
    // unnecessarily serializes jobs when RAM allows more. WORKER_CONCURRENCY=2
    // lets two analyses run in parallel without blowing memory on a standard instance.
    queue.process(WORKER_CONCURRENCY, async (job) => {
      await runCaseWithGuard(job.data.caseId);
    });
    console.log(`[Worker] Bull queue initialized (concurrency: ${WORKER_CONCURRENCY})`);
  } catch (err) {
    console.warn('[Worker] Bull/Redis not available, using direct processing:', err.message);
    queue = null;
  }
}

async function addJob(caseId) {
  if (queue) {
    try {
      await queue.add(
        { caseId },
        { attempts: 2, backoff: 5000, timeout: WORKER_JOB_TIMEOUT_MS, removeOnComplete: true, removeOnFail: 100 }
      );
      return;
    } catch (err) {
      console.warn('[Worker] Bull queue unavailable, falling back to direct processing:', err.message);
      queue = null;
    }
  }
  // Fallback: semaphore-limited direct processing.
  // Without this, simultaneous submissions each spawn their own Puppeteer
  // instance which can OOM-crash the process on memory-constrained hosts.
  setImmediate(async () => {
    console.log(`[Worker] Fallback semaphore: active=${fallbackSemaphore.active}, waiting=${fallbackSemaphore.waiting}`);
    await fallbackSemaphore.acquire();
    try {
      await runCaseWithGuard(caseId);
    } finally {
      fallbackSemaphore.release();
    }
  });
}

async function getQueueStatus() {
  if (queue) {
    try {
      const [waiting, active, delayed, failed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getDelayedCount(),
        queue.getFailedCount(),
      ]);
      return { backend: 'bull', waiting, active, delayed, failed, concurrency: WORKER_CONCURRENCY };
    } catch (_) { /* fall through */ }
  }
  return {
    backend: 'semaphore',
    active: fallbackSemaphore.active,
    waiting: fallbackSemaphore.waiting,
    concurrency: WORKER_CONCURRENCY,
  };
}

// Only initialize Bull queue if REDIS_ENABLED is explicitly set
if (process.env.REDIS_ENABLED === 'true') {
  initQueue();
} else {
  console.log(`[Worker] Redis disabled — using semaphore fallback (concurrency: ${WORKER_CONCURRENCY}). Set REDIS_ENABLED=true to enable Bull queue.`);
}

module.exports = {
  addJob,
  processCase,
  runCaseWithGuard,
  getQueueStatus,
  __testables: {
    computeVerbatimOverlapScore,
    isReportDeliverable,
    withWorkerTimeout,
  },
};
