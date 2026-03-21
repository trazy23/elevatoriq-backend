-- Seed: Illinois elevator code knowledge base entries
-- Source: Illinois Elevator Safety and Regulation Act (225 ILCS 312/), 41 Ill. Admin. Code 1000,
--         Office of the Illinois State Fire Marshal (OSFM), ASME A17.1-2019/2022, Chicago Title 14C
-- Run in Supabase SQL Editor after 002_seed_knowledge_michigan.sql

INSERT INTO knowledge (title, category, content, source_url, equipment_types, states, tags) VALUES

(
  'Illinois Elevator Safety and Regulation Act (225 ILCS 312/)',
  'elevator_code',
  'The Illinois Elevator Safety and Regulation Act (225 ILCS 312/) governs elevator safety throughout Illinois, administered by the Office of the Illinois State Fire Marshal (OSFM) Division of Elevator Safety. The OSFM has jurisdiction over all conveyances OUTSIDE the City of Chicago. Chicago operates its own separate program under the Department of Buildings. Key requirements:

REGULATORY AUTHORITY: The OSFM Division of Elevator Safety regulates the design, installation, construction, operation, inspection, testing, maintenance, alteration, and repair of elevators and other conveyances statewide except within Chicago city limits. The administrative rules are codified at 41 Ill. Admin. Code Part 1000, most recently revised December 28, 2023.

SCOPE OF COVERAGE: The Act covers elevators, dumbwaiters, escalators, moving sidewalks, platform lifts, stairway lifts, automated people movers, and belt manlifts throughout Illinois (outside Chicago). Private single-family residences are typically exempt.

ADOPTED STANDARDS: Illinois adopted ASME A17.1-2019 (Safety Code for Elevators and Escalators) and ASME A18.1-2017 (platform lifts and stairway chairlifts) as the technical standards for conveyances in the state. The ASME A17.1-2022 edition was anticipated to take effect approximately January 1, 2026, with updated inspection forms approved by the Elevator Safety Review Board.

PERMITS REQUIRED: Permits from OSFM are required before beginning any installation, alteration, or major repair of a conveyance. Work without a permit is a violation. Permit applications are submitted to the OSFM Elevator Safety Division at 555 W. Monroe Street, Suite 1300-N, Chicago, IL 60661. As of September 29, 2025, OSFM transitioned to the GL Solutions portal for registrations, certificates, permits, variances, and licenses.

LICENSING: Only licensed elevator contractors may perform installation, alteration, or repair work in Illinois. Mechanics must be registered. Inspectors must hold both QEI (Qualified Elevator Inspector) certification from a nationally recognized body AND an Illinois inspector license from OSFM. Inspection companies must be licensed by OSFM ($500 application fee). An inspector must notify OSFM within 24 hours of any suspension, termination, or expiration of their QEI certification.

VIOLATIONS & ENFORCEMENT: OSFM may issue stop-work orders, revoke certificates of operation, and pursue penalties for non-compliance. Elevators with active violations must be taken out of service until corrected and re-inspected.

MUNICIPALITY EXCEPTION: Municipalities and counties may apply to OSFM for approval to administer their own local elevator inspection programs. Any signed Local Elevator Safety Program Agreements must use the agreement document current as of October 1, 2025. Building owners should verify which authority — OSFM or an approved local program — has jurisdiction over their specific building.',
  'https://www.ilga.gov/Legislation/ILCS/Articles?ActID=2472&ChapterID=24',
  NULL,
  ARRAY['IL'],
  ARRAY['elevator_code', 'illinois', 'permits', 'licensing', 'osfm']
),

(
  'Illinois OSFM Certificate of Operation and Inspection Requirements',
  'inspection_requirement',
  'Certificate of operation and inspection requirements for conveyances regulated by the Illinois Office of the State Fire Marshal (OSFM) outside the City of Chicago:

ANNUAL CERTIFICATE OF OPERATION: Owners of all conveyances subject to the Act must apply annually for a Certificate of Operation. The certificate is issued after a successful annual inspection. It is the building owner''s responsibility — not the elevator contractor''s — to ensure the certificate is current and the inspection is scheduled. Operating an elevator without a current certificate is a violation.

RELIGIOUS ORGANIZATION EXCEPTION: Public Act 097-0310 amended the Act to allow certain conveyances located in churches, synagogues, or other buildings used primarily for religious worship to renew certificates of operation on a triennial (every 3 years) basis rather than annually, subject to specific conditions.

WHO MAY INSPECT: Inspections must be performed by inspectors who hold both (1) QEI certification from a nationally recognized organization and (2) a current Illinois inspector license from OSFM. The inspection company employing the inspector must also hold a valid Illinois elevator inspection company license. No unlicensed inspector or company may perform inspections under the Act.

CATEGORY 1 AND CATEGORY 5 TESTING: ASME A17.1 periodic inspection and testing requirements apply. Category 1 tests (full load, full speed) must be performed annually. Category 5 tests (safety and governor tests for traction elevators) are required on a 5-year cycle. Hydraulic elevators have their own periodic testing requirements. Maintenance contracts should specify who is responsible for scheduling and paying for Category 1 and Category 5 tests, as these costs are frequently excluded from standard maintenance pricing.

FIRE ALARM INITIATING DEVICE (FAID) TESTING: Effective upon Illinois''s adoption of ASME A17.1-2019, live testing of fire alarm initiating devices (FAID) is required for both hydraulic and traction elevators with FAID recall zones. This new requirement added a testing obligation that was not required under prior code. Maintenance contracts entered before this requirement may not address FAID testing costs — building owners should verify whether their current contract assigns this cost to the vendor or treats it as a billable extra.

POST-WORK INSPECTION: After any permitted installation, alteration, or major repair, a final inspection by an OSFM-approved inspector is required before the conveyance can return to service. For major modernizations, interim inspections may be required at defined phases.

RED FLAGS IN PROPOSALS: Proposals that do not address permit fees or who pulls the permit. Proposals that exclude "code-required items" or list them as alternates. Proposals that do not specify whether Category 5 testing and FAID testing are included or billed separately. Proposals that do not address re-inspection costs (charged separately when inspections fail due to incomplete work).

CONTACT: OSFM Elevator Safety Division, 555 W. Monroe Street, Suite 1300-N, Chicago, IL 60661. Online portal: GL Solutions (as of September 29, 2025).',
  'https://sfm.illinois.gov/about/divisions/elevators.html',
  NULL,
  ARRAY['IL'],
  ARRAY['illinois', 'inspection', 'certificate', 'osfm', 'category1', 'category5', 'faid']
),

(
  'City of Chicago Elevator Jurisdiction — Department of Buildings and AIC Program',
  'elevator_code',
  'The City of Chicago operates its own elevator inspection and permitting program that is entirely separate from the Illinois OSFM. This is a critical jurisdictional distinction for any work performed in Chicago:

SEPARATE JURISDICTION: The City of Chicago Department of Buildings (DOB) Elevator Bureau has jurisdiction over all conveyances within Chicago city limits. The Illinois OSFM does NOT regulate conveyances inside Chicago. Building owners with properties in Chicago must comply with Chicago requirements, not OSFM requirements.

GOVERNING CODE: Chicago''s elevator requirements are codified in Title 14C of the Chicago Municipal Code (Chicago Building Code), effective October 1, 2018. Title 14C incorporates ASME A17.1 as the base technical standard with Chicago-specific amendments.

ANNUAL INSPECTION CERTIFICATION (AIC) PROGRAM: Chicago requires building owners/property managers to hire state-licensed, third-party inspection companies to inspect their elevators and conveyances annually. The AIC program requires building owners to document existing conditions and submit required inspection reports to the DOB. The inspector (Authorized Technician / AT) must be a QEI-certified inspector licensed by the State of Illinois AND working for an Illinois-licensed inspection company.

AIC GEOGRAPHIC SCOPE: The AIC program applies to all buildings within the Central Business District of Chicago equipped with a covered conveyance device, and extends to other Chicago buildings subject to annual inspection requirements. Certain exemptions apply — verify with DOB.

CHICAGO PERMITS: Work permits for Chicago elevators are obtained through the Chicago DOB, not OSFM. Chicago has its own permit process, fee schedule, and inspection workflow.

CONTRACTOR LICENSING: Contractors must hold an Illinois state elevator contractor license to perform work in Chicago. Chicago may impose additional local registration or bonding requirements.

PRACTICAL IMPLICATIONS FOR CONTRACT REVIEW: When reviewing elevator contracts for Chicago properties, verify that the vendor is referencing the correct code (Chicago Title 14C, not OSFM rules), that inspection costs are structured around the AIC program timeline, and that the contract addresses who is responsible for submitting AIC documentation to the DOB. Failure to complete the AIC submission can result in city violations and fines regardless of whether the elevator is mechanically sound.

CONTACT: City of Chicago Department of Buildings, 121 N. LaSalle Street, Chicago, IL 60602. AIC program portal: ipi.cityofchicago.org.',
  'https://www.chicago.gov/city/en/depts/bldgs/provdrs/elevators.html',
  NULL,
  ARRAY['IL'],
  ARRAY['illinois', 'chicago', 'aic', 'department-of-buildings', 'inspection', 'permit', 'title-14c']
),

(
  'Illinois Elevator Contractor and Mechanic Licensing Requirements',
  'licensing_requirement',
  'Illinois requires licensing and registration for all elevator industry professionals working outside the City of Chicago, administered by the OSFM Division of Elevator Safety:

ELEVATOR CONTRACTOR LICENSE: No person or company may engage in the installation, alteration, or repair of conveyances in Illinois without a valid elevator contractor license from OSFM. Contractors must maintain current insurance as required by Section 100 of the Act and must provide OSFM at least 10 days notice of any substantial alteration or cancellation of a policy.

MECHANIC REGISTRATION: Elevator mechanics must be individually registered with OSFM to perform installation, alteration, or repair work. Unregistered mechanics performing regulated work creates licensing violations for the employing contractor.

APPRENTICE/HELPER REGISTRATION: Apprentices and helpers must also be registered with OSFM and may only work under direct supervision of a licensed mechanic.

INSPECTOR LICENSE: Inspectors must hold both (1) QEI certification from a nationally or internationally recognized personnel certification organization (e.g., NAEC QEI) AND (2) a current Illinois inspector license from OSFM. An inspector must notify OSFM within 24 hours of any suspension, termination, or expiration of their QEI certification. Inspections performed by a lapsed or unqualified inspector are invalid.

INSPECTION COMPANY LICENSE: No inspection company may perform inspections under the Act without (1) at least one officer holding a current QEI certification and Illinois inspector license, and (2) the company holding a valid Illinois elevator inspection company license. Application fee is $500.

IMPLICATIONS FOR PROPOSAL REVIEW: When reviewing maintenance proposals or bid submissions, verify that the contractor holds a current Illinois elevator contractor license. Proposals from unlicensed contractors create legal exposure for building owners who authorize work. Contracts should require the contractor to provide current license documentation and to maintain licensing in good standing throughout the contract term.

OSFM DISCIPLINE: OSFM may suspend, revoke, or refuse to renew licenses for cause. Building owners dealing with performance issues should confirm the contractor''s license remains in good standing — revocation can affect the validity of work already performed.

VERIFICATION: Contractor and mechanic license status can be verified through the OSFM licensing portal (GL Solutions, as of September 29, 2025).',
  'https://sfm.illinois.gov/about/divisions/elevators/elevator-contractors-inspectors-and-inspection-companies.html',
  NULL,
  ARRAY['IL'],
  ARRAY['illinois', 'licensing', 'contractor', 'mechanic', 'inspector', 'qei', 'osfm']
),

(
  'Illinois Elevator Pricing Context — Chicago and Suburban Market (2024–2026)',
  'pricing_context',
  'Observed pricing patterns for elevator work in the Illinois market, including the Chicago metro area and downstate markets. These ranges are derived from abstracted pattern data and are NOT benchmarks. They are provided for context only.

MAINTENANCE CONTRACT RATES (Monthly, per unit):
- Low-rise hydraulic (2–5 floors): $175–$250/month — Full-service contract
- Mid-rise traction (6–15 floors): $225–$325/month — Full-service contract
- High-rise traction (16+ floors): $300–$500/month — Full-service, varies by traffic and equipment age
- Chicago premium: Chicago buildings frequently see rates 15–25% above comparable suburban rates due to prevailing wage requirements and union labor rules

PREVAILING WAGE IMPACT: Illinois Prevailing Wage Act applies to public buildings and may apply to certain privately contracted work. Chicago and Cook County prevailing wage rates for elevator mechanics are among the highest in the nation. When reviewing bids for Illinois public buildings or Chicago projects, verify whether prevailing wage rates are incorporated into the pricing and whether compliance is represented by the contractor.

MODERNIZATION PRICING (Observed ranges, Illinois market):
- Complete hydraulic modernization (single car): $325,000–$600,000 — Wide variance based on jack assembly, building conditions, equipment specification
- Hydraulic jack replacement + excavation: $65,000–$110,000 — Highly site-dependent. Chicago subsurface conditions (fill, water table, buried infrastructure) can add $25,000+ above downstate equivalents
- Controller replacement (non-proprietary): $40,000–$70,000 — Includes programming and commissioning
- Cab interior (standard commercial): $18,000–$40,000 — Allowance-dependent
- Door equipment (complete, per opening): $3,500–$7,500 — Per landing door

CHICAGO-SPECIFIC COST FACTORS:
- Union labor required for most Chicago elevator work — International Union of Elevator Constructors (IUEC) Local 2
- Prevailing wage rates for elevator mechanics in Chicago exceed $100/hour in total compensation
- Building access restrictions (freight elevator hours, dock scheduling) add mobilization costs on urban projects
- Chicago permit fees and city-required inspections add to total project cost vs. suburban equivalents

CHANGE ORDER RATES (Illinois market):
- Field team (mechanic + apprentice): $375–$600/hour — Higher range reflects Chicago union rates
- Material markup over cost: 10–20%
- Subcontractor markup: 5–10%

NOTE: These ranges reflect the Illinois market generally and the Chicago metro specifically. Downstate Illinois (Peoria, Springfield, Rockford, etc.) typically falls at or below the lower end of these ranges. All ranges are for context only and do not constitute benchmarks or appraisals.',
  'https://sfm.illinois.gov/about/divisions/elevators.html',
  NULL,
  ARRAY['IL'],
  ARRAY['illinois', 'chicago', 'pricing', 'modernization', 'maintenance', 'prevailing-wage', 'union']
);
