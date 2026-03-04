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
  if (reviewType === 'modernization_comparison' || reviewType === 'maintenance_bid_comparison') {
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

  if (reviewType === 'single_modernization') {
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

  // Default
  return `
Produce a thorough structured analysis with clear sections: Executive Summary, Findings, Risk Signals, and Recommendations. Use actual figures and terminology from the documents. Be specific and actionable.
`;
}

// ─── Main analyze function ────────────────────────────────────────────────────

async function analyze(documentText, reviewType, benchmarkContext) {
  const systemPrompt = getRulebook();
  const reportTemplate = getReportTemplate(reviewType);

  const userPrompt = `${benchmarkContext ? benchmarkContext + '\n\n' : ''}Review Type: ${reviewType}

DOCUMENTS SUBMITTED FOR ANALYSIS:
${documentText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSTRUCTIONS:
${reportTemplate}

After your structured report, output the data extraction section:

---REPORT_BODY---
[Your complete structured report following the template above]

---EXTRACTION_JSON---
{"schema_version":"1.1","module":"${getModule(reviewType)}","state":null,"market":null,"equipment_type":null,"contract_type":null,"unit_count":null,"confidence_overall":"medium","benchmark_version":"1.0","flags":[],"labor_data":[],"line_items":[],"parts_data":[],"contract_terms":{}}

Replace the JSON placeholder with actual extracted data from the documents. Valid JSON only. No markdown. No code fences.`;

  const timeoutMs = Number(process.env.CLAUDE_TIMEOUT_MS || 120000);
  const response = await Promise.race([
    client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Claude request timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);

  const raw = response.content[0].text;
  const splitMarker = '---EXTRACTION_JSON---';
  const splitIndex = raw.indexOf(splitMarker);

  if (splitIndex === -1) {
    return { reportBody: raw.replace('---REPORT_BODY---', '').trim(), extractionJson: null };
  }

  const reportBody = raw
    .substring(0, splitIndex)
    .replace('---REPORT_BODY---', '')
    .trim();
  const extractionJson = raw.substring(splitIndex + splitMarker.length).trim();

  return { reportBody, extractionJson };
}

function getModule(reviewType) {
  if (reviewType === 'invoice_review' || reviewType === 'contract_coverage') return 'A';
  if (reviewType === 'maintenance_bid_comparison') return 'C';
  return 'B';
}

module.exports = { analyze };
