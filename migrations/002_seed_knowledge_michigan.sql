-- Seed: Michigan elevator code knowledge base entries
-- Source: Michigan Public Act 227 of 1967, LARA Elevator Unit, ASME A17.1, OSHA standards
-- Run in Supabase SQL Editor after 001_knowledge_table.sql

INSERT INTO knowledge (title, category, content, source_url, equipment_types, states, tags) VALUES

(
  'Michigan Elevator Safety Act (Public Act 227 of 1967)',
  'elevator_code',
  'Michigan Public Act 227 of 1967 governs elevator safety statewide under the Department of Licensing and Regulatory Affairs (LARA) Bureau of Construction Codes. Key requirements:

PERMITS & REGISTRATION: All elevator installations, alterations, and repairs require a permit from the LARA Elevator Unit before work begins. Operating certificates must be current and posted inside the elevator cab. Permits are required for any change to equipment, controls, or safety devices.

INSPECTION INTERVALS: Annual safety inspections are mandatory for all conveyances. Inspections must be performed by LARA-certified inspectors or approved third-party inspection agencies. The certificate of inspection must be renewed each year and must be on file and available for review.

CONTRACTOR LICENSING: Only licensed elevator contractors and mechanics may install, alter, or repair elevators in Michigan. Unlicensed work is a violation and can result in permit revocation and fines. Contractors must be registered with LARA.

SCOPE OF COVERAGE: The act covers elevators, escalators, platform lifts, stairway chairlifts, dumbwaiters, and belt manlifts throughout Michigan. Private residences are exempt.

ADOPTED STANDARDS: Michigan adopts ASME A17.1 (Safety Code for Elevators and Escalators), ASME A18.1 (platform lifts and stairway chairlifts), and ASME A90.1 (belt manlifts) as the technical standards. State amendments apply where noted.

VIOLATIONS & ENFORCEMENT: LARA may issue stop-work orders, revoke operating certificates, and assess fines for non-compliance. Elevators found to have safety violations must be taken out of service until corrected and re-inspected.

MAINTENANCE REQUIREMENTS: Owners are responsible for maintaining elevators in safe operating condition between inspections. A written maintenance control program (MCP) per ASME A17.1 requirements is required for most elevator types.',
  'https://legislature.mi.gov/documents/mcl/pdf/mcl-Act-227-of-1967.pdf',
  NULL,
  ARRAY['MI'],
  ARRAY['elevator_code', 'michigan', 'permits', 'inspection', 'licensing']
),

(
  'ASME A17.1 — Key Safety Requirements for Elevator Proposals',
  'safety_standard',
  'ASME A17.1 is the foundational North American safety code for elevators, adopted by Michigan and most other states. When reviewing elevator proposals and contracts, the following ASME A17.1 requirements are most relevant:

LOAD & CAPACITY: Elevators must be designed and rated for specific load capacities. Any proposal to replace or modify a power unit, drive system, or car must address load rating compatibility. Proposals should specify the rated load (lbs) of the new equipment.

SAFETY DEVICES: Required safety devices include: governor and safeties (traction), pressure relief valves (hydraulic), buffer stops, door interlocks, car and hoistway lighting, emergency stop switches, and firefighters emergency operation. Any proposal involving modernization must address safety device compliance and testing.

INSPECTION & TESTING: Category 1 tests (annual) verify basic operation. Category 5 tests (5-year cycle for hydraulic) include full load pressure testing and safety valve testing. Proposals for maintenance contracts should specify which test categories are included and who is responsible for test costs.

HYDRAULIC ELEVATOR SPECIFICS: ASME A17.1 Section 3 governs hydraulic elevators. Key requirements: single bottom cylinder installations require a check valve or lowering valve to prevent free fall; underground cylinders require cathodic protection or PVC liner; power units must include a pressure relief valve set to no more than 150% of operating pressure; working pressure must be calculated and documented.

MAINTENANCE CONTROL PROGRAM (MCP): ASME A17.1 Rule 8.6 requires a written MCP for each elevator. The MCP must define maintenance tasks, intervals, and responsible parties. Any maintenance contract should align with the MCP requirements. Ask vendors to confirm MCP compliance.

CONTRACT IMPLICATIONS: When evaluating proposals, verify that scope includes all items required by ASME A17.1 for the specific work type (new installation, modernization, or repair). Items commonly excluded that may be code-required: pit lighting, machine room lighting, GFCI outlets, pit ladder and stop switch, emergency lighting and ARD (automatic rescue device).',
  'https://archive.org/details/gov.law.asme.a17.1.2004',
  NULL,
  NULL,
  ARRAY['asme', 'a17.1', 'safety', 'hydraulic', 'traction', 'inspection', 'testing', 'mcp']
),

(
  'OSHA Elevator Safety Standards — Workplace Requirements',
  'safety_standard',
  'OSHA standards establish mandatory federal workplace safety requirements applicable to elevator installation, maintenance, and operation. Relevant to proposal and contract review:

OSHA 1926.552 (Construction): Governs elevators used during construction. Personnel hoists must be inspected by a competent person before each shift and after any malfunction. Load ratings must be posted and not exceeded. Safety devices must be operational — no bypassing or defeating of safety systems.

GENERAL INDUSTRY REQUIREMENTS: Elevators must be operated only by authorized personnel. No operation of elevators with known safety-affecting defects. Load limits must be posted inside and outside the car. Emergency stop switches must be accessible and operational.

MAINTENANCE SAFETY: Workers performing maintenance must follow lockout/tagout (LOTO) procedures per OSHA 1910.147. Any contract for maintenance should require contractor compliance with LOTO requirements. Contractors must provide documentation of LOTO training for mechanics.

CONTRACTOR COMPLIANCE IMPLICATIONS: When reviewing maintenance proposals, verify: (1) contractor OSHA safety record — ask for EMR (Experience Modification Rate), which should be at or below 1.0; (2) whether mechanics are certified (NAEC or equivalent); (3) whether the contract includes LOTO compliance as a stated obligation.

REPORTING REQUIREMENTS: Serious elevator accidents must be reported to OSHA. Building owners and contractors share responsibility for maintaining safe conditions. Contracts should clearly define who bears responsibility for OSHA compliance and who is liable in the event of an injury related to maintenance failure.',
  'https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926.552',
  NULL,
  NULL,
  ARRAY['osha', 'safety', 'loto', 'construction', 'maintenance', 'compliance']
),

(
  'Michigan Elevator Inspection & Permit Practical Guide',
  'inspection_requirement',
  'Practical inspection and permitting requirements for elevator work in Michigan, based on LARA Bureau of Construction Codes guidance:

OPERATING CERTIFICATE: Every elevator in Michigan must have a current Certificate of Operation posted in or near the elevator. The certificate is issued after a successful annual inspection. If the certificate has lapsed, the elevator should not be in service. Building owners are responsible for scheduling and paying for inspections.

PERMIT TRIGGERS: The following work requires a permit before beginning: new elevator installation, modernization (any change to safety devices, controls, drive system, or car), replacement of major components (power unit, controller, doors), and any work that affects the safety system. Routine maintenance and minor repairs typically do not require permits, but verify with LARA for borderline work.

INSPECTION PROCESS: After permitted work is complete, a final inspection is required before the elevator returns to service. The contractor must call for inspection and the elevator must pass before it can operate. For major modernizations, multiple inspections may be required at different phases.

RED FLAGS IN PROPOSALS: Watch for proposals that do not mention permit costs (permits are the contractor responsibility to pull but cost is often passed to owner). Ask who pulls the permit and whether permit fees are included in the contract price. Proposals that exclude "code compliance items" or list them as alternates may be shifting code-required work to the owner at extra cost.

INSPECTION CONTACT: Michigan LARA Elevator Unit: 517-241-9313 or elevsafety@michigan.gov. Third-party inspection agencies approved by LARA may also perform the annual inspection.',
  'https://www.michigan.gov/lara/bureau-list/bcc/sections/elevator-unit',
  NULL,
  ARRAY['MI'],
  ARRAY['michigan', 'inspection', 'permit', 'certificate', 'lara']
);
