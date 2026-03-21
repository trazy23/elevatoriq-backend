-- Seed: Indiana elevator code knowledge base entries
-- Source: Indiana Code Title 22, Article 15, Chapter 5 (IC 22-15-5) — Regulated Lifting Devices,
--         Indiana Department of Homeland Security (IDHS) Division of Fire and Building Safety,
--         675 IAC 12 (Indiana elevator safety code), ASME A17.1 Safety Code for Elevators and Escalators
-- Run in Supabase SQL Editor after 003_seed_knowledge_illinois.sql

INSERT INTO knowledge (title, category, content, source_url, equipment_types, states, tags) VALUES

(
  'Indiana Regulated Lifting Devices Act (IC 22-15-5) — Governing Statute and Regulatory Authority',
  'elevator_code',
  'Indiana elevator safety is governed by Indiana Code Title 22, Article 15, Chapter 5 (IC 22-15-5), titled "Regulated Lifting Devices." The administering agency is the Indiana Department of Homeland Security (IDHS), Division of Fire and Building Safety, Elevator Section. Unlike Illinois, Indiana maintains a single statewide program with no major-city carve-out — IDHS has jurisdiction over regulated lifting devices throughout the entire state, including Indianapolis.

REGULATORY AUTHORITY: The IDHS Division of Fire and Building Safety oversees the inspection, permitting, licensing, and enforcement related to all regulated lifting devices in Indiana. The elevator section can be contacted at elevamuse@dhs.in.gov. Administrative rules governing elevator safety are codified at 675 IAC 12 (Indiana Administrative Code, Article 12). The Indiana Elevator Code Committee (a commission under IDHS) is responsible for adopting and updating technical standards.

SCOPE OF COVERAGE: Indiana IC 22-12-1-22 defines "regulated lifting device" to include elevators, escalators, dumbwaiters, moving sidewalks, platform lifts, stairway chairlifts, and related conveyances. Private single-family residences are generally exempt from the regulatory requirements.

ADOPTED STANDARDS: Indiana adopted ASME A17.1 (Safety Code for Elevators and Escalators) as the technical standard for regulated lifting devices. The Indiana Elevator Code Committee periodically reviews new editions of ASME A17.1. The 2007 edition of ASME A17.1 has been the longstanding reference standard for competency exams; the current commission activity includes review of more recent ASME A17.1 and A17.3 editions. Contractors and inspectors should verify the current adopted edition with IDHS before proceeding on code-compliance questions.

PERMITS REQUIRED: Before beginning any installation, alteration, or major repair of a regulated lifting device, the contractor must obtain a permit from IDHS. No work may commence without the permit. Applications are submitted via the IDHS Public Safety Portal at publicsafety.dhs.in.gov. Permit fees apply.

STATEWIDE JURISDICTION — NO INDIANAPOLIS EXCEPTION: Indiana does not have a separate local elevator inspection program for Indianapolis or any other municipality. IDHS state inspectors have statewide authority. Building owners in Indianapolis, Fort Wayne, Evansville, or any other Indiana city must comply with the state IDHS program — there is no local city authority that supersedes it. This contrasts with the Illinois OSFM / Chicago DOB split.

ENFORCEMENT: IDHS may issue stop-work orders, revoke operating certificates, and initiate disciplinary proceedings against licensees. Operating a regulated lifting device without a valid certificate of operation is a violation.',
  'https://law.justia.com/codes/indiana/title-22/article-15/chapter-5/',
  NULL,
  ARRAY['IN'],
  ARRAY['elevator_code', 'indiana', 'permits', 'licensing', 'idhs', 'regulated-lifting-device']
),

(
  'Indiana Operating Certificate and Inspection Requirements (IC 22-15-5-4)',
  'inspection_requirement',
  'Indiana IC 22-15-5-4 establishes the operating certificate program for regulated lifting devices. An operating certificate is the Indiana equivalent of an Illinois Certificate of Operation — no regulated lifting device may be operated without one.

OPERATING CERTIFICATE REQUIREMENT: A regulated lifting device may not be operated in Indiana without a valid operating certificate issued by IDHS. The building owner is responsible for ensuring the certificate is current. Operating without a certificate is a violation subject to enforcement action.

INITIAL OPERATING CERTIFICATE: IDHS issues an initial operating certificate after: (1) a licensed elevator inspector performs an acceptance inspection confirming the device complies with applicable laws and ASME A17.1 requirements, and (2) the applicant pays the applicable fee. The device may not be placed into service prior to passing the acceptance inspection.

RENEWAL (ANNUAL) CERTIFICATE: Renewal operating certificates require: (1) completion of applicable safety tests demonstrating the device remains in compliance, (2) submission of all test results (including failed tests) to IDHS, and (3) payment of the renewal fee. The renewal fee for a regulated lifting device operating certificate is $120 per device (IC 22-12-6-6). Annual inspections are conducted by licensed IDHS state inspectors or, in some contexts, approved third-party inspectors holding a valid Indiana elevator inspector license.

ASME A17.1 PERIODIC TESTS: Indiana follows ASME A17.1 periodic test requirements. Category 1 tests (full load, full speed) must be conducted annually. Category 5 tests (safety and governor tests for traction elevators) operate on a 5-year cycle. Test results must be reported to IDHS on State Form 34599 (Report of Tests for Regulated Lifting Devices). Building owners and maintenance contractors should confirm responsibility for scheduling and funding Category 1 and Category 5 tests in their maintenance agreements, as these are frequently excluded from standard contract scope.

TEMPORARY OPERATING PERMIT: IDHS may issue a temporary operating permit to applicants who do not yet fully meet operating certificate requirements, subject to conditions. This may apply to new installations pending final acceptance or to existing devices undergoing alteration.

POST-WORK INSPECTION: After any permitted installation, alteration, or major repair, a final inspection by a licensed IDHS elevator inspector is required before the device can return to service.

RED FLAGS IN PROPOSALS: Proposals that exclude permit fees, do not specify who pulls the permit, or omit Category 5 test costs should be closely scrutinized. Any contract referencing standards other than ASME A17.1 (the Indiana-adopted standard) warrants verification.

CONTACT: IDHS Division of Fire and Building Safety, Elevator Section. Email: elevamuse@dhs.in.gov. Online portal: publicsafety.dhs.in.gov.',
  'https://law.justia.com/codes/indiana/title-22/article-15/chapter-5/section-22-15-5-4/',
  NULL,
  ARRAY['IN'],
  ARRAY['indiana', 'inspection', 'operating-certificate', 'idhs', 'category1', 'category5', 'annual']
),

(
  'Indiana Elevator Contractor and Mechanic Licensing Requirements (IC 22-15-5-8 through 22-15-5-12)',
  'licensing_requirement',
  'Indiana requires licensure for elevator contractors and elevator mechanics, and QEI-equivalent certification for elevator inspectors, all administered by IDHS Division of Fire and Building Safety.

ELEVATOR CONTRACTOR LICENSE: No person or business entity may engage in the installation, alteration, or repair of regulated lifting devices in Indiana without a valid elevator contractor license from IDHS. License applications are submitted through the IDHS Public Safety Portal. The contractor license application fee is $500. The contractor must carry workers'' compensation insurance (IC 22-3-2-5) and submit proof with the application. Criminal history from all states of residence in the past five years is required for individual applicants.

ELEVATOR MECHANIC LICENSE (IC 22-15-5-12): An individual may not act as an elevator mechanic in Indiana without holding a valid Indiana elevator mechanic license. Eligibility criteria: (1) hold an active elevator mechanic license from a state whose program IDHS has determined is equivalent to Indiana''s, OR (2) have at least 3 years of documented work experience in elevator construction, maintenance, and repair, OR (3) have at least 18 months of elevator industry experience plus 3 years of experience in a related field certified by a licensed elevator contractor. Initial licenses expire December 31 of the second calendar year after issuance. Renewal licenses are valid for two years. Mechanics must carry their license on their person and present it upon request by an IDHS representative.

ELEVATOR INSPECTOR LICENSE (IC 22-15-5-11): Applicants for an elevator inspector license must meet the standards of ASME QEI-1 (Standard for the Qualification of Elevator Inspectors) or an equivalent nationally accepted standard approved by the IDHS commission. This is effectively the QEI credential requirement, consistent with Illinois and other states.

TEMPORARY AND EMERGENCY LICENSES: Indiana provides for temporary and emergency elevator mechanic licenses under IC 22-15-5-13, allowing continuity of service in limited circumstances.

DISCIPLINARY PROCEEDINGS: IDHS may deny, suspend, or revoke licenses under IC 22-15-5-16. Building owners contracting with Indiana elevator companies should require contractors to provide proof of current licensure and to maintain licensure throughout the contract term. Contracts should include a clause obligating the contractor to notify the building owner of any license suspension or revocation.

LICENSE VERIFICATION: Contractor, mechanic, and inspector license status can be verified through the IDHS Public Safety Portal at publicsafety.dhs.in.gov. A current list of licensed elevator service contractors is published by IDHS.',
  'https://law.justia.com/codes/indiana/title-22/article-15/chapter-5/section-22-15-5-12/',
  NULL,
  ARRAY['IN'],
  ARRAY['indiana', 'licensing', 'contractor', 'mechanic', 'inspector', 'qei', 'idhs']
),

(
  'Indiana — No Indianapolis Exception; Statewide IDHS Jurisdiction',
  'elevator_code',
  'Unlike Illinois, which has a bifurcated regulatory structure (OSFM statewide, Chicago Department of Buildings within city limits), Indiana operates a unified statewide elevator inspection and permitting program. The Indiana Department of Homeland Security (IDHS) Division of Fire and Building Safety has jurisdiction over all regulated lifting devices throughout Indiana — including Indianapolis, Fort Wayne, Evansville, South Bend, Carmel, and all other municipalities.

NO LOCAL CITY PROGRAM: There is no Indiana statute authorizing the City of Indianapolis or any other Indiana municipality to maintain a separate, independent elevator inspection and permitting program that supersedes IDHS authority. Building owners and contractors operating in Indianapolis must work through IDHS, not a local city agency.

PRACTICAL IMPLICATIONS FOR CONTRACT REVIEW: When reviewing elevator contracts for Indiana properties, there is no need to distinguish between "state" vs. "local" inspection requirements. The code reference throughout the state is the same: ASME A17.1 as adopted by IDHS, administered under IC 22-15-5. Proposals referencing separate local permitting or local certificates for Indianapolis properties are likely incorrect.

COMPARISON TO ILLINOIS: In Illinois, a Chicago building is subject to Chicago Title 14C and the DOB AIC program, not OSFM rules — a significant operational difference. In Indiana, no such distinction exists. Indiana is a simpler regulatory environment in this regard.

INDIANAPOLIS MARKET CONTEXT: Indianapolis is the largest elevator market in Indiana. IUEC (International Union of Elevator Constructors) Local 138 covers Indiana, including Indianapolis. Union labor is the standard for commercial elevator installation and major maintenance in Indianapolis, though non-union contractors operate in smaller markets. Union wage scales affect pricing for new construction and modernization projects in Indianapolis above what would be seen in smaller Indiana markets.

CONTACT: IDHS Division of Fire and Building Safety, Elevator Section, 302 W. Washington Street, Room E245, Indianapolis, IN 46204. Email: elevamuse@dhs.in.gov.',
  'https://www.in.gov/dhs/fire-and-building-safety/elevators-and-amusement-rides/',
  NULL,
  ARRAY['IN'],
  ARRAY['indiana', 'indianapolis', 'jurisdiction', 'idhs', 'statewide', 'iuec']
),

(
  'Indiana Elevator Pricing Context — Indianapolis and Statewide Market (2024–2026)',
  'pricing_context',
  'Observed pricing patterns for elevator work in Indiana, including the Indianapolis metro and smaller markets. These ranges are derived from abstracted pattern data and are NOT benchmarks. They are provided for context only.

MAINTENANCE CONTRACT RATES (Monthly, per unit):
- Low-rise hydraulic (2–5 floors): $150–$225/month — Full-service contract
- Mid-rise traction (6–15 floors): $200–$300/month — Full-service contract
- High-rise traction (16+ floors): $275–$450/month — Full-service, varies by traffic volume and equipment age
- Indianapolis vs. smaller markets: Indianapolis (union labor market) typically runs 10–15% above smaller Indiana cities (Terre Haute, Muncie, Kokomo)

LABOR CONTEXT: Indiana is a right-to-work state. IUEC Local 138 (International Union of Elevator Constructors) covers Indiana and typically performs commercial installation, modernization, and major maintenance in Indianapolis and other larger markets. Non-union contractors are more prevalent in small commercial and low-rise sectors. Prevailing wage requirements apply to public contracts (state or federal funding) and can push labor costs higher on those projects.

MODERNIZATION PRICING (Observed ranges, Indiana market):
- Complete hydraulic modernization (single car): $275,000–$500,000 — Variance driven by jack assembly condition, building age, and site-specific excavation requirements
- Hydraulic jack replacement + excavation: $50,000–$90,000 — Site-dependent; Indiana soil conditions are generally less challenging than Chicago metro
- Controller replacement (non-proprietary): $35,000–$60,000 — Includes programming and commissioning
- Cab interior (standard commercial): $15,000–$35,000 — Allowance-dependent
- Door equipment (complete, per opening): $3,000–$6,500 — Per landing door

OPERATING CERTIFICATE FEE: Indiana''s $120 per-unit annual renewal fee is relatively low compared to neighboring states. However, inspection scheduling, travel time for state inspectors, and re-inspection costs after failed tests should be factored into total annual compliance cost.

CHANGE ORDER RATES (Indiana market):
- Field team (mechanic + helper): $300–$500/hour — Reflects union scale in Indianapolis; lower in smaller markets
- Material markup over cost: 10–20%
- Subcontractor markup: 5–10%

NOTE: Indiana pricing is generally below Illinois and Michigan. Smaller Indiana markets outside Indianapolis (Evansville, Fort Wayne, Bloomington) typically fall at or below the lower end of these ranges. All ranges are for context only and do not constitute benchmarks or appraisals.',
  'https://www.in.gov/dhs/fire-and-building-safety/elevators-and-amusement-rides/elevator-fees/',
  NULL,
  ARRAY['IN'],
  ARRAY['indiana', 'indianapolis', 'pricing', 'modernization', 'maintenance', 'iuec', 'union']
);
