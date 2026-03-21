-- Seed: Wisconsin elevator code knowledge base entries
-- Source: Wisconsin Statutes 101.983 et seq., Wisconsin Admin. Code SPS Chapter 318 (Register November 2024 No. 827),
--         Wisconsin Department of Safety and Professional Services (DSPS), Division of Industry Services (DIS),
--         ASME A17.1-2016/CSA B44-16
-- Run in Supabase SQL Editor after 004_seed_knowledge_indiana.sql

INSERT INTO knowledge (title, category, content, source_url, equipment_types, states, tags) VALUES

(
  'Wisconsin SPS Chapter 318 — Governing Statute and Regulatory Authority',
  'elevator_code',
  'Wisconsin elevator safety is governed by Wisconsin Statutes Chapter 101 (particularly ss. 101.983–101.985) and implemented through Wisconsin Administrative Code SPS Chapter 318 (Safety Code for Conveyances). The administering agency is the Wisconsin Department of Safety and Professional Services (DSPS), Division of Industry Services (DIS), Elevator Section.

REGULATORY AUTHORITY: DSPS/DIS has statewide jurisdiction over conveyances in Wisconsin, with the significant exception of municipalities designated as "agent municipalities" (primarily Milwaukee and Madison), which administer their own inspection programs by delegation. DIS examines plans, issues certificates of operation, offers consultation and education, administers elevator inspector credentials, and monitors independent inspectors and contractors statewide.

SCOPE OF COVERAGE: SPS 318 covers elevators, escalators, moving walks, dumbwaiters, material lifts, platform lifts, and stairway chairlifts. Private residential conveyances serving only a single dwelling unit are generally not subject to annual inspection requirements, though they must still pass an acceptance inspection at time of installation.

ADOPTED STANDARDS: Wisconsin SPS 318 incorporates ASME A17.1-2016/CSA B44-16 (Safety Code for Elevators and Escalators) by reference. Changes, additions, or omissions to ASME A17.1 that are specific to Wisconsin are codified within SPS 318 and are state rules — not requirements of ASME A17.1 itself. All references within ASME A17.1 to ASME A17.2, A17.3, and A17.5 are treated as informational only and are not mandatory under Wisconsin law. The current edition of SPS 318 was published as Register November 2024 No. 827.

CODE VERSION APPLIED OVER DEVICE LIFETIME: A critical Wisconsin-specific rule: the conveyance codes applicable for the life of a conveyance are generally the codes in effect when the original installation contract was signed. An elevator installed under a contract signed in 1985 continues to be inspected to the 1984 state code and the 1981 edition of ASME A17.1. Components replaced, repaired, or altered after original installation may carry a different contract date and thus be subject to updated code versions for those components specifically.

PERMITS REQUIRED: Plan review and permit are required before beginning new installations or qualifying alterations. Applications must be submitted by a licensed elevator contractor. For elevators and dumbwaiters, plan submission must include layout drawings showing hoistway clearances and all inside car/platform dimensions per the applicable ASME A17.1 requirements.

CONTACT: DSPS Elevator Section — DSPSSBElevatorTech@wisconsin.gov. Technical questions regarding SPS 318 should be directed to this address.',
  'https://docs.legis.wisconsin.gov/code/admin_code/sps/safety_and_buildings_and_environment/301_319/318.pdf',
  NULL,
  ARRAY['WI'],
  ARRAY['elevator_code', 'wisconsin', 'permits', 'licensing', 'dsps', 'sps-318', 'asme-a17-1']
),

(
  'Wisconsin Permit to Operate (PTO) and Annual Inspection Requirements',
  'inspection_requirement',
  'Wisconsin requires a Permit to Operate (PTO) for conveyances to remain in service. The PTO is issued after a successful inspection and is the Wisconsin equivalent of an operating certificate or certificate of operation.

PERMIT TO OPERATE (PTO): All conveyances subject to SPS 318 require a valid PTO. Operating a conveyance without a current PTO is a violation. The PTO is issued by DSPS (or an agent municipality with delegated authority) after a passing inspection. The annual PTO cycle applies to most conveyances; stairway chairlifts have a 3-year PTO cycle.

ACCEPTANCE INSPECTION — NEW INSTALLATIONS: When a conveyance is first installed, it must pass an acceptance inspection before it is turned over to the owner and placed in service. Allowing an owner to operate a conveyance prior to passing the acceptance inspection may result in a $1,000 fine issued to the contractor and/or the owner. This is an explicit statutory penalty that contractors and building owners must be aware of.

ANNUAL INSPECTION: After initial acceptance, all conveyances (except stairway chairlifts) must pass an annual inspection to maintain their PTO. Inspections are performed by: (1) a licensed elevator inspector employed by DSPS, (2) an agent municipality''s licensed inspector, or (3) a private inspection contractor (licensed inspector working for an approved independent inspection firm).

CATEGORY 1 AND CATEGORY 5 TESTING: ASME A17.1 periodic inspection and testing requirements apply. Category 1 tests (full load, full speed) are required annually. Category 5 tests (safety and governor tests for traction elevators) are required on a 5-year cycle. Hydraulic elevators have their own periodic testing requirements. Wisconsin form SBDCat1E (Elevator, Dumbwaiter and Material Lift Test Record — Category 1) must be completed and retained. Maintenance agreements should specify whether Category 1 and Category 5 testing costs are included in the base contract or billed as extras.

SPRINKLER AND FIRE SAFETY UPDATE (OCTOBER 2024): Effective October 29, 2024, Wisconsin revised SPS 318 Case 11a (NFPA 13R sprinkler system) to require a smoke detector for firefighters'' emergency operation in the machinery space at the top of the hoistway. Requirements for smoke detectors and sprinkler systems in elevator hoistways vary depending on: elevator type (passenger vs. freight), drive type (traction vs. hydraulic), machine room location (in hoistway vs. machine room), hoistway construction (combustible vs. non-combustible), and whether the building or portion is sprinklered. Contracts and proposals should address who bears responsibility for fire/life safety compliance testing.

POST-ALTERATION INSPECTION: Any alteration, repair, or replacement of components requiring a permit under SPS 318.1007 requires a post-work inspection before the conveyance returns to service.

CONTACT: DSPS Division of Industry Services — DSPSSBElevatorTech@wisconsin.gov.',
  'https://dsps.wi.gov/Pages/Programs/Elevators/Default.aspx',
  NULL,
  ARRAY['WI'],
  ARRAY['wisconsin', 'inspection', 'permit-to-operate', 'pto', 'dsps', 'category1', 'category5', 'acceptance']
),

(
  'Wisconsin Elevator Contractor and Mechanic Licensing Requirements (SPS 305)',
  'licensing_requirement',
  'Wisconsin requires licensure for elevator contractors and elevator mechanics, administered by DSPS under Wisconsin Admin. Code SPS Chapter 305.

ELEVATOR CONTRACTOR LICENSE: No person or entity may perform construction, installation, alteration, repair, or replacement of a conveyance or conveyance component requiring a permit under SPS 318.1007 without being a licensed elevator contractor. Contractors must: (1) be responsible for compliance with SPS 318 on all conveyance work performed, (2) utilize only appropriately licensed or registered individuals to perform work, (3) not commence permitted work until a permit has been issued, and (4) maintain liability insurance as required under Wisconsin Statutes s. 101.985(1).

ELEVATOR MECHANIC LICENSE: A person may become a licensed elevator mechanic by: (1) passing the Wisconsin elevator mechanic license examination, or (2) completing an elevator apprenticeship program of at least 4 years recognized under Wisconsin statutes or by the U.S. Department of Labor.

RESTRICTED LICENSE (MECHANIC-RESTRICTED / APPRENTICE-RESTRICTED): A licensed elevator mechanic-restricted or registered elevator apprentice-restricted is limited in scope — they may perform repair, maintenance, and replacement of conveyance components and subsystems, but may NOT replace hoist ropes or governor ropes. This restriction is a common source of contract ambiguity: verify that the personnel performing work hold the appropriate license category for the scope of work described in the maintenance agreement.

ELEVATOR INSPECTOR LICENSE: Elevator inspectors must hold a Wisconsin-issued inspector credential administered by DSPS. QEI certification (ASME QEI-1 standard) or equivalent is the underlying qualification requirement. Inspector credentials are administered by DSPS Division of Industry Services.

PRIVATE INSPECTION FIRMS: Third-party inspection companies performing inspections on behalf of building owners must employ licensed inspectors and be approved by DSPS. Independent certified inspection agencies are used alongside DSPS staff inspectors.

IMPLICATIONS FOR PROPOSAL REVIEW: When reviewing Wisconsin maintenance or modernization proposals, verify: (1) the contractor holds a current Wisconsin elevator contractor license, (2) mechanic license type (unrestricted vs. restricted) for the scope described, (3) the inspection company is DSPS-approved if third-party annual inspections are proposed. License status can be verified through the DSPS online lookup at dsps.wi.gov.',
  'https://dsps.wi.gov/Pages/Professions/ElevatorContractor/Default.aspx',
  NULL,
  ARRAY['WI'],
  ARRAY['wisconsin', 'licensing', 'contractor', 'mechanic', 'inspector', 'qei', 'dsps', 'sps-305']
),

(
  'Milwaukee and Madison Agent Municipality Exception — Separate Elevator Jurisdiction',
  'elevator_code',
  'Wisconsin statute s. 101.983(4) authorizes DSPS to designate municipalities as "agent municipalities," granting them authority to review conveyance plans, conduct inspections, and issue Permits to Operate within their boundaries — independently of DSPS. Milwaukee and Madison are the primary Wisconsin agent municipalities with separate elevator inspection jurisdiction.

MILWAUKEE SEPARATE JURISDICTION: The City of Milwaukee operates its own elevator inspection program as a DSPS-delegated agent municipality. Conveyances within Milwaukee city limits are inspected by Milwaukee inspectors, not DSPS state inspectors. Building owners in Milwaukee must direct PTO renewal, inspection scheduling, and compliance questions to the City of Milwaukee, not DSPS. For Milwaukee conveyance inspections: 414-286-8216.

MADISON SEPARATE JURISDICTION: The City of Madison similarly operates as a DSPS-delegated agent municipality. Conveyances within Madison city limits fall under City of Madison inspection and PTO authority.

FULL LIST OF AGENT MUNICIPALITIES: DSPS publishes an updated list of all municipalities delegated as inspection agents ("Municipalities delegated for inspections") — building owners and contractors with properties in smaller Wisconsin cities should verify whether those cities have agent status before assuming DSPS handles their inspection program.

AGENT MUNICIPALITY STANDARDS: Agent municipalities administer inspections under the same Wisconsin SPS 318 technical standards as DSPS. The delegation is administrative, not a separate code. The technical requirements (ASME A17.1-2016, periodic testing, permit requirements) are the same — only the administrative contact changes.

PRACTICAL IMPLICATIONS FOR CONTRACT REVIEW: When reviewing elevator contracts for Milwaukee properties, verify that: (1) the vendor is aware of and coordinating with the City of Milwaukee (not DSPS) for PTO renewals and inspections, (2) inspection costs and scheduling are structured around Milwaukee''s inspection program, (3) any plan review submission for alterations goes to the appropriate Milwaukee city office. Misrouting applications to DSPS instead of Milwaukee can delay permits and inspections.

COMPARISON TO ILLINOIS (CHICAGO): Like Chicago in Illinois, Milwaukee in Wisconsin operates a separately administered elevator program within a state-administered framework. The key difference: Milwaukee uses the same SPS 318 / ASME A17.1-2016 standard as the rest of Wisconsin (no separate Milwaukee municipal code), whereas Chicago uses its own Title 14C with local amendments.',
  'https://dsps.wi.gov/Pages/Programs/Elevators/Default.aspx',
  NULL,
  ARRAY['WI'],
  ARRAY['wisconsin', 'milwaukee', 'madison', 'agent-municipality', 'jurisdiction', 'dsps', 'separate-jurisdiction']
),

(
  'Wisconsin Elevator Pricing Context — Milwaukee and Statewide Market (2024–2026)',
  'pricing_context',
  'Observed pricing patterns for elevator work in the Wisconsin market, including the Milwaukee metro and other Wisconsin markets. These ranges are derived from abstracted pattern data and are NOT benchmarks. They are provided for context only.

MAINTENANCE CONTRACT RATES (Monthly, per unit):
- Low-rise hydraulic (2–5 floors): $155–$230/month — Full-service contract
- Mid-rise traction (6–15 floors): $210–$310/month — Full-service contract
- High-rise traction (16+ floors): $290–$470/month — Full-service, varies by traffic and equipment age
- Milwaukee premium: Milwaukee commercial buildings with union labor tend to run 10–20% above smaller Wisconsin markets (Madison, Green Bay, Racine/Kenosha corridor)

LABOR CONTEXT: IUEC (International Union of Elevator Constructors) Local 132 covers Milwaukee and Wisconsin. Union labor is the norm for commercial installation, modernization, and major maintenance in Milwaukee. Non-union contractors are active in smaller commercial and low-rise markets. Wisconsin is not a right-to-work state; labor dynamics are closer to Illinois than Indiana.

MODERNIZATION PRICING (Observed ranges, Wisconsin market):
- Complete hydraulic modernization (single car): $290,000–$525,000 — Variance driven by jack assembly, excavation conditions, and site access
- Hydraulic jack replacement + excavation: $55,000–$95,000 — Wisconsin soil conditions generally similar to Midwest median; Milwaukee urban sites may have buried infrastructure adding cost
- Controller replacement (non-proprietary): $38,000–$65,000 — Includes programming and commissioning
- Cab interior (standard commercial): $16,000–$36,000 — Allowance-dependent
- Door equipment (complete, per opening): $3,200–$7,000 — Per landing door

MILWAUKEE-SPECIFIC COST FACTORS:
- Union labor required for most Milwaukee commercial elevator work — IUEC Local 132
- Building access restrictions in downtown Milwaukee (dock scheduling, freight elevator constraints) add mobilization cost on urban projects
- Milwaukee permit fees and city inspection fees add to total project cost vs. suburban equivalents
- Milwaukee is a mid-tier elevator market — pricing is below Chicago but above smaller Midwest markets like Peoria, Madison, or Green Bay

CHANGE ORDER RATES (Wisconsin market):
- Field team (mechanic + apprentice): $325–$550/hour — Upper range reflects Milwaukee union rates
- Material markup over cost: 10–20%
- Subcontractor markup: 5–10%

NOTE: Wisconsin pricing is generally below Illinois but somewhat above Indiana, reflecting the labor market difference (non-right-to-work state, comparable union density to Illinois). All ranges are for context only and do not constitute benchmarks or appraisals.',
  'https://dsps.wi.gov/Pages/Programs/Elevators/Default.aspx',
  NULL,
  ARRAY['WI'],
  ARRAY['wisconsin', 'milwaukee', 'pricing', 'modernization', 'maintenance', 'iuec', 'union']
);
