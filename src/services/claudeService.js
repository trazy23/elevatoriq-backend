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
You are producing an ElevatorIQ Structured Bid Comparison Report. Be specific, detailed, and use actual numbers from the documents. Do not generalize.

═══════════════════════════════════════════════
SECTION 1 — EXECUTIVE SUMMARY
═══════════════════════════════════════════════
Write 4–6 sentences covering: what is being compared (scope type, number of units, building type), the price spread between bids, the standout finding, and your overall read on the competitive situation. State which vendor appears to be the leading candidate and why, or explain what prevents you from making that call.

═══════════════════════════════════════════════
SECTION 2 — PRICE COMPARISON
═══════════════════════════════════════════════
Compare all bids on price. Include:
- Base bid price per vendor (clearly labeled)
- Alternates, adders, or deducts listed by each vendor
- Effective all-in price after alternates (best case / worst case for owner)
- Price per unit for apples-to-apples comparison
- Tariff and material escalation clauses — does any vendor offer a fixed price vs. subject to escalation? This is a material risk difference that may justify paying more for a firm price.
- Payment terms comparison — who requires the largest upfront mobilization? Flag deposits above 25–30%.
- Low-bid scrutiny: Is the low bid legitimately competitive or is scope missing? Do not assume the low bid is the best value without scope normalization.

═══════════════════════════════════════════════
SECTION 3 — PRODUCT QUALITY & MANUFACTURER ASSESSMENT
═══════════════════════════════════════════════
For each vendor, assess:
- Manufacturer reputation and specific product line proposed
- Machine Room Less (MRL) vs. hydraulic vs. geared traction — and what that means for long-term maintenance cost and reliability
- Drive system and controller technology — current generation or legacy platform?
- Cab finishes and interior quality as proposed
- Proprietary vs. open architecture: OEM-proprietary systems (Otis, KONE, Schindler, TK Elevator) lock future service to that vendor. Independent-friendly or open-architecture systems provide competitive choice. Assess the lock-in risk and long-term cost implication for each vendor's proposed equipment.
- Service network quality: Which vendors have strong local presence in this market? A lower bid from a vendor with weak local service capacity is a long-term risk.
- 10-year total cost of ownership perspective: Factor in expected maintenance cost differences between the proposed equipment types.

═══════════════════════════════════════════════
SECTION 4 — SCOPE COMPARISON
═══════════════════════════════════════════════
Build a normalized scope matrix. For each item below, state which vendors INCLUDE, EXCLUDE, or leave AMBIGUOUS. Use a clear format — e.g., "Vendor A: Included | Vendor B: Excluded | Vendor C: Ambiguous". Flag any items that represent hidden cost or owner liability:

- Temporary elevator / construction use
- Hoistway prep and pit requirements (by whom)
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
- Warranty period (length, scope, after-hours callback coverage)
- Emergency power provisions
- Phone / cellular connectivity
- ADA compliance provisions (where applicable)
- Tariff / material escalation clause
- Liquidated damages exposure

Flag the scope items where the bids differ most significantly — these often explain apparent price differences.

═══════════════════════════════════════════════
SECTION 5 — RISK SIGNALS
═══════════════════════════════════════════════
List each risk signal found across all bids. Format each as:

[SEVERITY] Item name — Vendor(s) affected
Finding: What the document actually says
Risk: Financial or operational exposure
Recommendation: What to ask for or require before award

═══════════════════════════════════════════════
SECTION 6 — SCHEDULE & LEAD TIME COMPARISON
═══════════════════════════════════════════════
Compare each vendor's:
- Shop drawing submittal timeline
- Manufacturing / fabrication lead time
- Installation duration
- Dependencies (what must be complete before mobilization)
- Key dates and deadlines stated
- Flag any vendor whose schedule is significantly more aggressive than the others — this is either a competitive advantage or an unrealistic promise.

═══════════════════════════════════════════════
SECTION 7 — RECOMMENDED QUESTIONS FOR EACH VENDOR
═══════════════════════════════════════════════
List 3–5 specific, targeted questions for each vendor. These should address the gaps, ambiguities, and high-risk items found in this specific comparison. Do not use generic questions.

═══════════════════════════════════════════════
SECTION 8 — BOTTOM LINE RECOMMENDATION
═══════════════════════════════════════════════
Give a clear, direct recommendation:
- Which bid represents the best overall value and why (scope-adjusted, not just lowest price)
- What conditions or negotiations must happen before award
- What the owner should NOT accept as written in any bid
- Pre-award deliverables to require from the winning vendor (updated schedule, insurance certificates, references with similar equipment in this market, written confirmation of fixed price)
- If you cannot recommend one vendor over another, explain exactly what information would change your analysis
`;
  }

  if (reviewType === 'invoice_review' || reviewType === 'contract_coverage') {
    return `
You are producing an ElevatorIQ Invoice & Billing Review Report. Follow this exact structure:

═══════════════════════════════════════════════
SECTION 1 — EXECUTIVE SUMMARY
═══════════════════════════════════════════════
Summarize: vendor name, invoice number and date, total amount billed, number of line items, and your overall disposition recommendation (Pay As Billed / Pay With Deductions / Hold Pending Clarification / Dispute). Identify the single most significant finding in 1–2 sentences.

═══════════════════════════════════════════════
SECTION 2 — LINE ITEM ANALYSIS
═══════════════════════════════════════════════
Review each charge individually. For each line item write:
- Description as billed and the dollar amount
- Assessment: In-Scope / Out-of-Scope / Ambiguous / Anomaly
- Disposition: Pay / Dispute / Hold
- Explanation: Why you assessed it this way. Reference contract terms if present. Note if labor hours are unreasonable for the described task (e.g., a 15-min callback billed as 4 hours is an anomaly). Flag any parts cost with markup percentage above what the contract allows.

Key anomaly patterns to look for and flag:
- Labor rates that exceed contracted or market rates for the trade (Ohio/Michigan licensed elevator mechanic: $85–135/hr straight time, $130–200/hr overtime as of 2025)
- Minimum hour billings that exceed what the contract specifies (standard: 2-hour minimum for callbacks)
- Parts markup above contracted cap (typical cap: 10–20%; charges above 30% are a red flag)
- Retroactive billing (work date significantly earlier than invoice date with no explanation)
- Charges for work that falls within a full-service maintenance agreement scope
- Modernization or capital work billed on a maintenance invoice without a separate work order
- Duplicate billing across months for the same one-time item
- Vague descriptions with no specificity (e.g., "miscellaneous parts" without itemization)
- After-hours billing where no after-hours work was requested or documented

═══════════════════════════════════════════════
SECTION 3 — CONTRACT COVERAGE ANALYSIS
═══════════════════════════════════════════════
If a maintenance contract is present or referenced: compare each billed item to coverage scope. Explicitly call out any items billed that should be covered under full-service maintenance. State which contract type is in force (full-service, oil & grease, parts & labor) and what that means for what should and should not appear on an invoice.

If no contract is referenced: note this and flag that the owner cannot verify whether billed items are appropriate without a contract on file.

═══════════════════════════════════════════════
SECTION 4 — BILLING ANOMALIES & RED FLAGS
═══════════════════════════════════════════════
List each anomaly found. Format each as:

[SEVERITY] Item name
Finding: What the invoice actually shows
Risk: Financial exposure and why it matters
Recommendation: Specific action (dispute line X, request technician time sheet, request parts receipt, etc.)

═══════════════════════════════════════════════
SECTION 5 — DOCUMENT COMPLETENESS ASSESSMENT
═══════════════════════════════════════════════
What documentation is missing that the owner should have to properly validate this invoice? Flag any of the following that are absent:
- Technician work order or service ticket
- Time-in / time-out records for labor charges
- Parts receipts or supplier invoices for parts billed
- Callback authorization or dispatch record
- Signed work acceptance / completion form

═══════════════════════════════════════════════
SECTION 6 — RECOMMENDED NEXT STEPS
═══════════════════════════════════════════════
Number each action. Be specific — name the line item, the amount at issue, and exactly what to request. Include a recommended deadline for the vendor to respond before the owner withholds payment.

═══════════════════════════════════════════════
SECTION 7 — FINANCIAL SUMMARY
═══════════════════════════════════════════════
Present all four amounts:
- Total billed
- Recommended to pay (undisputed, in-scope charges)
- Recommended to dispute (specific items with amounts)
- Flagged for investigation (pending documentation)

State the net recommended payment with a one-sentence rationale.
`;
  }

  if (reviewType === 'modernization_bid' || reviewType === 'single_modernization') {
    return `
You are producing an ElevatorIQ Modernization Bid Review Report. Follow this exact structure:

═══════════════════════════════════════════════
SECTION 1 — EXECUTIVE SUMMARY
═══════════════════════════════════════════════
Summarize: vendor, number and type of units, stated modernization scope, total price, and your overall read. State whether the price is competitive, average, or overpriced for the scope and market, and name the single highest-priority issue.

═══════════════════════════════════════════════
SECTION 2 — PRICE ASSESSMENT
═══════════════════════════════════════════════
Evaluate pricing in full detail:
- Total price and effective price per unit
- Market competitiveness: Hydraulic full modernization (new HPU + jack + controller + cab): $40,000–80,000/unit depending on age and scope. Controller-only modernization (hydraulic): $18,000–32,000/unit. Traction full modernization (new controller, drive, door equipment, cab, ropes): $55,000–120,000+/unit. State whether this proposal falls within, above, or below these ranges and explain what drives the positioning.
- Tariff and material escalation exposure: Does the proposal include a tariff escalation clause or material cost adjustment provision? Flag any unilateral price increase rights with no cap as HIGH risk.
- Payment terms: What is the payment schedule (mobilization deposit, milestone draws, final upon inspection)? A mobilization deposit above 25–30% is aggressive. Flag if final payment is due before inspection acceptance.
- Escalation or contingency provisions: Are there line items listed as allowances or subject to field conditions? Quantify the exposure.

═══════════════════════════════════════════════
SECTION 3 — PRODUCT QUALITY ASSESSMENT
═══════════════════════════════════════════════
Assess the proposed equipment:
- Manufacturer and product line — specific model if stated
- Drive system and controller technology — is this current-generation or legacy?
- For hydraulic: new submersible HPU vs. above-ground, environmental containment provisions
- Cab interior quality and finishes as specified
- Proprietary vs. open architecture — lock-in risk for future service
- Expected long-term maintenance cost implications of the proposed equipment
- Warranty: standard is 12 months parts and labor from acceptance. Is after-hours callback covered during warranty? Flag if not stated.

═══════════════════════════════════════════════
SECTION 4 — SCOPE REVIEW
═══════════════════════════════════════════════
Output a pipe-delimited table with exactly three columns — Category, Status, Notes — covering every scope item below.
Status must be one of: Explicitly Included | Included (Allowance) | Partially Addressed | Implied / Ambiguous | Not Addressed | Not Stated.
Do NOT use emoji or symbols in the Status column. Do NOT add footnote tags or bracket annotations.

Use this exact header row:
| Category | Status | Notes |
|---|---|---|

Cover these categories:
Controller & Controls | Door Equipment | Cab Interior | Hydraulic Power Unit | Jack Assembly & Excavation | Ropes / Traveling Cable | Pit Equipment | Safety Devices | Electrical & Wiring | Fire Service | Machine Room | Demolition & Disposal | Permits & Inspections | Testing & Acceptance | Temporary Services | Warranty | Owner Responsibilities | Payment Terms | Schedule & Phasing | Change Order Rates | Liquidated Damages | Building Impact & Downtime

After the table, add two subsections with plain text (no table):

Notable Scope Inclusions (Positive):
- Bullet each positive inclusion worth calling out.

Notable Scope Gaps:
For each gap, write it as a numbered item with a bold title, then a paragraph explaining the risk and what the owner should ask for. Do not include any bracket tags or backtick annotations.

═══════════════════════════════════════════════
SECTION 5 — BUILDING IMPACT & OUTAGE ANALYSIS
═══════════════════════════════════════════════
Address the operational impact of this modernization:
- How long will the unit be out of service? Is this a realistic estimate for the scope?
- If the building has multiple elevators: what is the service reduction during construction, and is this tolerable for the building's use type?
- Are there provisions for temporary elevator service, hoisting during modernization, or a phased approach to minimize tenant impact?
- Flag if no outage duration or phasing plan is stated in a multi-unit building.

═══════════════════════════════════════════════
SECTION 6 — RISK SIGNALS
═══════════════════════════════════════════════
List each risk as [SEVERITY] with finding, risk, and recommendation.

═══════════════════════════════════════════════
SECTION 7 — NEGOTIATION POINTS
═══════════════════════════════════════════════
Specific, prioritized asks before signing. For each: what to request, what the proposal currently says, and what an acceptable alternative looks like.

═══════════════════════════════════════════════
SECTION 8 — RECOMMENDED QUESTIONS
═══════════════════════════════════════════════
3–5 pointed questions to ask the vendor before award. Target scope gaps, tariff exposure, outage duration, and warranty coverage.
`;
  }

  if (reviewType === 'new_construction_bid') {
    return `
You are producing an ElevatorIQ New Construction Bid Review Report. Follow this exact structure:

═══════════════════════════════════════════════
SECTION 1 — EXECUTIVE SUMMARY
═══════════════════════════════════════════════
Summarize: vendor, building type, number and configuration of elevators, total bid price, and your overall read on competitiveness and completeness. State whether the bid is competitive, average, or overpriced for the market, and name the single highest-priority issue.

═══════════════════════════════════════════════
SECTION 2 — PRICE ASSESSMENT
═══════════════════════════════════════════════
Evaluate pricing in full detail:
- Total bid price and effective price per unit
- Market competitiveness: New construction elevator pricing varies significantly by system type. Hydraulic (2-stop, 2000 lb): $35,000–60,000/unit. MRL traction (mid-rise, standard): $65,000–110,000/unit. Geared traction (high-rise): $85,000–150,000+/unit. These are rough benchmarks — actual pricing depends heavily on travel, capacity, cab finishes, and market conditions.
- Tariff and material escalation exposure: Does the contract include a tariff escalation clause or material cost adjustment provision? Post-2025 tariff volatility on steel, aluminum, and copper makes this a critical clause. Unilateral price increase rights tied to "material cost increases" with no cap are HIGH risk. A fixed-price contract with no escalation clause is the owner's preference.
- Price lock validity: How long is the bid price valid? If shorter than your expected award date, flag the gap.
- Allowance vs. fixed-price: What items are priced as allowances (subject to change) vs. firm fixed price? Allowances represent future exposure.

═══════════════════════════════════════════════
SECTION 3 — PRODUCT & EQUIPMENT ASSESSMENT
═══════════════════════════════════════════════
Assess the proposed equipment thoroughly:
- Manufacturer, product line, and drive system (MRL traction, geared traction, hydraulic)
- Controller and drive technology — is this a current-generation product or an older platform?
- Capacity and speed as proposed vs. code minimums for the building type
- Cab finishes and interior quality — what is specified vs. implied
- Proprietary vs. open architecture: Otis, KONE, Schindler, and TK Elevator all have proprietary control systems that limit future service to the OEM. Open-architecture or independent-friendly systems (Hollister-Whitney, Motion Control Engineering) provide long-term flexibility. Assess the lock-in risk for this specific equipment choice.
- Long-term maintenance cost implications: MRL traction is generally lowest maintenance cost. Hydraulic units require periodic jack/cylinder inspection and hydraulic fluid management. High-rise geared traction requires more intensive PM.
- Warranty: Standard is 12 months parts and labor from substantial completion. After-hours coverage during warranty? Flag if less than standard.

═══════════════════════════════════════════════
SECTION 4 — SCOPE REVIEW
═══════════════════════════════════════════════
Output a pipe-delimited table with exactly three columns — Category, Status, Notes — covering every scope item below.
Status must be one of: Explicitly Included | Included (Allowance) | Partially Addressed | Implied / Ambiguous | Not Addressed | Not Stated.

Use this exact header row:
| Category | Status | Notes |
|---|---|---|

Cover these categories:
Hoistway Rough-In & Pit (by others or included) | Hoist Beam (furnished by whom, rated load) | Electrical Service to Machine Room | Pit Equipment (ladder, lighting, GFCI, stop switch) | Fire Alarm & Smoke Detector Integration | Card Reader / Access Control Wiring | Barricades & Hoistway Protection | Temporary Construction Use | Grouting, Firestopping & Patching | Final Inspection (included or extra) | Reinspection Fees | Permits & Code Compliance | Cab Flooring (by others or included) | Cab Interior & Finishes | After-Hours / Overtime Labor | Remobilization Fees | Storage Fees | Warranty (period and scope) | Emergency Power Provisions | Phone / Cellular Connectivity | ADA / Accessibility Compliance | Demolition of Existing Equipment (if applicable)

After the table, add:
Notable Scope Inclusions (Positive):
- Bullet each positive item worth noting.

Notable Scope Gaps:
For each gap, write a numbered item with a bold title and a paragraph explaining the risk and what the owner should require.

═══════════════════════════════════════════════
SECTION 5 — RISK SIGNALS
═══════════════════════════════════════════════
List each risk as [SEVERITY] with finding, risk, and recommendation.

═══════════════════════════════════════════════
SECTION 6 — SCHEDULE & LEAD TIME
═══════════════════════════════════════════════
- Shop drawing submittal timeline and review period
- Manufacturing / fabrication lead time
- Installation duration and sequencing
- Substantial completion and punch-list estimates
- Key dependencies on GC or base building milestones
- Flag any schedule assumptions that look aggressive or undefined

═══════════════════════════════════════════════
SECTION 7 — NEGOTIATION POINTS
═══════════════════════════════════════════════
Specific, prioritized asks. For each: what to request, what the bid currently says, and what success looks like.

═══════════════════════════════════════════════
SECTION 8 — RECOMMENDED QUESTIONS
═══════════════════════════════════════════════
3–5 targeted questions for the vendor before award. Focus on tariff exposure, schedule assumptions, scope gaps, and service network quality.
`;
  }

  if (reviewType === 'maintenance_bid') {
    return `
You are producing an ElevatorIQ Maintenance Contract Review Report. Follow this exact structure:

═══════════════════════════════════════════════
SECTION 1 — EXECUTIVE SUMMARY
═══════════════════════════════════════════════
Summarize: vendor, number of units covered, contract type (full-service / oil & grease / parts & labor), total monthly and annual price, contract term, and your overall assessment. State in the first sentence whether this contract is competitive, average, or unfavorable for the scope and market, and name the highest-priority issue.

═══════════════════════════════════════════════
SECTION 2 — PRICE ASSESSMENT
═══════════════════════════════════════════════
Break down pricing:
- Price per unit per month and annual total
- Market benchmark comparison: Full-service maintenance benchmarks vary by equipment type and age. Hydraulic (pre-2010): $95–155/unit/mo. Hydraulic (2010+): $115–175/unit/mo. MRL traction (standard): $130–210/unit/mo. Geared traction (high-rise, pre-2000): $160–260/unit/mo. Escalators: $200–350/unit/mo. Newer, simpler equipment typically commands the lower end of these ranges; older, proprietary, or high-traffic equipment the upper end. State whether the proposed pricing falls within, above, or below these ranges and what factors justify the positioning.
- Multi-unit discount: buildings with 3 or more units should receive a 10–20% per-unit discount vs. single-unit pricing. Flag if no multi-unit discount is apparent.
- Escalation clause: what percentage, tied to what index (CPI-U, fixed percentage, or unspecified), and what is the cap. Industry standard: CPI-U or 3–5% fixed, whichever is lower. Flag any contract that allows uncapped escalation or ties increases to the vendor's discretion.
- Total cost of ownership projection: estimate the true 3-year and 5-year cost including base price, escalation, projected after-hours callbacks at stated rates, and known exclusions. Compare to a competitive full-service alternative.

═══════════════════════════════════════════════
SECTION 3 — COVERAGE MATRIX
═══════════════════════════════════════════════
Assess coverage for each item below. Output this as a pipe-delimited table with exactly three columns — Item, Status, Notes.
Status must be one of: Explicitly Included | Included (Allowance) | Partially Addressed | Excluded | Ambiguous | Not Stated.

Use this exact header row:
| Item | Status | Notes |
|---|---|---|

Cover these items:
All Parts (including major components) | Motor / Machine | Controller / Drive | Valve Body (hydraulic) | Jack & Cylinder | Door Equipment & Operators | Safety Devices | Hydraulic Fluid & Disposal | Oil & Grease | Emergency / Entrapment Callbacks | After-Hours Callback Fees | Response Time SLA (emergency) | Annual Category 1 Inspection | 5-Year Category 5 Test (hydraulic) | Pit Cleaning | Vandalism & Misuse Repairs | Proprietary Diagnostic Equipment | Callback Volume Cap | Modernization Exclusions

After the table, add:
Notable Coverage Strengths:
- List positive inclusions worth calling out.

Critical Coverage Gaps:
For each gap, write a numbered item with a bold title, then a paragraph explaining the cost or liability risk.

═══════════════════════════════════════════════
SECTION 4 — CLAUSE RED FLAGS
═══════════════════════════════════════════════
Analyze the contract language specifically for each of the following. If any are present, format as [SEVERITY] with a direct quote or close paraphrase, then explain the risk:

- Evergreen / auto-renewal clause: What is the required cancellation notice window? 30 days = HIGH risk trap. 60 days = MEDIUM. 90+ days = standard. 120+ days = aggressive for owner. Flag if the window is short, if notice must be certified mail only, or if failure to give notice locks the owner in for another full term.
- Early termination fees: What is the penalty? One month, three months, remaining term? Flag anything above 3 months' fees.
- Unilateral price increase rights: Can the vendor raise prices mid-term without owner consent?
- Parts markup provisions: Does the contract allow additional parts billing beyond the stated scope? Flag any language that opens a door to parts charges on a "full-service" contract.
- Proprietary lock-in: Does the contract require the owner to use only this vendor for additional repairs, modernization, or any other work? Does it state that proprietary diagnostic systems void the warranty if another company services the equipment?
- Callback billing triggers: What constitutes a billable callback? Vandalism and misuse exceptions are reasonable; billing for callbacks that are in fact equipment failures is not.
- Insurance and indemnification: Does the vendor carry adequate liability? Is the indemnification clause mutual or one-sided?

═══════════════════════════════════════════════
SECTION 5 — RISK SIGNALS
═══════════════════════════════════════════════
List each risk. Format each as:

[SEVERITY] Item name
Finding: What the contract actually says (quote or close paraphrase)
Risk: Dollar or liability exposure for the owner
Recommendation: Specific ask or protective language

═══════════════════════════════════════════════
SECTION 6 — TERM & RENEWAL STRATEGY
═══════════════════════════════════════════════
Is the proposed term length (1 year / 3 years / 5 years) appropriate for this building and equipment? When should the owner consider rebidding vs. renewing? If the equipment is approaching end-of-useful-life (typically 20–25 years for hydraulic, 25–30 for traction), a 1-year or month-to-month contract preserves flexibility for a modernization decision. Flag if the vendor is pushing a long term on aging equipment.

═══════════════════════════════════════════════
SECTION 7 — NEGOTIATION POINTS
═══════════════════════════════════════════════
List specific, prioritized asks before signing. For each: what to request, what the current language says, and what acceptable language looks like. Cover term, escalation cap, cancellation notice, coverage gaps, parts charges, and proprietary restrictions.

═══════════════════════════════════════════════
SECTION 8 — RECOMMENDED QUESTIONS FOR VENDOR
═══════════════════════════════════════════════
3–5 pointed, specific questions — not generic. Target the gaps, red flags, and ambiguities identified above.
`;
  }

  if (reviewType === 'repair_bid') {
    return `
You are producing an ElevatorIQ Repair Bid Review Report. Follow this exact structure:

═══════════════════════════════════════════════
SECTION 1 — EXECUTIVE SUMMARY
═══════════════════════════════════════════════
Summarize: vendor, equipment type and location, stated failure or problem, proposed repair scope, total bid price, and your overall read. Lead with the single most important finding — whether this repair should be covered under an existing maintenance agreement, whether the price is fair, or whether the scope appears to address the actual root cause.

═══════════════════════════════════════════════
SECTION 2 — CONTRACT COVERAGE CHECK (PRIMARY ANALYSIS)
═══════════════════════════════════════════════
This is the most important section for repair bids. Address each of the following:

1. Is this repair within the scope of a full-service maintenance agreement?
Full-service contracts should cover virtually all parts and labor — including motors, valves, controllers, door equipment, and safety devices. If the owner has a full-service contract and is being billed for a repair that falls within that scope, this is a billing dispute, not a repair negotiation.

2. What contract type is in force? (full-service / oil & grease / parts & labor / none stated)
For oil & grease or parts & labor contracts, most repairs are legitimately billable. State exactly what is and is not covered.

3. Is this repair potentially under warranty?
If the equipment or a recently replaced component is within warranty period, the repair may be free. Flag if equipment age or recent service history suggests a warranty claim is possible.

4. Should the owner request a second opinion?
For repairs above $2,000 on equipment with an active maintenance contract, a second opinion is often worth pursuing. Flag this if appropriate.

═══════════════════════════════════════════════
SECTION 3 — PRICE ASSESSMENT
═══════════════════════════════════════════════
- Total repair price and breakdown (labor hours × rate + parts cost)
- Labor rate check: Ohio/Michigan licensed elevator mechanic market rate is $85–135/hr straight time, $130–200/hr overtime as of 2025. Flag any rate significantly above this range.
- Parts cost check: Are parts prices itemized? If marked up, is the markup reasonable (10–20% is typical; 30%+ is a red flag)? Are the parts OEM or aftermarket?
- Is this competitive? For the described scope, state whether the price falls within typical range or appears high.
- Band-aid vs. permanent fix: Will this repair solve the problem or just defer it? What is the long-term cost implication?

═══════════════════════════════════════════════
SECTION 4 — SCOPE & ROOT CAUSE VALIDATION
═══════════════════════════════════════════════
- Is the proposed repair logically connected to the stated failure or symptom?
- Is the root cause being addressed or just the symptom? (Example: replacing a burned motor without addressing the drive issue that caused it is a symptom fix.)
- Are any scope items questionable? Flag any work that appears unnecessary or unrelated to the stated problem.
- Repair vs. Replace analysis: If the equipment is old or the repair cost exceeds 30–40% of replacement cost for that component, flag whether a replacement or modernization conversation should happen instead.

═══════════════════════════════════════════════
SECTION 5 — RISK SIGNALS
═══════════════════════════════════════════════
[SEVERITY] format — finding, risk, and recommendation for each.

═══════════════════════════════════════════════
SECTION 6 — NEGOTIATION POINTS
═══════════════════════════════════════════════
Specific asks before authorizing the work. Name the line item, the current price, and what a reasonable alternative looks like. Include whether to push back on labor hours, parts markup, or contract coverage.

═══════════════════════════════════════════════
SECTION 7 — RECOMMENDED QUESTIONS
═══════════════════════════════════════════════
3–5 targeted questions to ask the vendor before authorizing. Focus on coverage eligibility, root cause, warranty status, and what happens if the repair doesn't resolve the problem.
`;
  }

  // Default
  return `
Produce a thorough structured analysis with clear sections: Executive Summary, Findings, Risk Signals, and Recommendations. Use actual figures and terminology from the documents. Be specific and actionable.
`;
}

// ─── Per-document-type pre-read context ──────────────────────────────────────
// Injected before the document text so Claude enters the analysis with the
// right lens. This is distinct from the report template (which describes output
// structure) — this is pre-analysis framing that sharpens finding accuracy.

function getDocumentTypeContext(reviewType) {
  const contexts = {
    maintenance_bid: `PRE-READ BRIEF — MAINTENANCE CONTRACT ANALYSIS
You are about to analyze a maintenance contract or proposal. Before reading, prime yourself on the most common high-value findings in maintenance contract reviews:
- EVERGREEN TRAP: Short cancellation windows (30 days or less) that auto-renew the contract for full terms. The standard is 90 days written notice; 30 days is a trap.
- UNCAPPED ESCALATION: Contracts that tie price increases to "vendor's costs" or allow increases above CPI-U with no cap. A 3–5% cap or CPI-U, whichever is lower, is the industry standard.
- PROPRIETARY LOCK-IN: Language requiring the owner to use only this vendor for any additional repairs, modernization, or work. Clauses stating that third-party service voids coverage are highly restrictive.
- PARTS MARKUP: Full-service contracts should include all parts. Any language allowing the vendor to separately charge for parts on a "full-service" agreement is a material coverage gap.
- MAJOR COMPONENT EXCLUSIONS: Motor, controller, valve body, and jack/cylinder are the high-cost components. Some contracts exclude these. A contract called "full-service" that excludes major components is misrepresented.
- MULTI-UNIT DISCOUNT: Buildings with 3+ units should get 10–20% per-unit discounts. Pricing that looks like single-unit rates on a multi-unit building is overpriced.
- TERM TRAP ON AGING EQUIPMENT: A vendor pushing a 5-year contract on equipment that is 20+ years old is locking the owner in through a likely modernization decision period. Flag this.`,

    invoice_review: `PRE-READ BRIEF — INVOICE & BILLING REVIEW ANALYSIS
You are about to analyze an elevator maintenance invoice. Before reading, prime yourself on the most common billing fraud and anomaly patterns:
- SCOPE CREEP BILLING: Charges for work that falls within a full-service maintenance agreement (adjustments, lubrication, safety device testing, callbacks) billed as extra. This is the #1 invoice dispute in the industry.
- LABOR RATE ABUSE: Licensed elevator mechanic rates in Ohio/Michigan are $85–135/hr straight time, $130–200/hr overtime (2025). Rates significantly above this range need justification.
- MINIMUM HOUR PADDING: A 15-minute callback billed as a 4-hour minimum. Standard is a 2-hour minimum for callbacks; anything above that on a routine service call is a flag.
- PARTS MARKUP: The contract may specify a markup cap (typically 10–20%). Parts billed at cost-plus-40% or higher without a contract basis are disputable.
- RETROACTIVE BILLING: Work performed 3–6 months ago billed today with no explanation. This may indicate the vendor is catching up on unbilled work or fabricating charges.
- MODERNIZATION ON MAINTENANCE INVOICE: Capital repair or upgrade work billed on a routine maintenance invoice without a separate work order or change order. This bypasses normal owner approval.
- VAGUE DESCRIPTIONS: "Miscellaneous parts $850" or "Service labor 8 hrs" with no specifics are red flags — the owner cannot verify what was done or whether it was necessary.
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
You are about to analyze an elevator repair bid. The single most important question is: SHOULD THIS REPAIR BE COVERED BY AN EXISTING MAINTENANCE CONTRACT? Before reading:
- FULL-SERVICE CONTRACT COVERAGE: A full-service maintenance agreement covers virtually all parts and labor including motors, valves, controllers, door equipment, and safety devices. If the owner has a full-service contract, the repair vendor presenting a separate bill may be billing for something already paid for.
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
- PROPRIETARY LOCK-IN RISK: The equipment choice made at bid award determines who services this equipment for 20–30 years. OEM-proprietary systems (Otis, KONE, Schindler, TK) restrict future service. An independent-friendly system may cost more upfront but save significantly over the service life.
- TARIFF EXPOSURE: Which vendors offer fixed-price contracts vs. material escalation clauses? In a tariff-volatile environment, a fixed-price guarantee has real economic value and justifies a small price premium.
- SCHEDULE CREDIBILITY: Compare proposed lead times. If one vendor promises 30% faster completion than others for similar scope, this is either a competitive advantage or an unrealistic promise that will result in delays and disputes.
- SERVICE NETWORK: The lowest-cost bidder with weak local service capacity is a long-term risk. Factor in who has verifiable local references with similar equipment.`,

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
- SCOPE CREEP BILLING: Charges for work that falls within a full-service maintenance agreement (adjustments, lubrication, safety device testing, callbacks) billed as extra. This is the #1 invoice dispute in the industry.
- LABOR RATE ABUSE: Licensed elevator mechanic rates in Ohio/Michigan are $85–135/hr straight time, $130–200/hr overtime (2025). Rates significantly above this range need justification.
- MINIMUM HOUR PADDING: A 15-minute callback billed as a 4-hour minimum. Standard is a 2-hour minimum for callbacks; anything above that on a routine service call is a flag.
- PARTS MARKUP: The contract may specify a markup cap (typically 10–20%). Parts billed at cost-plus-40% or higher without a contract basis are disputable.
- EVERGREEN TRAP: Short cancellation windows (30 days or less) that auto-renew the contract for full terms. The standard is 90 days written notice; 30 days is a trap.
- MAJOR COMPONENT EXCLUSIONS: Motor, controller, valve body, and jack/cylinder are the high-cost components. A contract called "full-service" that excludes these is misrepresented.
- PROPRIETARY LOCK-IN: Language requiring the owner to use only this vendor for any additional repairs, modernization, or work. This is a material restriction.
- RETROACTIVE BILLING: Work performed 3–6 months ago billed today with no explanation is a red flag — the owner cannot verify whether the work occurred.`,
  };

  const ctx = contexts[reviewType];
  if (!ctx) return '';
  return `${ctx}\n\n${'─'.repeat(72)}\n\n`;
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

  // Inject type-specific pre-read context before the document text.
  // This primes Claude with the most common high-value findings for this
  // review type, sharpening accuracy without expanding the output template.
  const docTypeContext = getDocumentTypeContext(reviewType);

  const userPrompt = `${benchmarkContext ? benchmarkContext + '\n\n' : ''}Review Type: ${reviewType}

${docTypeContext}DOCUMENTS SUBMITTED FOR ANALYSIS:
${preparedText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSTRUCTIONS:
${reportTemplate}

Hard requirements:
- This must be a synthesized rulebook analysis, not a source-document copy.
- Do not paste long verbatim text from source docs.
- Quote only short snippets when needed, then explain implications.
- Make clear recommendations tied to risk/price/scope tradeoffs.
- EVIDENCE GROUNDING (CRITICAL — anti-hallucination): Every finding must cite its source. For each flag or risk signal, you must reference where in the document you found it — e.g., "Section 4 states: '[short quote]'" or "The payment terms clause on page 2 specifies...". Do NOT state a finding if you cannot trace it to specific document text. If a clause or provision is absent, say it is absent — do not invent or assume its terms.
- ABSENCE VS. PRESENCE: Never treat the absence of a clause as evidence of misconduct. If a term is not mentioned, state: "[Item] is not addressed in the submitted documents" — then explain why its absence matters. Do not fabricate what a missing clause might say.
- JURISDICTION GUARDRAIL: Only reference specific state elevator codes (e.g. Michigan Act 227, ASME A17.1 as adopted by a state) if the submitted documents explicitly indicate the project state or jurisdiction. If state cannot be determined from the documents, reference only general ASME A17.1 or OSHA standards that apply nationally. Never assume a state based on addresses or phone numbers alone.
- FORMATTING: Do NOT use markdown syntax in your report. Do not use # or ## headers, do not use > blockquotes, do not use --- horizontal rules. Section headers must follow the exact format "SECTION N — TITLE" only. Plain text paragraphs and bullet points (- item) only.

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
- score_label: Assign one of exactly three values. Use the flag counts from your report as the primary signal:
  - "High Performance" (score 85): 0–1 HIGH flags total, pricing within or below market range, scope substantially complete with at most minor gaps, no predatory contract terms. The document is a solid starting point with only minor refinement needed.
  - "Moderate Inefficiencies" (score 60): 2–3 HIGH flags OR pricing 10–25% above market OR meaningful scope gaps OR 1–2 clause red flags (e.g., uncapped escalation, short cancellation window). Owner should negotiate before signing but deal is not fatally flawed.
  - "High Risk" (score 25): 4+ HIGH flags OR pricing >25% above market OR critical scope gaps (missing major components, open-ended change order exposure) OR multiple predatory clause patterns (evergreen trap + parts markup + proprietary lock-in together). Owner should not sign as written.
  Must not be null. Count your actual HIGH-severity flags and apply the thresholds above — do not default to the middle tier without cause.
- elevatoriq_score: Set to 85 if score_label is "High Performance", 60 if "Moderate Inefficiencies", 25 if "High Risk".

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
