const MATERIAL_FIELD_THRESHOLDS = {
  vendor: 0.95,
  monthly_price: 0.95,
  annual_price: 0.95,
  start_date: 0.95,
  end_date: 0.95,
  cancellation_notice_days: 0.9,
  auto_renew: 0.9,
  equipment_covered: 0.85,
  included_maintenance_scope: 0.85,
  excluded_work: 0.85,
  callback_coverage: 0.85,
  overtime_rules: 0.85,
  testing_responsibility: 0.85,
  escalation_terms: 0.85,
  parts_labor_coverage: 0.85,
};

const TERM_LABELS = {
  vendor: 'Vendor',
  monthly_price: 'Monthly price',
  annual_price: 'Annual price',
  start_date: 'Contract start date',
  end_date: 'Contract end date',
  cancellation_notice_days: 'Cancellation notice period',
  auto_renew: 'Auto-renewal terms',
  equipment_covered: 'Equipment covered',
  included_maintenance_scope: 'Included maintenance scope',
  excluded_work: 'Excluded work',
  callback_coverage: 'Callback coverage',
  overtime_rules: 'Overtime rules',
  testing_responsibility: 'Testing responsibility',
  escalation_terms: 'Price escalation terms',
  parts_labor_coverage: 'Parts/labor coverage',
};

function asNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function toIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function subtractDays(dateString, days) {
  return addDays(dateString, -Math.abs(days));
}

function computeCancellationDeadline({ end_date, cancellation_notice_days }) {
  if (!end_date || !cancellation_notice_days) return null;
  return subtractDays(end_date, Number(cancellation_notice_days));
}

function normalizeFact(fieldName, value, confidence = 0.5, sourceSnippet = '') {
  const threshold = MATERIAL_FIELD_THRESHOLDS[fieldName] || 0.85;
  const numericConfidence = Math.max(0, Math.min(1, Number(confidence) || 0.5));
  return {
    field_name: fieldName,
    label: TERM_LABELS[fieldName] || fieldName.replace(/_/g, ' '),
    field_value: value === undefined || value === null ? null : String(value),
    confidence: numericConfidence,
    threshold,
    needs_confirmation: numericConfidence < threshold,
    source_snippet: sourceSnippet || 'Source snippet not captured. Confirm this field before relying on it.',
  };
}

function buildFactsFromTerms(terms = {}) {
  const facts = [];
  for (const field of Object.keys(MATERIAL_FIELD_THRESHOLDS)) {
    const raw = terms[field];
    const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw.value : raw;
    const confidence = raw && typeof raw === 'object' ? raw.confidence : terms[`${field}_confidence`];
    const source = raw && typeof raw === 'object' ? raw.source_snippet : terms[`${field}_source_snippet`];
    if (value !== undefined && value !== null && value !== '') {
      facts.push(normalizeFact(field, value, confidence || 0.7, source));
    }
  }
  return facts;
}

function calculatePortfolioWatchPrice(unitCount) {
  const units = Math.max(0, Number(unitCount) || 0);
  const first = Math.min(units, 25) * 25;
  const second = Math.min(Math.max(units - 25, 0), 50) * 20;
  const third = Math.max(units - 75, 0) * 15;
  const raw = first + second + third;
  return {
    enrolled_units: units,
    monthly: units > 0 ? Math.max(300, raw) : 0,
    annual_monthly_billing: units > 0 ? Math.max(300, raw) * 12 : 0,
    annual_prepay: units > 0 ? Math.max(300, raw) * 10 : 0,
    blended_per_unit: units > 0 ? Math.max(300, raw) / units : 0,
    floor_applied: units > 0 && raw < 300,
  };
}

function severityRank(status) {
  return { red: 3, yellow: 2, green: 1 }[status] || 1;
}

function decideStatus(findings) {
  if (findings.some((f) => f.severity === 'high')) return 'red';
  if (findings.some((f) => f.severity === 'medium')) return 'yellow';
  return 'green';
}

function contractText(contract = {}, facts = []) {
  const factLines = facts.map((f) => `${f.field_name}: ${f.user_corrected_value || f.field_value || ''}`).join('\n');
  return `${contract.vendor || ''}\n${contract.coverage_level || ''}\n${contract.escalation_terms || ''}\n${factLines}`.toLowerCase();
}

function getFact(facts, fieldName) {
  return facts.find((f) => f.field_name === fieldName) || null;
}

function detectQuoteAmount(text) {
  const matches = String(text || '').match(/\$\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{2})?|[0-9]+(?:\.\d{2})?)/g) || [];
  const amounts = matches.map(asNumber).filter((n) => n !== null);
  return amounts.length ? Math.max(...amounts) : null;
}

function buildVendorEmail({ reviewType, property, unit, contract, findings, missingInformation }) {
  const subject = reviewType === 'invoice_check'
    ? `Clarification requested before invoice processing${property?.name ? ` — ${property.name}` : ''}`
    : `Clarification requested before proposal review${property?.name ? ` — ${property.name}` : ''}`;

  const unitLine = unit?.label ? ` for ${unit.label}` : '';
  const bullets = [];
  for (const item of missingInformation.slice(0, 5)) bullets.push(item);
  for (const finding of findings.slice(0, 4)) {
    if (finding.vendor_question) bullets.push(finding.vendor_question);
  }
  const unique = Array.from(new Set(bullets)).slice(0, 6);
  const fallback = reviewType === 'invoice_check'
    ? 'Please provide the contract section or work ticket supporting each non-recurring charge, and separate labor, material, overtime, travel, and testing charges.'
    : 'Please provide mechanic findings, part/labor breakdown, contract coverage position, and any photos or service tickets supporting the recommendation.';

  return {
    subject,
    body: [
      'Hello,',
      '',
      `Before we finalize review of this ${reviewType === 'invoice_check' ? 'invoice' : 'proposal'}${unitLine}, please clarify the items below:`,
      '',
      ...(unique.length ? unique : [fallback]).map((q, i) => `${i + 1}. ${q}`),
      '',
      contract?.vendor ? `Please also confirm whether these items are covered, excluded, or separately billable under the current ${contract.vendor} maintenance agreement.` : 'Please also confirm whether these items are covered, excluded, or separately billable under the current maintenance agreement.',
      '',
      'Thanks,',
    ].join('\n'),
  };
}

function snippetAround(text, regex, fallback = '') {
  const match = String(text || '').match(regex);
  if (!match || match.index === undefined) return fallback;
  const start = Math.max(0, match.index - 100);
  const end = Math.min(String(text).length, match.index + match[0].length + 160);
  return String(text).slice(start, end).replace(/\s+/g, ' ').trim();
}

function parseContractTermsFromText(text = '') {
  const source = String(text || '');
  const compact = source.replace(/\s+/g, ' ');
  const moneyMatches = compact.match(/\$\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{2})?|[0-9]+(?:\.\d{2})?)/g) || [];
  const firstMoney = moneyMatches.map(asNumber).find((n) => n && n > 50);
  const noticeMatch = compact.match(/(\d{2,3}|thirty|sixty|ninety|one hundred twenty)\s*(?:\(\d+\))?\s*days?[^.]{0,120}(?:notice|expiration|terminate|termination|cancel|cancellation)/i)
    || compact.match(/(?:notice|terminate|termination|cancel|cancellation)[^.]{0,120}(\d{2,3}|thirty|sixty|ninety|one hundred twenty)\s*(?:\(\d+\))?\s*days?/i);
  const wordDays = { thirty: 30, sixty: 60, ninety: 90, 'one hundred twenty': 120 };
  const noticeValueRaw = noticeMatch?.[1]?.toLowerCase();
  const noticeValue = wordDays[noticeValueRaw] || Number(noticeValueRaw) || null;
  const autoRenewMatch = compact.match(/automatic(?:ally)?\s+renew|auto[-\s]?renew|successive\s+(?:one|1)[-\s]?year|renewal\s+term/i);
  const startDateMatch = compact.match(/(?:commence|start|effective)[^A-Za-z0-9]{0,20}((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/i);
  const endDateMatch = compact.match(/(?:expire|expiration|end|through)[^A-Za-z0-9]{0,30}((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/i);
  const vendorMatch = compact.match(/(?:agreement\s+between|contract\s+between|by\s+and\s+between)\s+(.{2,80}?)(?:\s+and\s+|,)/i)
    || compact.match(/(Otis|KONE|Schindler|TK\s*Elevator|ThyssenKrupp|TKE|Mitsubishi|Fujitec|[^.]{2,50}\s+Elevator\s+(?:Co\.?|Company|Inc\.?|LLC))/i);

  const terms = {};
  if (vendorMatch) terms.vendor = { value: vendorMatch[1]?.trim() || vendorMatch[0].trim(), confidence: /Otis|KONE|Schindler|TK|Elevator/i.test(vendorMatch[0]) ? 0.9 : 0.72, source_snippet: snippetAround(compact, new RegExp(vendorMatch[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), vendorMatch[0]) };
  if (firstMoney) terms.monthly_price = { value: String(firstMoney), confidence: /month|monthly/i.test(snippetAround(compact, /\$\s?[0-9,]+(?:\.\d{2})?/i)) ? 0.86 : 0.64, source_snippet: snippetAround(compact, /\$\s?[0-9,]+(?:\.\d{2})?/i) };
  if (startDateMatch) terms.start_date = { value: toIsoDate(startDateMatch[1]) || startDateMatch[1], confidence: 0.78, source_snippet: snippetAround(compact, /(?:commence|start|effective)[^.]{0,120}/i) };
  if (endDateMatch) terms.end_date = { value: toIsoDate(endDateMatch[1]) || endDateMatch[1], confidence: 0.78, source_snippet: snippetAround(compact, /(?:expire|expiration|end|through)[^.]{0,120}/i) };
  if (noticeValue) terms.cancellation_notice_days = { value: String(noticeValue), confidence: noticeValue >= 30 ? 0.86 : 0.7, source_snippet: snippetAround(compact, noticeMatch[0] ? new RegExp(noticeMatch[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : /notice/i, noticeMatch[0]) };
  if (autoRenewMatch) terms.auto_renew = { value: 'true', confidence: 0.82, source_snippet: snippetAround(compact, /automatic(?:ally)?\s+renew|auto[-\s]?renew|successive\s+(?:one|1)[-\s]?year|renewal\s+term/i) };
  if (/callback/i.test(compact)) terms.callback_coverage = { value: 'Callback coverage language found; confirm included vs billable terms.', confidence: 0.72, source_snippet: snippetAround(compact, /callback[^.]{0,180}/i) };
  if (/overtime|after.?hours|weekend|holiday/i.test(compact)) terms.overtime_rules = { value: 'Overtime / after-hours language found; confirm billing treatment.', confidence: 0.72, source_snippet: snippetAround(compact, /(?:overtime|after.?hours|weekend|holiday)[^.]{0,180}/i) };
  if (/parts|material|labor/i.test(compact)) terms.parts_labor_coverage = { value: 'Parts/labor coverage language found; confirm exact coverage.', confidence: 0.7, source_snippet: snippetAround(compact, /(?:parts|material|labor)[^.]{0,180}/i) };
  if (/escalat|increase|cpi|price adjustment/i.test(compact)) terms.escalation_terms = { value: 'Escalation or price-adjustment language found; confirm cap/frequency.', confidence: 0.7, source_snippet: snippetAround(compact, /(?:escalat|increase|cpi|price adjustment)[^.]{0,180}/i) };

  return { terms, text_length: source.length, extraction_method: 'heuristic-v1-confirm-before-reliance' };
}

function reviewDocumentAgainstContract({ reviewType, documentText = '', amount = null, contract = {}, facts = [], property = null, unit = null, unitHistory = [] }) {
  const text = String(documentText || '');
  const lower = text.toLowerCase();
  const findings = [];
  const missingInformation = [];
  const whatToUploadNext = [];
  const knownAmount = asNumber(amount) || detectQuoteAmount(text);
  const cText = contractText(contract, facts);
  const monthlyFact = getFact(facts, 'monthly_price');
  const callbackFact = getFact(facts, 'callback_coverage');
  const overtimeFact = getFact(facts, 'overtime_rules');
  const coverageFact = getFact(facts, 'parts_labor_coverage') || getFact(facts, 'included_maintenance_scope');

  if (!contract?.id) {
    findings.push({
      severity: 'high',
      category: 'contract_memory_missing',
      title: 'No active contract memory is linked to this unit',
      detail: 'ElevatorIQ cannot compare the document against coverage, callback, overtime, renewal, or pricing terms until the maintenance contract is loaded.',
      vendor_question: 'Please confirm the current maintenance agreement, covered equipment, and whether this item is included or separately billable.',
    });
    whatToUploadNext.push('Current elevator maintenance contract and all amendments');
  }

  if (reviewType === 'repair_quote') {
    const hasScopeDetail = /(replace|repair|furnish|install|labor|material|part|controller|door|operator|valve|pump|jack|roller|cable|board|fixture)/i.test(text);
    const hasProof = /(mechanic|technician|found|observed|diagnosed|photo|ticket|callback|shutdown|failed|error code|inspection)/i.test(text);
    const hasPartLaborSplit = /(labor).{0,80}(material|parts)|(material|parts).{0,80}(labor)/i.test(text);
    const highDollar = knownAmount !== null && knownAmount >= 25000;
    const coverageLikelyRelevant = /(callback|repair|parts|labor|full maintenance|comprehensive|covered)/i.test(cText);

    if (!hasScopeDetail) {
      findings.push({ severity: 'high', category: 'scope_gap', title: 'Repair scope is not specific enough', detail: 'The proposal does not clearly identify the component, action, and reason for the repair in a way a property manager can evaluate.', vendor_question: 'Please identify the exact component, failure condition, proposed repair action, and whether any alternatives were considered.' });
      missingInformation.push('Exact failed component and repair scope');
    }
    if (!hasProof) {
      findings.push({ severity: 'medium', category: 'proof_gap', title: 'Vendor has not demonstrated the problem in the document', detail: 'The quote should include mechanic findings, service-ticket notes, photos, fault codes, callback history, or other backup before the customer treats it as decision-ready.', vendor_question: 'Please provide the mechanic findings, service ticket, photos/fault codes if available, and date/time the issue was diagnosed.' });
      missingInformation.push('Mechanic findings or service-ticket backup');
    }
    if (!hasPartLaborSplit) {
      findings.push({ severity: 'medium', category: 'pricing_detail_gap', title: 'Parts and labor are not separated', detail: 'A lump-sum repair quote makes it difficult to evaluate labor reasonableness, material pricing, overtime, and contract coverage.', vendor_question: 'Please separate labor hours/rate, material or parts, travel, overtime, testing, and any subcontractor costs.' });
      missingInformation.push('Parts/labor/travel/overtime breakdown');
    }
    if (coverageLikelyRelevant) {
      findings.push({ severity: 'medium', category: 'possible_contract_coverage', title: 'Potential contract-coverage question', detail: 'The active contract memory includes coverage/callback language that may matter to this proposal. Confirm whether the proposed work is included, excluded, or separately billable before relying on the quote.', contract_reference: coverageFact?.source_snippet || callbackFact?.source_snippet || null, vendor_question: 'Please cite the contract clause that makes this work included, excluded, or separately billable.' });
    }
    if (highDollar) {
      findings.push({ severity: 'high', category: 'escalation_trigger', title: 'High-dollar proposal triggers expert review', detail: `The detected proposal amount is about $${knownAmount.toLocaleString()}. ElevatorIQ should queue this for expert/manual review or require a second quote before treating it as decision-ready.`, dollar_estimate: knownAmount, vendor_question: 'Please provide full scope, exclusions, warranty, schedule, and pricing backup suitable for owner/board review.' });
    }
    if (unitHistory.length >= 2) {
      findings.push({ severity: 'medium', category: 'unit_history', title: 'Prior unit history should be considered', detail: `This unit has ${unitHistory.length} prior review(s). Repeat repairs or aging equipment can materially change whether a repair quote should be treated as isolated or pattern-based.`, vendor_question: 'Please confirm whether this issue is related to prior service calls or repeat failures on the same equipment.' });
    }
    whatToUploadNext.push('Current maintenance contract', 'Recent service ticket or mechanic report', 'Photos or diagnostic backup', 'Second quote if dollar value is material');
  }

  if (reviewType === 'invoice_check') {
    const contractMonthly = asNumber(contract.monthly_price) || asNumber(monthlyFact?.user_corrected_value || monthlyFact?.field_value);
    const hasExtras = /(overtime|after.?hours|travel|fuel|admin|surcharge|testing|repair|parts|material|callback|emergency|trip)/i.test(text);
    const hasBackup = /(ticket|work order|mechanic|approval|po |purchase order|quote|proposal|backup|attachment)/i.test(lower);

    if (contractMonthly && knownAmount && Math.abs(knownAmount - contractMonthly) > 5) {
      findings.push({ severity: 'medium', category: 'price_mismatch', title: 'Invoice amount differs from contract monthly price', detail: `The active contract memory shows a monthly price of $${contractMonthly.toLocaleString()}, while the document shows about $${knownAmount.toLocaleString()}. That difference may be valid, but it needs line-item support.`, dollar_estimate: knownAmount - contractMonthly, contract_reference: monthlyFact?.source_snippet || null, vendor_question: 'Please identify which invoice lines are base monthly maintenance versus separately billable charges, and cite the contract basis for each extra charge.' });
    }
    if (hasExtras && !hasBackup) {
      findings.push({ severity: 'medium', category: 'backup_gap', title: 'Extra charges appear without clear backup', detail: 'The invoice appears to include non-recurring charge categories, but the uploaded text does not show enough support to verify contract coverage or authorization.', contract_reference: overtimeFact?.source_snippet || coverageFact?.source_snippet || null, vendor_question: 'Please provide the work ticket, prior approval, rate basis, labor/material split, and contract clause supporting each non-recurring charge.' });
      missingInformation.push('Work ticket / approval / rate basis for extra charges');
    }
    if (!contractMonthly && contract?.id) {
      findings.push({ severity: 'low', category: 'missing_contract_price', title: 'Contract monthly price needs confirmation', detail: 'The contract memory exists, but the base monthly price is missing or unconfirmed, limiting invoice comparison quality.', vendor_question: 'Please confirm the current base monthly maintenance amount and any approved escalation.' });
      whatToUploadNext.push('Contract page or amendment showing current monthly price');
    }
    whatToUploadNext.push('Current maintenance contract', 'Invoice backup/work tickets', 'Rate sheet or escalation notice');
  }

  if (!findings.length) {
    findings.push({ severity: 'low', category: 'information_completeness', title: 'No major document gaps found in this first pass', detail: 'The document appears to contain basic information needed for review. Confirm contract terms and source snippets before relying on any material date, dollar amount, or coverage conclusion.', vendor_question: 'Please confirm that the uploaded document is complete and that no exclusions, addenda, or backup pages were omitted.' });
  }

  const decision_status = decideStatus(findings);
  const one_line_why = decision_status === 'red'
    ? 'Not decision-ready yet; material scope, coverage, proof, or dollar-value issues need clarification.'
    : decision_status === 'yellow'
      ? 'Potentially reviewable, but specific information should be confirmed before approval.'
      : 'Basic information appears present, with source confirmation still recommended.';

  const next_steps = findings
    .filter((f) => f.severity === 'high' || f.severity === 'medium')
    .slice(0, 4)
    .map((f) => f.vendor_question)
    .filter(Boolean);

  const vendorEmail = buildVendorEmail({ reviewType, property, unit, contract, findings, missingInformation });
  const escalated = findings.some((f) => f.category === 'escalation_trigger') || severityRank(decision_status) >= 3 && knownAmount >= 25000;

  return {
    decision_status,
    one_line_why,
    summary: `${reviewType === 'invoice_check' ? 'Invoice' : 'Repair proposal'} checked against active contract memory${unit?.label ? ` for ${unit.label}` : ''}.`,
    findings,
    next_steps: next_steps.length ? next_steps : ['Confirm extracted contract terms and send the vendor clarification email before treating this as decision-ready.'],
    missing_information: Array.from(new Set(missingInformation)),
    what_to_upload_next: Array.from(new Set(whatToUploadNext)).slice(0, 6),
    vendor_email: vendorEmail,
    escalated,
    escalation_reason: escalated ? 'High-dollar or high-risk document requires manual/expert review before final reliance.' : null,
  };
}

function buildRenewalAlertRows({ orgId, contractId, cancellationDeadline, sourceSnippet }) {
  if (!cancellationDeadline || !sourceSnippet) return [];
  return [120, 90, 60, 30].map((days) => ({
    org_id: orgId,
    contract_id: contractId,
    alert_type: `cancellation_deadline_${days}`,
    trigger_date: subtractDays(cancellationDeadline, days),
    source_snippet: sourceSnippet,
  })).filter((row) => row.trigger_date);
}

module.exports = {
  MATERIAL_FIELD_THRESHOLDS,
  buildFactsFromTerms,
  parseContractTermsFromText,
  calculatePortfolioWatchPrice,
  computeCancellationDeadline,
  buildRenewalAlertRows,
  reviewDocumentAgainstContract,
  asNumber,
  toIsoDate,
};
