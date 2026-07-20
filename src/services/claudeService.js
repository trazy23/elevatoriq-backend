const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function getRulebook() {
  const candidateRulebook = process.env.ELEVATORIQ_RULEBOOK_FILE || 'rulebook_v2.txt';
  const rulebookPath = path.join(__dirname, '../..', candidateRulebook);
  if (fs.existsSync(rulebookPath)) {
    return fs.readFileSync(rulebookPath, 'utf8');
  }

  const fallbackRulebookPath = path.join(__dirname, '../../rulebook_v2.txt');
  if (fs.existsSync(fallbackRulebookPath)) {
    return fs.readFileSync(fallbackRulebookPath, 'utf8');
  }

  const legacyFallbackRulebookPath = path.join(__dirname, '../../rulebook_v1.txt');
  if (fs.existsSync(legacyFallbackRulebookPath)) {
    return fs.readFileSync(legacyFallbackRulebookPath, 'utf8');
  }

  return `You are ElevatorIQ, an independent, vendor-neutral elevator document intelligence engine.
Analyze uploaded elevator invoices, contracts, and proposals using document evidence only.
Be specific, plain-English, conservative, and useful to a property decision-maker.
Separate severity from confidence. Tie material findings to evidence anchors.
Do not make legal, safety, code, or vendor-endorsement determinations.`;
}

// ─── Report structure templates by review type ───────────────────────────────

function getReportTemplate(reviewType) {
  if (reviewType === 'modernization_comparison' || reviewType === 'bid_comparison') {
    return `
You are producing an ElevatorIQ Modernization Bid Comparison Report. Follow this section structure. Be specific, use actual numbers from the documents, and follow the rulebook boundaries.

Do not recommend a vendor as "best" based on reputation or opinion. You may identify the strongest documented value signal if it is based only on uploaded-document evidence: price, scope completeness, exclusions, warranty, schedule, payment terms, and risk exposure.

═══════════════════════════════════════════════
SECTION 1 — EXECUTIVE SUMMARY
═══════════════════════════════════════════════
Write a concise first-page summary: what is being compared, price spread, top 3 decision issues, strongest documented value signal if supported, and unresolved blockers.

═══════════════════════════════════════════════
SECTION 2 — DOCUMENTS REVIEWED
═══════════════════════════════════════════════
List the documents, vendors as Vendor A/B/C unless identity handling allows names, dates if visible, units/building count if visible, and missing documents.

═══════════════════════════════════════════════
SECTION 3 — PROPOSAL SNAPSHOT TABLE
═══════════════════════════════════════════════
Compare base price, alternates/adders/deducts, effective price range, unit count, project type, schedule, warranty, payment terms, and major exclusions.

═══════════════════════════════════════════════
SECTION 4 — SCOPE NORMALIZATION MATRIX
═══════════════════════════════════════════════
Build a normalized matrix using Included / Excluded / Ambiguous / Not Addressed / Owner Responsibility / Allowance Only / By Others. Focus on controller, doors, cab, hydraulic/traction equipment, electrical, fire alarm, permits/inspection, testing, warranty, temporary service, closeout docs, schedule, and owner responsibilities.

═══════════════════════════════════════════════
SECTION 5 — KEY COST AND SCOPE DIFFERENCES
═══════════════════════════════════════════════
Explain differences that may affect final cost or comparability. Do not invent adjustment amounts. If an excluded item lacks price, label it as unpriced exposure.

═══════════════════════════════════════════════
SECTION 6 — RISK SIGNALS BY PROPOSAL
═══════════════════════════════════════════════
For each material finding use this format:
[SEVERITY] Finding title
Evidence anchor: Quote, line item, section, or stated absence
Confidence: HIGH / MEDIUM-HIGH / MEDIUM / LOW
Why it matters: Plain-English owner impact
Ask the vendor: One pasteable question
Requested backup: The document or clarification needed

═══════════════════════════════════════════════
SECTION 7 — SERVICEABILITY / LOCK-IN REVIEW
═══════════════════════════════════════════════
Discuss only equipment, controller, tooling, software, parts, diagnostic, or maintenance-access implications supported by the documents. Do not make unsupported manufacturer reputation claims or service-network claims.

═══════════════════════════════════════════════
SECTION 8 — QUESTIONS TO ASK EACH VENDOR
═══════════════════════════════════════════════
List 3–5 specific, pasteable questions per vendor, tied to documented gaps or ambiguities.

═══════════════════════════════════════════════
SECTION 9 — BOTTOM LINE / DECISION READINESS
═══════════════════════════════════════════════
Use decision-readiness language, not award instructions. Allowed: "Vendor A appears to have the most complete documented scope, while Vendor B appears lower-priced but not directly comparable until exclusions are priced." Not allowed: "Award to Vendor A" or "Choose Vendor A."

═══════════════════════════════════════════════
SECTION 10 — WHAT THIS REVIEW ESTABLISHES / DOES NOT ESTABLISH
═══════════════════════════════════════════════
State what the uploaded documents support and what they do not prove.

═══════════════════════════════════════════════
SECTION 11 — WHAT TO UPLOAD NEXT
═══════════════════════════════════════════════
List missing schedules, specs, exclusions, warranty, maintenance terms, drawings, addenda, alternates, or scope clarifications needed before award.

═══════════════════════════════════════════════
SECTION 12 — ABOUT THIS REPORT
═══════════════════════════════════════════════
Include the standard informational / not legal / not engineering / not safety / vendor-neutral disclaimer.`;
  }

  if (reviewType === 'maintenance_bid_comparison') {
    return `
You are producing an ElevatorIQ Maintenance Bid Comparison Report. Follow this section structure. This is NOT a modernization report. Focus on recurring maintenance economics, coverage, callbacks, exclusions, renewal terms, and true annual exposure.

Do not rank vendors by reputation or say which vendor to choose. You may identify which proposal appears to provide stronger documented coverage or lower documented exposure based on the uploaded terms.

═══════════════════════════════════════════════
SECTION 1 — EXECUTIVE SUMMARY
═══════════════════════════════════════════════
Write a concise first-page summary: proposals compared, monthly/annual price spread, coverage differences that matter most, top 3 risks, and whether the documents are decision-ready.

═══════════════════════════════════════════════
SECTION 2 — DOCUMENTS REVIEWED
═══════════════════════════════════════════════
List the proposals/contracts, vendors as Vendor A/B/C unless identity handling allows names, dates if visible, unit count if visible, and missing documents.

═══════════════════════════════════════════════
SECTION 3 — PROPOSAL SNAPSHOT TABLE
═══════════════════════════════════════════════
Compare monthly price, annual price, unit count, term length, service type, PM frequency, callback coverage, after-hours coverage, parts coverage, escalation, auto-renewal, cancellation window, and major exclusions.

═══════════════════════════════════════════════
SECTION 4 — COVERAGE COMPARISON MATRIX
═══════════════════════════════════════════════
Use Included / Excluded / Ambiguous / Not Addressed. Compare: routine PM, callbacks, overtime/after-hours, travel/minimums, labor, standard parts, major components, testing support, entrapments, reporting/PM logs, obsolescence, proprietary tooling, material markup, and rate sheets.

═══════════════════════════════════════════════
SECTION 5 — TRUE COST EXPOSURE REVIEW
═══════════════════════════════════════════════
Explain where a lower monthly price may create higher repair/callback/after-hours/parts exposure. Do not invent dollar adjustments. If rates or terms are missing, label them as missing-cost exposure.

═══════════════════════════════════════════════
SECTION 6 — CONTRACT TERM / RENEWAL / ESCALATION REVIEW
═══════════════════════════════════════════════
Compare term length, auto-renewal, notice window, annual increases, cancellation rights, insurance/indemnity, limitation of liability, and unilateral change language.

═══════════════════════════════════════════════
SECTION 7 — RISK SIGNALS BY PROPOSAL
═══════════════════════════════════════════════
For each material finding use this format:
[SEVERITY] Finding title
Evidence anchor: Quote, line item, section, or stated absence
Confidence: HIGH / MEDIUM-HIGH / MEDIUM / LOW
Why it matters: Plain-English owner impact
Ask the vendor: One pasteable question
Requested backup: The document or clarification needed

═══════════════════════════════════════════════
SECTION 8 — QUESTIONS TO ASK EACH VENDOR
═══════════════════════════════════════════════
List 3–5 specific, pasteable questions per vendor, focused on coverage, callbacks, after-hours, parts, PM logs, renewal, escalation, and exclusions.

═══════════════════════════════════════════════
SECTION 9 — BOTTOM LINE / DECISION READINESS
═══════════════════════════════════════════════
Use decision-readiness language, not award instructions. Allowed: "Vendor A appears to provide broader documented coverage; Vendor B is lower monthly cost but not directly comparable until callback, parts, and after-hours exposure are clarified." Not allowed: "Choose Vendor A."

═══════════════════════════════════════════════
SECTION 10 — WHAT THIS REVIEW ESTABLISHES / DOES NOT ESTABLISH
═══════════════════════════════════════════════
State what the uploaded documents support and what they do not prove.

═══════════════════════════════════════════════
SECTION 11 — WHAT TO UPLOAD NEXT
═══════════════════════════════════════════════
List missing rate sheets, service ticket examples, PM frequency exhibit, callback log, parts coverage exhibit, full terms, amendments, and cancellation/escalation language.

═══════════════════════════════════════════════
SECTION 12 — ABOUT THIS REPORT
═══════════════════════════════════════════════
Include the standard informational / not legal / not engineering / not safety / vendor-neutral disclaimer.`;
  }

  if (reviewType === 'invoice_review' || reviewType === 'contract_coverage') {
    return `
You are producing an ElevatorIQ Invoice / Contract Review Report. Follow this structure and the rulebook boundaries.

Do not say pay, refuse to pay, dispute, fraud, scam, illegal, unsafe, or overcharged as conclusions. Use "warrants clarification," "appears covered by the documents provided," "appears billable but needs backup," or "not decision-ready."

═══════════════════════════════════════════════
SECTION 1 — EXECUTIVE SUMMARY
═══════════════════════════════════════════════
Summarize total amount reviewed if applicable, documents reviewed, key findings, top 3 risks or gaps, and decision-readiness. Do not give a pay/dispute/refuse disposition.

═══════════════════════════════════════════════
SECTION 2 — DOCUMENTS REVIEWED
═══════════════════════════════════════════════
List invoices/contracts/tickets reviewed, date ranges, units if visible, and missing documents needed for a stronger conclusion.

═══════════════════════════════════════════════
SECTION 3 — CONTRACT / COVERAGE SUMMARY
═══════════════════════════════════════════════
Summarize what appears included, excluded, ambiguous, not addressed, and unsupported based on the uploaded documents.

═══════════════════════════════════════════════
SECTION 4 — LINE ITEM OR TERM FINDINGS
═══════════════════════════════════════════════
For each material charge or term use this format:
[SEVERITY] Finding title
Evidence anchor: Quote, line item, section, amount, or stated absence
Assessment: In-Scope / Out-of-Scope / Ambiguous / Unsupported / Potential Scope Conflict / Documentation Gap / No Issue Identified
Confidence: HIGH / MEDIUM-HIGH / MEDIUM / LOW
Why it matters: Plain-English owner impact
Ask the vendor: One pasteable question
Requested backup: Contract section, ticket, mechanic notes, rate sheet, quote approval, supplier invoice, or other support needed

═══════════════════════════════════════════════
SECTION 5 — PATTERN REVIEW
═══════════════════════════════════════════════
Identify repeat repairs, duplicate charge signals, callback patterns, PM gaps, rate/markup inconsistencies, or cross-document mismatches. Frame these as signals and documentation requests, not accusations.

═══════════════════════════════════════════════
SECTION 6 — FINANCIAL EXPOSURE SUMMARY
═══════════════════════════════════════════════
Use these categories instead of "amount to dispute" or "amount to pay":
- Charges that appear covered by contract and warrant clarification
- Charges that appear billable but need backup
- Charges not decision-ready from the documents provided
- Charges with no issue identified
Include amounts only when they are stated in the documents.

═══════════════════════════════════════════════
SECTION 7 — QUESTIONS TO ASK
═══════════════════════════════════════════════
List specific, pasteable questions grouped by invoice, term, or vendor.

═══════════════════════════════════════════════
SECTION 8 — WHAT THIS REVIEW ESTABLISHES / DOES NOT ESTABLISH
═══════════════════════════════════════════════
State what the uploaded documents support and what they do not prove.

═══════════════════════════════════════════════
SECTION 9 — WHAT TO UPLOAD NEXT
═══════════════════════════════════════════════
List contract, amendments, tickets, callback log, PM log, rate sheet, quote approval, supplier invoice, or mechanic notes needed next.

═══════════════════════════════════════════════
SECTION 10 — ABOUT THIS REPORT
═══════════════════════════════════════════════
Include the standard informational / not legal / not engineering / not safety / vendor-neutral disclaimer.`;
  }

  if (reviewType === 'single_modernization' || reviewType === 'modernization_bid') {
    return `
You are producing an ElevatorIQ Single Modernization / Capital Proposal Review Report. Follow this structure and the rulebook boundaries.

Do not say sign, reject, or choose the vendor. Use decision-readiness language and specific clarification/negotiation points.

═══════════════════════════════════════════════
SECTION 1 — EXECUTIVE SUMMARY
═══════════════════════════════════════════════
Summarize proposal type, price, units, scope, top 3 risks/gaps, and whether the proposal is decision-ready as written.

═══════════════════════════════════════════════
SECTION 2 — DOCUMENTS REVIEWED
═══════════════════════════════════════════════
List proposal documents, dates if visible, unit count if visible, and missing documents.

═══════════════════════════════════════════════
SECTION 3 — PROPOSAL SNAPSHOT
═══════════════════════════════════════════════
Capture vendor label, price, alternates, project type, schedule, warranty, payment terms, exclusions, and owner responsibilities.

═══════════════════════════════════════════════
SECTION 4 — SCOPE COMPLETENESS REVIEW
═══════════════════════════════════════════════
Classify included, excluded, ambiguous, not addressed, owner responsibility, allowance only, and by others items.

═══════════════════════════════════════════════
SECTION 5 — PRICE AND TERMS CONTEXT
═══════════════════════════════════════════════
Discuss stated price, alternates, escalation, deposits, change-order terms, and benchmark context only when provided or rulebook-supported. Label benchmark context as anonymized context, not proof.

═══════════════════════════════════════════════
SECTION 6 — RISK SIGNALS AND AMBIGUITIES
═══════════════════════════════════════════════
For each material finding use this format:
[SEVERITY] Finding title
Evidence anchor: Quote, line item, section, or stated absence
Confidence: HIGH / MEDIUM-HIGH / MEDIUM / LOW
Why it matters: Plain-English owner impact
Ask the vendor: One pasteable question
Requested backup: The document or clarification needed

═══════════════════════════════════════════════
SECTION 7 — OWNER RESPONSIBILITIES AND POSSIBLE HIDDEN COSTS
═══════════════════════════════════════════════
Identify unpriced owner work, by-others items, allowances, inspections, fire alarm/electrical work, storage, remobilization, and schedule dependencies.

═══════════════════════════════════════════════
SECTION 8 — WARRANTY / MAINTENANCE / SERVICEABILITY REVIEW
═══════════════════════════════════════════════
Discuss only documented warranty, maintenance condition, controller/tooling/parts/serviceability implications, and future competitive service concerns.

═══════════════════════════════════════════════
SECTION 9 — QUESTIONS TO ASK BEFORE SIGNING
═══════════════════════════════════════════════
List specific, pasteable questions tied to documented gaps.

═══════════════════════════════════════════════
SECTION 10 — SUGGESTED CLARIFICATION POINTS
═══════════════════════════════════════════════
List contract-review or proposal-clarification points. Do not phrase as legal advice.

═══════════════════════════════════════════════
SECTION 11 — WHAT THIS REVIEW ESTABLISHES / DOES NOT ESTABLISH
═══════════════════════════════════════════════
State what the uploaded documents support and what they do not prove.

═══════════════════════════════════════════════
SECTION 12 — WHAT TO UPLOAD NEXT
═══════════════════════════════════════════════
List missing specs, exclusions, warranty, maintenance terms, alternates, drawings, addenda, rate sheets, and schedule information.

═══════════════════════════════════════════════
SECTION 13 — ABOUT THIS REPORT
═══════════════════════════════════════════════
Include the standard informational / not legal / not engineering / not safety / vendor-neutral disclaimer.`;
  }

  // Default
  return `
Produce an ElevatorIQ Advisory Analysis with these sections: Executive Summary, Documents Reviewed, Key Findings, Risk Signals, Questions to Ask, What This Review Establishes / Does Not Establish, What to Upload Next, and About This Report. Use actual figures and document evidence. Be specific, conservative, and actionable. If review type is uncertain, state the likely review type and confidence.`;
}

function getDocumentTypeContext(reviewType) {
  const contexts = {
    maintenance_bid: `PRE-READ BRIEF — MAINTENANCE CONTRACT ANALYSIS
You are about to analyze a maintenance contract or proposal. Before reading, prime yourself on the most common high-value findings in maintenance contract reviews:
- EVERGREEN TRAP: Short cancellation windows (30 days or less) that auto-renew the contract for full terms. Use the submitted agreement only; a short notice window can materially limit cancellation flexibility.
- UNCAPPED ESCALATION: Contracts that tie price increases to "vendor's costs" or allow increases above CPI-U with no cap. A 3–5% cap or CPI-U, whichever is lower, is the industry standard.
- PROPRIETARY LOCK-IN: Language requiring the owner to use only this vendor for any additional repairs, modernization, or work. Clauses stating that third-party service voids coverage are highly restrictive.
- PARTS MARKUP: Full-service contracts should include all parts. Any language allowing the vendor to separately charge for parts on a "full-service" agreement is a material coverage gap.
- MAJOR COMPONENT EXCLUSIONS: Motor, controller, valve body, and jack/cylinder are the high-cost components. Some contracts exclude these. A contract called "full-service" that excludes major components may not provide the coverage the owner expects.
- MULTI-UNIT DISCOUNT: Buildings with 3+ units should get 10–20% per-unit discounts. Pricing that looks like single-unit rates on a multi-unit building warrants clarification.
- TERM TRAP ON AGING EQUIPMENT: A vendor pushing a 5-year contract on equipment that is 20+ years old is locking the owner in through a likely modernization decision period. Flag this as a decision-readiness issue.`,

    invoice_review: `PRE-READ BRIEF — INVOICE & BILLING REVIEW ANALYSIS
You are about to analyze an elevator maintenance invoice. Before reading, prime yourself on the most common billing documentation and anomaly patterns:
- SCOPE CREEP BILLING: Charges for work that falls within a full-service maintenance agreement (adjustments, lubrication, safety device testing, callbacks) billed as extra. This is a common clarification point in invoice reviews.
- LABOR RATE OUTLIER: Licensed elevator mechanic rates in Ohio/Michigan are $85–135/hr straight time, $130–200/hr overtime (2025). Rates significantly above this range need justification.
- MINIMUM HOUR MISMATCH: A 15-minute callback billed as a 4-hour minimum. Standard is a 2-hour minimum for callbacks; anything above that on a routine service call is a flag.
- PARTS MARKUP: The contract may specify a markup cap (typically 10–20%). Parts billed at cost-plus-40% or higher without a contract basis need backup.
- RETROACTIVE BILLING: Work performed 3–6 months ago billed today with no explanation. This may indicate the vendor is catching up on unbilled work or documentation gaps.
- MODERNIZATION ON MAINTENANCE INVOICE: Capital repair or upgrade work billed on a routine maintenance invoice without a separate work order or change order. This bypasses normal owner approval.
- VAGUE DESCRIPTIONS: "Miscellaneous parts $850" or "Service labor 8 hrs" with no specifics are risk signals — the owner cannot verify what was done or whether it was necessary.
- DUPLICATE BILLING: The same repair or part appearing on multiple months' invoices. Check carefully for repeated line items.`,

    new_construction_bid: `PRE-READ BRIEF — NEW CONSTRUCTION BID ANALYSIS
You are about to analyze a new elevator installation bid. Before reading, prime yourself on the most common findings:
- TARIFF EXPOSURE: Post-2025 trade policy has introduced significant steel, aluminum, and copper tariff uncertainty. Any contract without a fixed-price guarantee or with open-ended "material cost adjustment" language creates real financial exposure for the owner.
- SCOPE SPLIT LIABILITY: New construction bids often exclude items that are the GC's responsibility — hoist beam, electrical service to machine room, pit construction, fire alarm integration, grouting. When these are ambiguous or unstated, they become change order disputes. Every item must be explicitly assigned.
- PROPRIETARY ARCHITECTURE: Major OEMs (Otis, KONE, Schindler, TK) design systems that require their own service technicians. The equipment choice made at construction is the equipment the owner will service for 20–30 years. Assess the long-term cost of this lock-in.
- WARRANTY GAPS: Standard warranty is 12 months parts and labor from substantial completion, including after-hours callback. Any warranty shorter than 12 months or that excludes after-hours emergency response in year 1 is below standard.
- ADA / ACCESSIBILITY: Elevator code and ADA requirements for landing accuracy, door timing, button placement, and cab dimensions. Flag if the proposal doesn't address accessibility compliance.
- INSPECTION AND REINSPECTION FEES: Who pays for the state inspection and any reinspections if the unit fails? This is often several hundred to a few thousand dollars and frequently excluded.`,

    repair_bid: `PRE-READ BRIEF — REPAIR BID ANALYSIS
You are about to analyze an elevator repair bid. The single most important question is: DOES THE SUBMITTED CONTRACT ADDRESS THIS REPAIR? Before reading:
- FULL-SERVICE CONTRACT COVERAGE: A full-service maintenance agreement covers virtually all parts and labor including motors, valves, controllers, door equipment, and safety devices. If the owner has a full-service contract, a separate repair bill may need contract-coverage clarification.
- BAND-AID REPAIRS: A repair that addresses the symptom without the root cause will result in repeat failure. A new motor installed without addressing the electrical issue that burned the original motor will fail again.
- REPAIR VS. REPLACE THRESHOLD: For elevator components, when a repair costs more than 30–40% of component replacement cost, or when equipment is 20+ years old, a modernization conversation may be more economical.
- FAILURE MODE LOGIC: The repair scope should logically address the reported failure. If an elevator stopped responding to calls and the repair is a door operator replacement, ask whether that explains the symptom.
- WARRANTY PERIOD: Recently installed equipment or components are typically under a 12-month warranty. If the failed component was installed within the past year by the same vendor, this may be a warranty claim, not a repair bill.`,

    modernization_bid: `PRE-READ BRIEF — MODERNIZATION BID ANALYSIS
You are about to analyze an elevator modernization proposal. Before reading, prime yourself on high-value findings:
- PAYMENT TERMS: Mobilization deposits above 25–30% are aggressive. Final payment should not be due until inspection is passed and the unit is accepted. Milestone-based payment tied to deliverables (shop drawings, equipment delivery, installation complete, inspection passed) is the standard.
- TARIFF EXPOSURE: Steel, aluminum, and copper tariff volatility is significant in 2025–2026. Any contract with open-ended material escalation clauses without a cap represents real cost risk. Fixed-price with no escalation is the owner's preference.
- SCOPE AMBIGUITY: Hydraulic modernizations should specify whether the jack/cylinder is included or only the HPU and controller. Traction modernizations should specify whether ropes, traveling cable, and cab interior are included. Ambiguity here becomes a change order.
- BUILDING IMPACT: How long will the unit be out of service? Multi-elevator buildings: what is the service level during modernization? A realistic outage estimate is 6–14 weeks for a full hydraulic mod, 10–20 weeks for full traction modernization depending on complexity.
- WARRANTY: 12 months parts and labor from acceptance (not from equipment manufacture date) is standard. After-hours callback coverage during warranty is expected. Less than this is below standard.`,

    single_modernization: `PRE-READ BRIEF — MODERNIZATION BID ANALYSIS
You are about to analyze an elevator modernization proposal. Before reading, prime yourself on high-value findings:
- PAYMENT TERMS: Mobilization deposits above 25–30% are aggressive. Final payment should not be due until inspection is passed and the unit is accepted. Milestone-based payment tied to deliverables (shop drawings, equipment delivery, installation complete, inspection passed) is the standard.
- TARIFF EXPOSURE: Steel, aluminum, and copper tariff volatility is significant in 2025–2026. Any contract with open-ended material escalation clauses without a cap represents real cost risk. Fixed-price with no escalation is the owner's preference.
- SCOPE AMBIGUITY: Hydraulic modernizations should specify whether the jack/cylinder is included or only the HPU and controller. Traction modernizations should specify whether ropes, traveling cable, and cab interior are included. Ambiguity here becomes a change order.
- BUILDING IMPACT: How long will the unit be out of service? Multi-elevator buildings: what is the service level during modernization? A realistic outage estimate is 6–14 weeks for a full hydraulic mod, 10–20 weeks for full traction modernization depending on complexity.
- WARRANTY: 12 months parts and labor from acceptance (not from equipment manufacture date) is standard. After-hours callback coverage during warranty is expected. Less than this is below standard.`,

    bid_comparison: `PRE-READ BRIEF — BID COMPARISON ANALYSIS
You are about to analyze multiple competing bids. Before reading, prime yourself on the most important comparison dimensions:
- SCOPE-ADJUSTED PRICE: The lowest bid is not the best value if scope is missing. Normalize all bids to the same scope before comparing price. A bid $15,000 lower that excludes inspection fees, reinspection, and final cleaning may be equivalent or more expensive on a true apples-to-apples basis.
- PROPRIETARY LOCK-IN RISK: The equipment choice made at bid award determines what service options may be available over 20–30 years. OEM-proprietary systems (Otis, KONE, Schindler, TK) restrict future service. An independent-friendly system may cost more upfront but save significantly over the service life.
- TARIFF EXPOSURE: Which vendors offer fixed-price contracts vs. material escalation clauses? In a tariff-volatile environment, a fixed-price guarantee has real economic value and justifies a small price premium.
- SCHEDULE CREDIBILITY: Compare proposed lead times. If one vendor promises 30% faster completion than others for similar scope, this is either a competitive advantage or an unrealistic promise that will result in delays and disputes.
- SERVICE NETWORK: The lowest-cost bidder with weak local service capacity is a long-term risk. Ask for verifiable local references with similar equipment when the documents do not establish service capacity.`,

    modernization_comparison: `PRE-READ BRIEF — MODERNIZATION BID COMPARISON ANALYSIS
You are about to analyze competing modernization bids. Key comparison dimensions:
- SCOPE NORMALIZATION: What does each bid include for the hydraulic or traction components? Jack/cylinder inclusion, ropes, traveling cable, cab interior — these vary widely and drive price differences.
- TARIFF AND PRICE LOCK: Which vendors offer firm fixed-price vs. material escalation exposure? In 2025–2026, this is a material risk difference.
- BUILDING IMPACT: Compare outage duration estimates. A realistic full hydraulic modernization is 6–14 weeks; full traction is 10–20 weeks. Significantly shorter estimates deserve scrutiny.
- PAYMENT SCHEDULE: Compare mobilization deposits and milestone structure. Large upfront deposits with no tie to performance milestones favor the vendor, not the owner.`,

    maintenance_bid_comparison: `PRE-READ BRIEF — MAINTENANCE CONTRACT COMPARISON ANALYSIS
You are about to compare maintenance contract proposals. Key comparison dimensions:
- CONTRACT TYPE CONSISTENCY: Are all vendors proposing the same contract type (full-service vs. oil & grease vs. parts & labor)? Comparing a full-service proposal to an oil & grease proposal as if they're equivalent is a critical error.
- PRICE PER UNIT NORMALIZATION: Multi-unit buildings should see per-unit pricing. Compare per-unit rates, not just totals.
- ESCALATION TERMS: Which vendors offer a fixed price cap vs. uncapped escalation? Over a 3- or 5-year contract, a 5% annual escalation compounds significantly.
- COVERAGE GAPS: What does each vendor's "full-service" actually cover? Major components, proprietary diagnostics, callback volume limits — these vary.
- CANCELLATION TERMS: Compare notice windows and early termination penalties. A 30-day cancellation window vs. a 90-day window on otherwise identical contracts has very different lock-in risk.`,

    contract_coverage: `PRE-READ BRIEF — CONTRACT COVERAGE & INVOICE ANALYSIS
You are about to analyze a maintenance contract or invoice to assess coverage and billing accuracy. Before reading, prime yourself on the most common high-value findings:
- SCOPE CREEP BILLING: Charges for work that falls within a full-service maintenance agreement (adjustments, lubrication, safety device testing, callbacks) billed as extra. This is a common clarification point in invoice reviews.
- LABOR RATE OUTLIER: Licensed elevator mechanic rates in Ohio/Michigan are $85–135/hr straight time, $130–200/hr overtime (2025). Rates significantly above this range need justification.
- MINIMUM HOUR MISMATCH: A 15-minute callback billed as a 4-hour minimum. Standard is a 2-hour minimum for callbacks; anything above that on a routine service call is a flag.
- PARTS MARKUP: The contract may specify a markup cap (typically 10–20%). Parts billed at cost-plus-40% or higher without a contract basis need backup.
- EVERGREEN TRAP: Short cancellation windows (30 days or less) that auto-renew the contract for full terms. Use the submitted agreement only; a short notice window can materially limit cancellation flexibility.
- MAJOR COMPONENT EXCLUSIONS: Motor, controller, valve body, and jack/cylinder are the high-cost components. A contract called "full-service" that excludes these is misrepresented.
- PROPRIETARY LOCK-IN: Language requiring the owner to use only this vendor for any additional repairs, modernization, or work. This is a material restriction.
- RETROACTIVE BILLING: Work performed 3–6 months ago billed today with no explanation is a red flag — the owner cannot verify whether the work occurred.`,
  };

  const ctx = contexts[reviewType];
  if (!ctx) return '';
  return `${ctx}\n\n${'─'.repeat(72)}\n\n`;
}

function getExtractionPlaceholder(reviewType) {
  return {
    schema_version: '2.0',
    review_type: reviewType,
    review_type_confidence: 'medium',
    module: getModule(reviewType),
    state: null,
    market: null,
    equipment_type: null,
    contract_type: null,
    unit_count: null,
    confidence_overall: 'medium',
    benchmark_version: '2.0-seeded-context',
    documents_reviewed: [],
    vendors: [],
    flags: [],
    findings: [],
    questions_to_ask: [],
    missing_documents: [],
    decision_readiness: {
      status: 'not_decision_ready',
      summary: null,
      blockers: []
    },
    normalized_price_comparison: [],
    scope_matrix: [],
    coverage_matrix: [],
    labor_data: [],
    line_items: [],
    parts_data: [],
    contract_terms: {}
  };
}

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

// ─── Verification pass ───────────────────────────────────────────────────────
// Runs after the main report is generated. Uses Haiku (fast + cheap) to
// cross-check every factual claim in the report against the source text.
// Results are logged to Render and returned in meta — they don't block delivery.

async function verifyReport(reportBody, preparedText, timeoutMs) {
  // Cap source text sent to verifier — summaries are already bounded,
  // but raw docs can be large. 15k chars covers most proposals fully.
  const sourceSnippet = preparedText.substring(0, 15000);
  const reportSnippet = reportBody.substring(0, 8000);

  const verifyPrompt = `You are a fact-checker auditing an elevator industry analysis report for unsupported claims.

You will receive:
1. SOURCE TEXT — the document(s) that were analyzed (may be summaries of longer originals)
2. ANALYSIS REPORT — the report generated from those documents

Your job: identify factual claims in the ANALYSIS REPORT that are NOT directly supported by explicit language in the SOURCE TEXT.

ONLY flag claims about:
- Scope item dispositions: what is retained, replaced, new, or excluded (e.g., "Vendor B replaces the jack")
- Specific dollar amounts, percentages, or numeric terms attributed to a vendor
- Payment milestones or deposit structures
- Warranty durations or conditions
- Specific clause language attributed to a document

DO NOT flag:
- Interpretive analysis, risk assessments, or recommendations — these are opinions
- Industry context statements (e.g., "hydraulic jacks typically last 25-40 years")
- Claims where the source is simply silent — absence is not a fabrication
- Minor paraphrasing of language that is clearly present in the source

Output only valid JSON. No markdown, no explanation outside the JSON.

If no unsupported claims found:
{"verified":true,"flags":[]}

If unsupported claims found:
{"verified":false,"flags":[{"claim":"exact quote or paraphrase of the claim from the report","location":"e.g. Section 4 — Scope Comparison, Jack paragraph","issue":"why it lacks source support"}]}

SOURCE TEXT:
${sourceSnippet}

ANALYSIS REPORT:
${reportSnippet}`;

  try {
    const resp = await callClaude({
      systemPrompt: 'You are a precise fact-checker. Output only valid JSON. No markdown, no preamble.',
      userPrompt: verifyPrompt,
      maxTokens: 1200,
      timeoutMs: Math.min(timeoutMs, 60000),
      model: 'claude-haiku-4-5-20251001',
    });

    const raw = resp.content?.[0]?.text?.trim() || '';
    // Strip markdown code fences — Claude occasionally wraps JSON in ```json ... ```
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    const result = JSON.parse(cleaned);

    if (!result.verified && result.flags?.length > 0) {
      console.warn(`[ElevatorIQ Verify] ⚠️  ${result.flags.length} unsupported claim(s) detected in report:`);
      result.flags.forEach((f, i) => {
        console.warn(`  [${i + 1}] Claim: "${f.claim}"`);
        console.warn(`       Location: ${f.location}`);
        console.warn(`       Issue: ${f.issue}`);
      });
    } else {
      console.log('[ElevatorIQ Verify] ✅ All checked claims supported by source documents.');
    }

    return result;
  } catch (err) {
    console.warn('[ElevatorIQ Verify] Verification pass failed (non-blocking):', err.message);
    return null;
  }
}

async function summarizeChunk(chunk, idx, total, timeoutMs) {
  const prompt = `You are preparing synthesis notes for a final elevator proposal review.
Summarize the following document section. Keep concise but specific.

CRITICAL — SCOPE DISPOSITION ACCURACY:
- For every scope item found in tables or lists, record its exact disposition using one of: RETAIN EXISTING | NEW | REPLACE | EXCLUDE | OWNER RESPONSIBILITY
- A "New" packing, seal, gasket, or minor component on a retained assembly is NOT replacement of that assembly. Treat them separately.
  - Correct: "Jack: RETAIN EXISTING | Jack Packing/Seal: NEW"
  - Wrong: "New jack"
- Copy the exact disposition word from the source table. If the table says "Retain" — write RETAIN EXISTING. If it says "New" — write NEW.
- Never merge, combine, or infer dispositions across related line items.
- If a scope table is present, list every row with its item name and disposition. Do not omit rows.

Required output headings:
- Commercial terms
- Scope items (list each item as: "[Item Name]: [DISPOSITION]" — one per line, verbatim from source table if present)
- Scope excludes / owner responsibilities
- Risk signals
- Timeline / lead time
- Verbatim snippets (max 5 short quotes — prioritize scope table rows and pricing lines)

Document section:
${chunk}`;

  const resp = await callClaude({
    systemPrompt: 'Create factual extraction notes only. Preserve exact scope dispositions — do not paraphrase or merge scope table rows. No recommendations.',
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
    summaries.push(summary);
  }

  return {
    preparedText: `[DOCUMENT CONTENT]\n${summaries.join('\n\n---\n\n')}`,
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
  const extractionPlaceholder = JSON.stringify(getExtractionPlaceholder(reviewType));
  const timeoutMs = Number(process.env.CLAUDE_TIMEOUT_MS || 300000);

  const { preparedText, usedChunking, chunkCount } = await buildAnalysisInput(documentText, timeoutMs);

  // Inject type-specific pre-read context before the document text.
  // This primes Claude with the most common high-value findings for this
  // review type, sharpening accuracy without expanding the output template.
  const docTypeContext = getDocumentTypeContext(reviewType);

  const userPrompt = `${benchmarkContext ? benchmarkContext + '\n\n' : ''}Review Type: ${reviewType || 'unspecified'}

${docTypeContext}DOCUMENTS SUBMITTED FOR ANALYSIS:
${preparedText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSTRUCTIONS:
${reportTemplate}

Hard requirements:
- This must be a synthesized rulebook analysis, not a source-document copy.
- Do not paste long verbatim text from source docs.
- Quote only short snippets when needed, then explain implications.
- Use decision-readiness language and clarification points, not risky instructions like pay, dispute, refuse, award, choose, fraud, scam, unsafe, illegal, or overcharged.
- EVIDENCE GROUNDING (CRITICAL — anti-hallucination): Every finding must cite its source. For each flag or risk signal, you must reference where in the document you found it — e.g., "Section 4 states: '[short quote]'" or "The payment terms clause on page 2 specifies...". Do NOT state a finding if you cannot trace it to specific document text. If a clause or provision is absent, say it is absent — do not invent or assume its terms.
- ABSENCE VS. PRESENCE: Never treat the absence of a clause as evidence of misconduct. If a term is not mentioned, state: "[Item] is not addressed in the submitted documents" — then explain why its absence matters. Do not fabricate what a missing clause might say.
- JURISDICTION GUARDRAIL: Only reference specific state elevator codes (e.g. Michigan Act 227, ASME A17.1 as adopted by a state) if the submitted documents explicitly indicate the project state or jurisdiction. If state cannot be determined from the documents, reference only general ASME A17.1 or OSHA standards that apply nationally. Never assume a state based on addresses or phone numbers alone.
- FORMATTING: Do NOT use markdown syntax in your report. Do not use # or ## headers, do not use > blockquotes, do not use --- horizontal rules. Section headers must follow the exact format "SECTION N — TITLE" only. Plain text paragraphs and bullet points (- item) only.

Hard output limits for this single-call report engine:
- Keep the paid report complete but concise: target 1,500-2,200 words.
- Use no more than 6 total material findings unless the user explicitly asks for exhaustive detail.
- Use no more than 2 pasteable questions per vendor, plus no more than 6 total general questions.
- Keep tables compact; do not repeat the same issue in multiple sections.
- The extraction JSON must be valid and complete before the response ends; keep extraction arrays capped to the material items needed for analytics.

Free preview vs paid report behavior:
- If the prompt or document context says this is a free preview, provide a concise teaser: executive summary, 3–5 strongest findings, limited questions, and clear unlock value. Do not include full matrices or exhaustive vendor-by-vendor question sets.
- If no free-preview instruction is present, produce the complete paid-report structure above.

After your structured report, output the data extraction section:

---REPORT_BODY---
[Your complete structured report following the template above]

---EXTRACTION_JSON---
${extractionPlaceholder}

Replace the JSON placeholder with actual extracted data from the documents. Valid JSON only. No markdown. No code fences. Use null when a value is not present. Do not include identifying customer, building, address, or contact names in extraction fields.`;

  try {
    const response = await callClaude({ systemPrompt, userPrompt, timeoutMs, maxTokens: Number(process.env.CLAUDE_MAX_TOKENS || 8000) });
    const raw = response.content?.[0]?.text || '';
    const parsed = parseAnalysisResponse(raw);

    // ── Verification pass ──────────────────────────────────────────────────
    // Runs asynchronously after the main report. Non-blocking: a verify
    // failure never prevents report delivery. Results surface in Render logs
    // and are attached to meta for future admin dashboard visibility.
    let verification = null;
    if (parsed.reportBody) {
      verification = await verifyReport(parsed.reportBody, preparedText, timeoutMs);
    }

    return {
      ...parsed,
      meta: {
        usedChunking,
        chunkCount,
        verification,
      },
    };
  } catch (err) {
    console.warn('[Claude] Analysis failed:', err.message);
    // Return a clearly labeled error report rather than fake success content.
    // The PDF will still generate, but the user will see the failure honestly.
    return {
      reportBody: `ANALYSIS INCOMPLETE — PROCESSING ERROR\n\nElevatorIQ was unable to complete the analysis for this document.\n\nReason: ${err.message || 'Internal processing error'}\n\nThis is not a completed report. No findings, flags, or recommendations have been generated.\n\nPlease contact support@elevatoriq.ai with your case reference to request a re-analysis. If this was a paid report, you are entitled to a full credit or reprocess at no charge.`,
      extractionJson: null,
      meta: { usedChunking, chunkCount, analysisError: true },
    };
  }
}

function getModule(reviewType) {
  if (reviewType === 'invoice_review' || reviewType === 'contract_coverage') return 'A'; // billing/contract review
  if (reviewType === 'maintenance_bid_comparison' || reviewType === 'maintenance_bid') return 'C';
  if (reviewType === 'bid_comparison' || reviewType === 'modernization_comparison') return 'B';
  if (reviewType === 'repair_bid') return 'D';
  return 'B'; // new_construction_bid, modernization_bid, single_modernization, auto, default
}

module.exports = { analyze, __testables: { chunkText, parseAnalysisResponse, buildAnalysisInput } };
