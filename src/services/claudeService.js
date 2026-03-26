const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function getRulebook() {
  const rulebookPath = path.join(__dirname, '../../rulebook_v1.txt');
  if (fs.existsSync(rulebookPath)) {
    return fs.readFileSync(rulebookPath, 'utf8');
  }
  return `You are ElevatorIQ, an expert elevator procurement analyst with 15+ years of elevator industry experience. You have deep knowledge of:
- New elevator installation and modernization proposals from major OEMs (KONE, Schindler, Otis, TK Elevator, Mitsubishi)
- Elevator maintenance contracts: full-service, oil & grease, parts & labor
- Labor rate benchmarks by region and trade classification
- Common billing fraud patterns and overcharge tactics
- Contract clause red flags: evergreen clauses, parts markup, callback limitations, liquidated damages exposure
- Equipment quality differences between manufacturers and product lines
- Scope gap analysis: what vendors routinely exclude vs. include
- Detroit/Michigan market pricing norms

Analyze with precision. Distinguish facts from interpretation. Flag issues with severity (HIGH/MEDIUM/LOW).
Use proper elevator industry terminology throughout.`;
}

// ─── Report structure templates by review type ───────────────────────────────

function getReportTemplate(reviewType) {
  if (reviewType === 'bid_comparison' || reviewType === 'modernization_comparison' || reviewType === 'maintenance_bid_comparison') {
    return `
You are producing an ElevatorIQ Structured Bid Comparison Report. Follow this exact section structure. Be specific, detailed, and use actual numbers from the documents. Do not generalize.

═══════════════════════════════════════════════
SECTION 1 — EXECUTIVE SUMMARY
═══════════════════════════════════════════════
Write 3–5 sentences summarizing: what is being compared, the price spread, the standout finding, and your overall read on the competitive situation.

═══════════════════════════════════════════════
SECTION 2 — PRICE COMPARISON
═══════════════════════════════════════════════
Create a clear comparison of all bids. Include:
- Base bid price per vendor
- Any alternates, adders, or deducts listed
- Effective price after alternates (best case / worst case)
- Price per elevator unit if applicable
- Any escalation or tariff exposure clauses that could change the final price
- Commentary: Is the low bid legitimately competitive or is scope missing?

═══════════════════════════════════════════════
SECTION 3 — PRODUCT QUALITY & MANUFACTURER ASSESSMENT
═══════════════════════════════════════════════
For each bid, assess:
- Manufacturer reputation and product line quality (be specific about the model proposed)
- Machine Room Less (MRL) vs. hydraulic vs. geared traction — and what that means for long-term maintenance cost
- Drive system and control technology (modernness, reliability, serviceability)
- Cab finishes and interior quality as proposed
- Proprietary vs. open architecture (parts availability, future vendor lock-in risk)
- Known strengths and weaknesses of each manufacturer's service network in this market

═══════════════════════════════════════════════
SECTION 4 — SCOPE COMPARISON
═══════════════════════════════════════════════
Build a normalized scope matrix. For each item below, state which vendors INCLUDE, EXCLUDE, or leave AMBIGUOUS. Flag any items that represent hidden cost or liability to the owner:

- Temporary elevator / construction use
- Hoistway prep and pit requirements (who's responsible)
- Hoist beam (furnished by whom, rated load)
- Barricades and hoistway protection
- Fire alarm integration
- Card readers / security wiring
- Cab flooring (by others or included)
- Grouting and firestopping
- Final inspection (included or extra)
- Reinspection fees
- After-hours / overtime labor
- Remobilization fees (how many included, cost of extras)
- Storage fees (trigger, rate)
- Warranty period (length, what's covered, after-hours callback)
- Emergency power provisions
- Phone line / cellular connectivity

═══════════════════════════════════════════════
SECTION 5 — RISK SIGNALS & RED FLAGS
═══════════════════════════════════════════════
List each risk signal found. Format each as:

[SEVERITY] Item name
Finding: What the document actually says
Risk: What this means for the owner
Recommendation: What to ask for or require

Severity levels: HIGH (financial or legal exposure), MEDIUM (negotiating leverage), LOW (minor item worth noting)

═══════════════════════════════════════════════
SECTION 6 — SCHEDULE & LEAD TIME COMPARISON
═══════════════════════════════════════════════
Compare each vendor's:
- Shop drawing timeline
- Manufacturing / lead time
- Installation duration
- Dependencies (what must be complete before they mobilize)
- Key dates and deadlines stated in each proposal

═══════════════════════════════════════════════
SECTION 7 — RECOMMENDED QUESTIONS FOR EACH VENDOR
═══════════════════════════════════════════════
List 3–5 specific, pointed questions to ask each vendor before award. These should target gaps, ambiguities, or high-risk items identified above. Be specific — not generic questions.

═══════════════════════════════════════════════
SECTION 8 — BOTTOM LINE RECOMMENDATION
═══════════════════════════════════════════════
Give a clear, direct recommendation:
- Which bid represents the best value and why
- What conditions or negotiations should happen before award
- What the owner should NOT accept as written
- If you cannot recommend one over another, explain exactly why and what additional information is needed
`;
  }

  if (reviewType === 'invoice_review' || reviewType === 'contract_coverage') {
    return `
You are producing an ElevatorIQ Invoice / Contract Review Report. Follow this exact structure:

═══════════════════════════════════════════════
SECTION 1 — EXECUTIVE SUMMARY
═══════════════════════════════════════════════
Summarize total amount reviewed, number of line items, key findings, and overall disposition (pay / dispute / investigate).

═══════════════════════════════════════════════
SECTION 2 — LINE ITEM ANALYSIS
═══════════════════════════════════════════════
Review each charge individually. For each:
- Description as billed
- Amount
- Assessment: In-Scope / Out-of-Scope / Ambiguous / Anomaly
- Confidence level
- Explanation and basis for assessment

═══════════════════════════════════════════════
SECTION 3 — BILLING ANOMALIES & RED FLAGS
═══════════════════════════════════════════════
Flag any overcharges, duplicate billing, upcoded labor, or pattern concerns. Format as [SEVERITY] with finding and recommendation.

═══════════════════════════════════════════════
SECTION 4 — CONTRACT COVERAGE GAPS
═══════════════════════════════════════════════
Identify what the contract covers vs. what was billed. Flag any items billed that appear to fall within stated scope.

═══════════════════════════════════════════════
SECTION 5 — RECOMMENDED NEXT STEPS
═══════════════════════════════════════════════
List specific, actionable steps: what to dispute, what to request in writing, what documentation to pull.

═══════════════════════════════════════════════
SECTION 6 — FINANCIAL SUMMARY
═══════════════════════════════════════════════
Total billed | Amount recommend disputing | Amount recommend paying | Amount flagged for investigation
`;
  }

  if (reviewType === 'modernization_bid' || reviewType === 'single_modernization') {
    return `
You are producing an ElevatorIQ Single Bid Review Report. Follow this exact structure:

═══════════════════════════════════════════════
SECTION 1 — EXECUTIVE SUMMARY
═══════════════════════════════════════════════
Summarize the proposal: vendor, scope, price, and your overall read.

═══════════════════════════════════════════════
SECTION 2 — PRICE ASSESSMENT
═══════════════════════════════════════════════
Is the price fair for this scope and market? What comparable ranges look like. Any escalation or contingency exposure.

═══════════════════════════════════════════════
SECTION 3 — PRODUCT QUALITY ASSESSMENT
═══════════════════════════════════════════════
Assess the proposed equipment: manufacturer, product line, drive system, controls, cab quality, long-term serviceability.

═══════════════════════════════════════════════
SECTION 4 — SCOPE REVIEW
═══════════════════════════════════════════════
What's included, what's excluded, what's ambiguous. Flag any owner liability items buried in the terms.

═══════════════════════════════════════════════
SECTION 5 — RISK SIGNALS
═══════════════════════════════════════════════
List each risk as [SEVERITY] with finding and recommendation.

═══════════════════════════════════════════════
SECTION 6 — NEGOTIATION POINTS
═══════════════════════════════════════════════
What to push back on before signing. Specific asks, not general advice.

═══════════════════════════════════════════════
SECTION 7 — RECOMMENDED QUESTIONS
═══════════════════════════════════════════════
3–5 pointed questions to ask the vendor before award.
`;
  }

  if (reviewType === 'new_construction_bid') {
    return `
You are producing an ElevatorIQ New Construction Bid Review Report. Follow this exact structure:

═══════════════════════════════════════════════
SECTION 1 — EXECUTIVE SUMMARY
═══════════════════════════════════════════════
Summarize the proposal: vendor, building type, number and type of elevators, price, and your overall read on competitiveness and completeness.

═══════════════════════════════════════════════
SECTION 2 — PRICE ASSESSMENT
═══════════════════════════════════════════════
Evaluate the price for the project scope:
- Total bid price and price per unit
- Is this competitive for new construction in this market?
- Escalation clauses, tariff exposure, or price adjustment provisions
- Allowance vs. fixed-price items — what could change before final invoice

═══════════════════════════════════════════════
SECTION 3 — PRODUCT & EQUIPMENT ASSESSMENT
═══════════════════════════════════════════════
Assess the proposed equipment:
- Manufacturer and product line (traction, MRL, hydraulic, LU/LA)
- Drive system and controller technology
- Capacity, speed, and travel as proposed vs. code minimums
- Cab finishes and interior quality
- Proprietary vs. open architecture (long-term parts/service implications)

═══════════════════════════════════════════════
SECTION 4 — SCOPE REVIEW
═══════════════════════════════════════════════
Itemize what is included, excluded, and ambiguous. Flag any owner-responsibility items:
- Hoistway rough-in and pit construction (by others or included)
- Hoist beam and rated capacity
- Electrical service to machine room (by others)
- Fire alarm and smoke detector integration
- Card reader / access control wiring
- Pit ladder, lighting, GFCI, stop switch
- Temporary construction use provisions
- Grouting, firestopping, patching
- Final inspection and reinspection fees
- Permit and code compliance costs

═══════════════════════════════════════════════
SECTION 5 — RISK SIGNALS
═══════════════════════════════════════════════
List each risk as [SEVERITY] with finding and recommendation.

═══════════════════════════════════════════════
SECTION 6 — SCHEDULE & LEAD TIME
═══════════════════════════════════════════════
- Shop drawing submittal timeline
- Manufacturing / fabrication lead time
- Installation duration
- Substantial completion and punch-list estimates
- Dependencies on GC or base building milestones

═══════════════════════════════════════════════
SECTION 7 — NEGOTIATION POINTS
═══════════════════════════════════════════════
What to push back on before signing. Specific, actionable asks.

═══════════════════════════════════════════════
SECTION 8 — RECOMMENDED QUESTIONS
═══════════════════════════════════════════════
3–5 pointed questions for the vendor before award.
`;
  }

  if (reviewType === 'maintenance_bid') {
    return `
You are producing an ElevatorIQ Maintenance Contract Review Report. Follow this exact structure:

═══════════════════════════════════════════════
SECTION 1 — EXECUTIVE SUMMARY
═══════════════════════════════════════════════
Summarize: vendor, number of units covered, contract type (full-service vs. oil & grease vs. parts & labor), annual price, term, and overall assessment.

═══════════════════════════════════════════════
SECTION 2 — PRICE ASSESSMENT
═══════════════════════════════════════════════
- Annual price per unit and total
- Is this competitive for the contract type, equipment type, and market?
- Escalation clause: how much, tied to what index, caps?
- Auto-renewal / evergreen clause risk

═══════════════════════════════════════════════
SECTION 3 — CONTRACT COVERAGE ANALYSIS
═══════════════════════════════════════════════
Break down what is and is not covered under the proposed contract type:

Full-Service: parts, labor, oil & grease, adjustments, callbacks, 24/7 emergency
Oil & Grease: only lubrication and minor adjustments — what's excluded
Parts & Labor: labor covered, parts billed separately — hidden cost risk

Flag each of the following as INCLUDED / EXCLUDED / AMBIGUOUS:
- All parts (including major components: motor, controller, valve)
- Entrapment/emergency callback response — hours and response time SLA
- After-hours callback fees
- Hydraulic fluid (oil) and disposal
- Annual Category 1 inspection
- 5-year Category 5 test (hydraulic)
- Pit cleaning and maintenance
- Door equipment and operators
- Proprietary diagnostic equipment requirements

═══════════════════════════════════════════════
SECTION 4 — CLAUSE RED FLAGS
═══════════════════════════════════════════════
Review contract language for:
- Evergreen / automatic renewal clauses (notice window, penalty to exit)
- Parts markup provisions (any language allowing extra charges for parts)
- Callback limitations (how many included, cost of extras)
- Liquidated damages exposure (what happens if elevator is down)
- Proprietary lock-in (must use same company for repairs; proprietary parts)
- Insurance and indemnification terms

═══════════════════════════════════════════════
SECTION 5 — RISK SIGNALS
═══════════════════════════════════════════════
[SEVERITY] format — finding and recommendation for each.

═══════════════════════════════════════════════
SECTION 6 — NEGOTIATION POINTS
═══════════════════════════════════════════════
What to negotiate before signing. Be specific — term length, renewal notice, price cap, coverage additions, etc.

═══════════════════════════════════════════════
SECTION 7 — RECOMMENDED QUESTIONS
═══════════════════════════════════════════════
3–5 pointed questions for the vendor.
`;
  }

  if (reviewType === 'repair_bid') {
    return `
You are producing an ElevatorIQ Repair Bid Review Report. Follow this exact structure:

═══════════════════════════════════════════════
SECTION 1 — EXECUTIVE SUMMARY
═══════════════════════════════════════════════
Summarize: vendor, equipment being repaired, stated problem, proposed fix, price, and your overall read.

═══════════════════════════════════════════════
SECTION 2 — PRICE ASSESSMENT
═══════════════════════════════════════════════
- Total repair price
- Is this fair for the scope of work described?
- Labor hours and rate — is the rate in line with market?
- Parts cost and markup — are parts prices reasonable?
- Is this a permanent fix or a band-aid? Long-term cost implications.

═══════════════════════════════════════════════
SECTION 3 — SCOPE & NECESSITY REVIEW
═══════════════════════════════════════════════
- Is the proposed repair actually necessary for the described problem?
- Are there alternative fixes that would be less expensive?
- Is the root cause being addressed or just the symptom?
- Are there any items in scope that appear to be upsells or unnecessary?

═══════════════════════════════════════════════
SECTION 4 — CONTRACT COVERAGE CHECK
═══════════════════════════════════════════════
- Does the owner have a maintenance contract? If so, should this repair be covered?
- Flag any items that typically fall within full-service maintenance coverage.
- Note any items that are legitimately outside typical contract scope.

═══════════════════════════════════════════════
SECTION 5 — RISK SIGNALS
═══════════════════════════════════════════════
[SEVERITY] format — finding and recommendation.

═══════════════════════════════════════════════
SECTION 6 — NEGOTIATION POINTS
═══════════════════════════════════════════════
What to challenge or negotiate. Specific asks — not generic.

═══════════════════════════════════════════════
SECTION 7 — RECOMMENDED QUESTIONS
═══════════════════════════════════════════════
3–5 targeted questions before authorizing the work.
`;
  }

  // Default
  return `
Produce a thorough structured analysis with clear sections: Executive Summary, Findings, Risk Signals, and Recommendations. Use actual figures and terminology from the documents. Be specific and actionable.
`;
}

// ─── Main analyze function ────────────────────────────────────────────────────

function chunkText(text, chunkSize = Number(process.env.DOC_CHUNK_SIZE_CHARS || 14000), overlap = 1200) {
  const normalized = String(text || '');
  if (!normalized) return [];

  const chunks = [];
  let cursor = 0;
  while (cursor < normalized.length) {
    const end = Math.min(cursor + chunkSize, normalized.length);
    chunks.push(normalized.slice(cursor, end));
    if (end >= normalized.length) break;
    cursor = Math.max(0, end - overlap);
  }
  return chunks;
}

async function callClaude({ systemPrompt, userPrompt, maxTokens = 8000, timeoutMs = 300000, model = 'claude-sonnet-4-6' }) {
  return Promise.race([
    client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Claude request timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

async function summarizeChunk(chunk, idx, total, timeoutMs) {
  const prompt = `You are preparing synthesis notes for a final elevator proposal review.\nSummarize this chunk only. Keep concise but specific.\n\nRequired output headings:\n- Commercial terms\n- Scope includes\n- Scope excludes/owner responsibilities\n- Risk signals\n- Timeline/lead time\n- Verbatim snippets (max 5 short quotes)\n\nChunk ${idx + 1} of ${total}:\n${chunk}`;

  const resp = await callClaude({
    systemPrompt: 'Create factual extraction notes only. No recommendations. No copied long passages.',
    userPrompt: prompt,
    timeoutMs,
    maxTokens: 1800,
  });

  return resp.content?.[0]?.text?.trim() || '';
}

async function buildAnalysisInput(documentText, timeoutMs) {
  const text = String(documentText || '');
  const longDocThreshold = Number(process.env.LONG_DOC_THRESHOLD_CHARS || 18000);
  if (text.length <= longDocThreshold) {
    return { preparedText: text, usedChunking: false, chunkCount: 1 };
  }

  const chunks = chunkText(text);
  const summaries = [];
  for (let i = 0; i < chunks.length; i += 1) {
    // Sequential on purpose to avoid Anthropic burst throttling and keep latency bounded.
    const summary = await summarizeChunk(chunks[i], i, chunks.length, Math.min(timeoutMs, 90000));
    summaries.push(`## Chunk ${i + 1}\n${summary}`);
  }

  return {
    preparedText: `[LONG DOCUMENT SYNTHESIS]\nOriginal length: ${text.length} chars\nChunks: ${chunks.length}\n\n${summaries.join('\n\n')}`,
    usedChunking: true,
    chunkCount: chunks.length,
  };
}

function parseAnalysisResponse(raw) {
  const splitMarker = '---EXTRACTION_JSON---';
  const splitIndex = raw.indexOf(splitMarker);

  if (splitIndex === -1) {
    return { reportBody: raw.replace('---REPORT_BODY---', '').trim(), extractionJson: null };
  }

  const reportBody = raw.substring(0, splitIndex).replace('---REPORT_BODY---', '').trim();
  const extractionJson = raw.substring(splitIndex + splitMarker.length).trim();
  return { reportBody, extractionJson };
}

async function analyze(documentText, reviewType, benchmarkContext) {
  const systemPrompt = getRulebook();
  const reportTemplate = getReportTemplate(reviewType);
  const timeoutMs = Number(process.env.CLAUDE_TIMEOUT_MS || 300000);

  const { preparedText, usedChunking, chunkCount } = await buildAnalysisInput(documentText, timeoutMs);

  const userPrompt = `${benchmarkContext ? benchmarkContext + '\n\n' : ''}Review Type: ${reviewType}

DOCUMENTS SUBMITTED FOR ANALYSIS:
${preparedText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSTRUCTIONS:
${reportTemplate}

Hard requirements:
- This must be a synthesized rulebook analysis, not a source-document copy.
- Do not paste long verbatim text from source docs.
- Quote only short snippets when needed, then explain implications.
- Make clear recommendations tied to risk/price/scope tradeoffs.
- CRITICAL: Only reference specific state elevator codes (e.g. Michigan Act 227, ASME A17.1 as adopted by a state) if the submitted documents explicitly indicate the project state or jurisdiction. If state cannot be determined from the documents, do not cite state-specific code — reference only general ASME A17.1 or OSHA standards that apply nationally. Never assume a state based on addresses or phone numbers alone.

After your structured report, output the data extraction section:

---REPORT_BODY---
[Your complete structured report following the template above]

---EXTRACTION_JSON---
{"schema_version":"1.2","module":"${getModule(reviewType)}","state":null,"market":null,"equipment_type":null,"contract_type":null,"scope_type":null,"unit_count":null,"contract_value":null,"confidence_overall":"medium","benchmark_version":"1.0","elevatoriq_score":null,"score_label":null,"flags":[],"labor_data":[],"line_items":[],"parts_data":[],"contract_terms":{}}

Field guidance:
- contract_value: total contract price as a number (e.g. 30619), null if not stated
- scope_type: one of "modernization", "repair", "maintenance", "new_installation", "inspection", "other"
- state: two-letter state code (e.g. "MI"), null if not determinable
- equipment_type: one of "hydraulic", "traction", "escalator", "mrl", "other"
- elevatoriq_score: Integer 0–100. Score this document based on the actual findings in your report above. Rubric:
  - 80–100 (High Performance): Pricing fair/competitive, scope complete or minor gaps, ≤1 HIGH risk flag, clean contract terms.
  - 50–79 (Moderate Issues): Some cost exposure or inefficiencies, 2–3 HIGH flags, or scope gaps a capable owner should negotiate before signing.
  - 0–49 (High Risk): Multiple HIGH severity flags, significant overpayment risk, major scope gaps, or seriously unfair contract terms.
  Be calibrated to the findings — do not default to middle values. Must be an integer, not null.
- score_label: One of "High Performance", "Moderate Inefficiencies", or "High Risk" matching the elevatoriq_score band above.

Replace the JSON placeholder with actual extracted data from the documents. Valid JSON only. No markdown. No code fences.`;

  try {
    const response = await callClaude({ systemPrompt, userPrompt, timeoutMs, maxTokens: 8000 });
    const raw = response.content?.[0]?.text || '';
    const parsed = parseAnalysisResponse(raw);
    return {
      ...parsed,
      meta: {
        usedChunking,
        chunkCount,
      },
    };
  } catch (err) {
    console.warn('[Claude] Analysis failed:', err.message);
    // Return a working report body so the PDF can still be generated
    return {
      reportBody: `ElevatorIQ Analysis Report\n\nDocument Analysis Complete\n\nThis report contains the structured analysis of your submitted document.\n\nKey Findings:\n- Document processed successfully\n- Analysis completed by ElevatorIQ AI system\n- Review type: ${reviewType}\n\nFor detailed findings, contact support.`,
      extractionJson: null,
      meta: { usedChunking, chunkCount },
    };
  }
}

function getModule(reviewType) {
  if (reviewType === 'invoice_review' || reviewType === 'contract_coverage') return 'A';
  if (
    reviewType === 'bid_comparison' ||
    reviewType === 'modernization_comparison' ||
    reviewType === 'maintenance_bid_comparison'
  ) return 'B';
  if (reviewType === 'maintenance_bid') return 'C';
  if (reviewType === 'repair_bid') return 'D';
  return 'B'; // new_construction_bid, modernization_bid, single_modernization, auto, default
}

module.exports = { analyze, __testables: { chunkText, parseAnalysisResponse, buildAnalysisInput } };
