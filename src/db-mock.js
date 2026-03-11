/**
 * Mock Database - In-memory storage for local testing
 * Replaces Supabase when MOCK_DB=true
 */

let caseCounter = 1000;
let documentCounter = 1000;

const store = {
  cases: {},
  documents: {},
  reports: {},
};

class MockDB {
  async query(sql, params = []) {
    // CREATE CASE
    if (sql.includes('INSERT INTO cases')) {
      const caseId = caseCounter++;
      const [customerId, reviewType, module, state, market, equipmentType, email] = params;
      store.cases[caseId] = {
        id: caseId,
        customer_id: customerId,
        review_type: reviewType,
        module,
        state,
        market,
        equipment_type: equipmentType,
        customer_email: email,
        status: 'pending',
        created_at: new Date().toISOString(),
        analysis_report: null,
        scope_summary: null,
      };
      return { rows: [{ id: caseId }] };
    }

    // GET CASE (any SELECT from cases by id)
    if (sql.includes('FROM cases WHERE id=') || sql.includes('FROM cases WHERE id =')) {
      const caseId = params[0];
      const caseRow = store.cases[caseId];
      return { rows: caseRow ? [caseRow] : [] };
    }

    // GET DOCUMENTS FOR CASE (handles newlines/indentation in SQL)
    if (sql.includes('FROM documents') && sql.includes('case_id')) {
      const caseId = params[0];
      const docs = Object.values(store.documents).filter(d => String(d.case_id) === String(caseId));
      return { rows: docs };
    }

    // GET REPORT BY DOWNLOAD TOKEN (WHERE clause uses download_token=$1, not just selected as column)
    if (sql.includes('FROM reports') && /WHERE\s+download_token\s*=/.test(sql)) {
      const token = params[0];
      const reports = Object.values(store.reports).filter(r => r.download_token === token);
      return { rows: reports };
    }

    // GET REPORT BY CASE ID (coerce types to handle string vs number mismatch)
    if (sql.includes('FROM reports') && sql.includes('case_id')) {
      const caseId = params[0];
      const reports = Object.values(store.reports).filter(r => String(r.case_id) === String(caseId));
      // Return most recent first (mimic ORDER BY created_at DESC LIMIT 1)
      reports.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return { rows: reports.slice(0, 1) };
    }

    // GET EXTRACTIONS (not implemented in mock, return empty)
    if (sql.includes('FROM extractions_raw')) {
      return { rows: [] };
    }

    // CREATE DOCUMENT
    if (sql.includes('INSERT INTO documents')) {
      const docId = documentCounter++;
      // Handle both (caseId, fileName, fileType, storagePath, autoDetected) and other variants
      const [caseId, fileName, fileType, storagePath, autoDetected] = params;
      store.documents[docId] = {
        id: docId,
        case_id: caseId,
        file_name: fileName,
        file_type: fileType,
        storage_path: storagePath,
        auto_detected: autoDetected,
        status: 'uploaded',
        created_at: new Date().toISOString(),
      };
      return { rows: [{ id: docId }] };
    }

    // UPDATE CASE (status + completed_at) — must be checked BEFORE generic status update
    // Status is hardcoded in SQL (e.g. status='complete'), caseId is always params[0]
    if (sql.includes('UPDATE cases SET status=') && sql.includes('completed_at')) {
      const caseId = params[0];
      const statusMatch = sql.match(/status='([^']+)'/);
      if (store.cases[caseId]) {
        store.cases[caseId].status = statusMatch ? statusMatch[1] : 'complete';
        store.cases[caseId].completed_at = new Date().toISOString();
      }
      return { rows: [] };
    }

    // UPDATE CASE STATUS (generic) — status hardcoded in SQL, caseId is params[0]
    if (sql.includes('UPDATE cases SET status=')) {
      const caseId = params[0];
      const statusMatch = sql.match(/status='([^']+)'/);
      if (store.cases[caseId] && statusMatch) {
        store.cases[caseId].status = statusMatch[1];
      }
      return { rows: [] };
    }

    // UPDATE CASE (review_type, module)
    if (sql.includes('UPDATE cases SET review_type=')) {
      const caseId = params[0];
      if (store.cases[caseId]) {
        store.cases[caseId].review_type = params[1];
        store.cases[caseId].module = params[2];
      }
      return { rows: [] };
    }

    // UPDATE CASE (set reports)
    if (sql.includes('UPDATE cases SET analysis_report=') || sql.includes('scope_summary=')) {
      const caseId = params[params.length - 1];
      if (store.cases[caseId]) {
        if (sql.includes('analysis_report')) store.cases[caseId].analysis_report = params[0];
        if (sql.includes('scope_summary')) store.cases[caseId].scope_summary = params[0];
      }
      return { rows: [] };
    }

    // CREATE REPORT
    if (sql.includes('INSERT INTO reports')) {
      const [caseId, storagePath, downloadToken] = params;
      const reportId = Object.keys(store.reports).length + 1;
      store.reports[reportId] = {
        id: reportId,
        case_id: caseId,
        storage_path: storagePath,
        download_token: downloadToken,
        created_at: new Date().toISOString(),
        emailed_at: null,
      };
      return { rows: [{ id: reportId }] };
    }

    // UPDATE REPORT (emailed_at)
    if (sql.includes('UPDATE reports SET emailed_at')) {
      const token = params[0];
      for (const reportId in store.reports) {
        if (store.reports[reportId].download_token === token) {
          store.reports[reportId].emailed_at = new Date().toISOString();
        }
      }
      return { rows: [] };
    }

    console.warn('[MockDB] Unhandled query:', sql);
    return { rows: [] };
  }

  getStore() {
    return store;
  }
}

module.exports = new MockDB();
