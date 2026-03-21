/**
 * ElevatorIQ — Scope Generator API Routes
 * Base path: /api/v1/scope-generator
 *
 * Endpoints:
 *   POST   /sessions                              — create session
 *   POST   /sessions/:id/intake/universal         — save universal intake
 *   POST   /sessions/:id/intake/:work_type        — save work-type intake
 *   POST   /sessions/:id/generate                 — generate document (calls Claude)
 *   POST   /sessions/:id/outputs/:oid/acknowledge — record acknowledgment + enable download
 *   GET    /sessions/:id/outputs/:oid/download    — download document text
 *   POST   /sessions/:id/referral                 — log consultant referral click
 *   GET    /sessions/:id                          — get full session state
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const Anthropic = require('@anthropic-ai/sdk');
const { generateScopePDF } = require('../services/scopePdfService');
require('dotenv').config();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getClientIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    null
  );
}

/**
 * Derive routing output_path from intake flags.
 */
function deriveOutputPath(workType, workTypeIntake) {
  if (workType === 'new_installation') return 'coming_soon_capture';
  if (workType === 'maintenance') return 'bid_framework';
  if (workType === 'repair') {
    return workTypeIntake.scope_known === false ? 'rfi_document' : 'bid_framework';
  }
  if (workType === 'modernization') {
    return workTypeIntake.scope_preference === 'Not sure — need guidance'
      ? 'modernization_readiness_guide'
      : 'bid_framework';
  }
  return 'bid_framework';
}

/**
 * Build active flag set from universal + work-type intake.
 */
function buildFlags(universalIntake, workTypeIntake, workType) {
  const flags = {
    consultant_flag: universalIntake.consultant_involved === 'No',
    proprietary_flag: false,
    prevailing_wage_flag: false,
    phasing_flag: false,
    response_time_premium: false,
    shutdown_flag: false,
  };

  if (workType === 'repair' && workTypeIntake) {
    flags.proprietary_flag = ['Yes', 'Unknown'].includes(workTypeIntake.proprietary_component);
    flags.shutdown_flag =
      workTypeIntake.code_violation?.startsWith('Yes') &&
      workTypeIntake.active_maintenance_contract === 'Yes';
  }
  if (workType === 'modernization' && workTypeIntake) {
    flags.prevailing_wage_flag = ['Yes', 'Unknown'].includes(workTypeIntake.prevailing_wage);
    flags.phasing_flag = workTypeIntake.phased_approach === 'Yes — phased required';
  }
  if (workType === 'maintenance' && workTypeIntake) {
    flags.response_time_premium = [
      'Within 2 hours — premium',
      '24/7 including holidays — premium',
    ].includes(workTypeIntake.response_time);
  }

  return flags;
}

/**
 * Generate a human-readable framework ID: EIQ-YYYY-NNNN
 */
async function generateFrameworkId() {
  try {
    const result = await db.query("SELECT nextval('scope_framework_seq') AS n");
    const n = String(result.rows[0].n).padStart(4, '0');
    const year = new Date().getFullYear();
    return `EIQ-${year}-${n}`;
  } catch {
    // Fallback if sequence not available (e.g., migration not yet run)
    const rand = Math.floor(Math.random() * 9000) + 1000;
    return `EIQ-${new Date().getFullYear()}-${rand}`;
  }
}

// ─── Prompt Templates ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are ElevatorIQ's Bid Standardization Engine. Your role is to generate Owner Intent and Bid Standardization Framework documents for elevator procurement projects.

CRITICAL RULES — NEVER VIOLATE:

1. LANGUAGE RULES
   - NEVER use: specification, specs, engineering recommendation, we recommend, required installation, must install, must replace, ElevatorIQ recommends
   - ALWAYS use: scope framework, owner intent, bid standardization, contractor to verify, field verification required, typically includes, may include, final selection by contractor, common industry approach

2. FUNCTIONAL LANGUAGE ONLY
   - Describe OUTCOMES, not exact solutions
   - WRONG: "Install GAL door operator model 7HC"
   - RIGHT: "Provide modern, non-proprietary door operator compatible with existing door equipment. Final model selection by contractor."

3. NO INFERENCES FROM UPLOADED DOCUMENTS
   - Only restate what the user explicitly provided
   - Label all user-provided data as: "per owner-provided information"

4. NO SYSTEM TYPE RECOMMENDATIONS
   - Never recommend hydraulic vs. traction vs. MRL
   - Present as "common industry approaches" only

5. MANDATORY SECTIONS — every output must include ALL of these:
   a. Document Purpose Statement (verbatim — do not modify)
   b. Contractor Determination Required section
   c. Standardized Response Requirements
   d. Mandatory Disclaimer (verbatim — do not modify)
   e. Questions to Ask Every Contractor

6. CONDITIONAL INJECTIONS — include only flag callouts where intake_flags indicate true

7. TONE — Professional, clear, direct. Written for a sophisticated non-technical buyer.
   Avoid jargon unless paired with plain language explanation.

Your output will be downloaded as a PDF and distributed to elevator contractors.
It must command professional credibility while clearly positioning itself as a
procurement planning tool, not a specification.`;

const VERBATIM_PURPOSE = `This document is an Owner Intent and Bid Standardization Framework prepared to support competitive procurement. It defines project goals, known conditions, and standardized response requirements for contractor proposals. It does not constitute a construction specification or engineering design. Final component selection, field verification, and code compliance are the responsibility of the responding contractor.`;

const VERBATIM_DISCLAIMER = `This document is a preliminary procurement planning tool and does not constitute a construction specification or engineering design. ElevatorIQ is a decision-support platform. Scope must be field-verified by qualified professionals. ElevatorIQ assumes no responsibility for project outcomes, contractor selection, or work quality.`;

const VERBATIM_QUESTIONS = `QUESTIONS TO ASK EVERY CONTRACTOR

Before accepting any proposal, ask each contractor:
1. What is and isn't included in this proposal?
2. What allowances are built in for unforeseen conditions found during work?
3. How do you handle scope changes once work begins — what is your change order process?
4. What warranties are provided, and who backs them — you or the manufacturer?
5. Are any proposed components proprietary to your company for future service?
6. Who pulls permits and handles inspection scheduling?
7. Who is doing the work — your employees or subcontractors?
8. What is your process if the elevator is out of service longer than projected?`;

const VERBATIM_BEFORE_BIDS = `BEFORE YOU SOLICIT BIDS
Without an independent assessment, proposals on a project of this complexity will vary significantly and may be difficult to compare.

Recommended steps:
1. Engage a licensed elevator consultant for an independent assessment
2. Request a written condition report from your current maintenance provider
3. Pull your equipment records and maintenance history`;

function buildUserPrompt(workType, outputPath, universalIntake, workTypeIntake, flags) {
  const activeFlagsList = Object.entries(flags)
    .filter(([, v]) => v === true)
    .map(([k]) => k)
    .join(', ') || 'none';

  const flagCallouts = buildFlagCalloutText(flags);

  if (outputPath === 'bid_framework') {
    return `Generate an Elevator Bid Standardization Framework using the following intake data. Follow all system prompt rules precisely.

WORK TYPE: ${workType}
OUTPUT PATH: bid_framework

UNIVERSAL INTAKE:
${JSON.stringify(universalIntake, null, 2)}

WORK TYPE INTAKE:
${JSON.stringify(workTypeIntake, null, 2)}

ACTIVE FLAGS: ${activeFlagsList}

DOCUMENT SECTIONS TO GENERATE (in this order):

SECTION 1 — DOCUMENT HEADER
Format as:
ELEVATOR BID STANDARDIZATION FRAMEWORK
Prepared by: ElevatorIQ Procurement Intelligence Platform
Property: [Building Name / Address from intake]
Work Type: [work type]
Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

SECTION 2 — DOCUMENT PURPOSE STATEMENT
Insert verbatim (do not modify):
"${VERBATIM_PURPOSE}"

SECTION 3 — KNOWN CONDITIONS
Restate only user-provided data — no inferences, no conclusions.
Label: "The following conditions are based on owner-provided information. Contractors must independently verify all conditions prior to proposal submission."

SECTION 4 — PROJECT GOALS
Plain language statement of what the owner is trying to achieve. Functional outcomes, not technical solutions.

SECTION 5 — SCOPE FRAMEWORK
Work-type specific framework based on ${workType} intake. Use checkbox format (□). Functional language throughout. Each applicable item paired with "Contractor to verify / Final selection by contractor."

SECTION 6 — CONTRACTOR DETERMINATION REQUIRED
Standard section:
The following items require contractor field assessment and determination:
• Final component selection and specifications
• Compatibility verification with existing equipment
• Code compliance and jurisdictional requirements
• Exact material and product specifications
• Final labor and timeline estimates
• Any conditions not visible without site inspection

SECTION 7 — STANDARDIZED RESPONSE REQUIREMENTS
To enable comparison across proposals, all contractors must respond to:
□ Scope inclusions — itemized list of all work included
□ Scope exclusions — explicit list of what is not included
□ Proposed timeline — start date, duration, completion date
□ Warranty terms — parts and labor separately
□ Component specifications — brand, model, or equivalent
□ Payment terms
□ Permit responsibility
□ Subcontractor disclosure (if applicable)
□ Contractor Notes / Deviations

CONTRACTOR NOTES / DEVIATIONS section:
If your proposal deviates from any element of this framework, or if you wish to propose an alternative approach, document it here:
[ ] I am proposing an alternative to the requested scope. Details: ___
[ ] Site conditions require scope modifications. Details: ___
[ ] I recommend a different system approach. Details: ___
[ ] Other notes: ___

SECTION 8 — CONDITIONAL FLAG CALLOUTS
${flagCallouts || '(No conditional flags active for this project)'}

SECTION 9 — CONTRACTOR ACKNOWLEDGMENT REQUIREMENTS
Prior to submitting a proposal, contractor must: (1) complete a site walkthrough, (2) review all existing equipment documentation available, (3) verify all conditions listed in this framework. Proposals submitted without site verification will not be considered.

SECTION 10 — MANDATORY DISCLAIMER
Insert verbatim (do not modify):
"${VERBATIM_DISCLAIMER}"

SECTION 11 — QUESTIONS TO ASK EVERY CONTRACTOR
Insert verbatim (do not modify):
${VERBATIM_QUESTIONS}

OUTPUT FORMAT: Plain text with clear section headers. No markdown. No bullet symbols beyond dashes and checkboxes (□ and [ ]). Professional document formatting. Use ═══ lines to visually separate major sections.`;
  }

  if (outputPath === 'rfi_document') {
    return `Generate an Elevator Assessment Request for Information (RFI) document.
The owner does not have a prior diagnosis. This document requests contractor assessment, not a fixed scope bid.

INTAKE DATA:
${JSON.stringify(universalIntake, null, 2)}
${JSON.stringify(workTypeIntake, null, 2)}

ACTIVE FLAGS: ${activeFlagsList}

Generate the RFI document with these sections:
1. Document Header (property info, date, type: RFI)
2. Purpose — requests contractor assessment and preliminary pricing; owner does not have prior diagnosis
3. Reported Conditions — from intake (issue description, duration, operational status)
4. Assessment Requirements — contractors must complete full site inspection, provide written findings, propose repair scope with itemized pricing, note additional observed conditions, disclose proprietary components
5. Response Format — checkboxes: assessment findings, recommended repair scope, alternative options, itemized pricing, timeline, warranty terms, contractor notes/deviations
6. ${flagCallouts || ''}
7. Recommendation to engage licensed elevator consultant before selecting contractor
8. Consultant referral CTA placeholder: "[Contact ElevatorIQ for vetted consultant referrals]"
9. ${VERBATIM_QUESTIONS}
10. Mandatory Disclaimer: "${VERBATIM_DISCLAIMER}"

OUTPUT FORMAT: Plain text, professional, no markdown, □ and [ ] for checkboxes.`;
  }

  if (outputPath === 'modernization_readiness_guide') {
    return `Generate a Modernization Readiness Guide — an educational guidance document for an owner who is unsure what scope of modernization they need. This is NOT a Bid Framework.

INTAKE DATA:
${JSON.stringify(universalIntake, null, 2)}
${JSON.stringify(workTypeIntake, null, 2)}

ACTIVE FLAGS: ${activeFlagsList}

SECTION 1 — WHAT YOU TOLD US
Summarize the owner's situation in plain language, specific to their inputs. Reflect back what ElevatorIQ understands about their equipment, building, and project drivers. Be specific, not generic.

SECTION 2 — WHAT THIS TYPICALLY MEANS
Based on equipment age (${workTypeIntake?.installation_year || 'unknown'}) and condition (${workTypeIntake?.current_condition || 'unknown'}) and drivers (${(workTypeIntake?.modernization_drivers || []).join(', ') || 'unknown'}), describe which modernization category this profile typically falls into. Present as educational context, not a recommendation.
Always include all three approaches:
- Extend Useful Life (typical profile: under 20 years, aging but functional, cost control focus)
- Partial Modernization (typical profile: 20-30 years, specific component failures, core systems sound)
- Full Modernization (typical profile: over 30 years, multiple failures, frequent breakdowns or lender requirements)
Use framing: "Systems with these characteristics are often candidates for [approach] because [reason]."
NOTE at end: "This is educational context based on general industry patterns, not a recommendation. A licensed consultant should assess your specific equipment before you commit to a scope direction."

SECTION 3 — BEFORE YOU SOLICIT BIDS
Insert verbatim:
${VERBATIM_BEFORE_BIDS}
[Contact ElevatorIQ for vetted consultant referrals in your area]

SECTION 4 — IF YOU CHOOSE TO PROCEED WITHOUT A CONSULTANT
Add header: "NOTE: The following framework was generated without an independent professional assessment. Scope accuracy may be limited."
Then generate a standard Modernization Bid Framework with escalated disclaimer language based on the intake data.
${flagCallouts || ''}

SECTION 5 — QUESTIONS TO ASK EVERY CONTRACTOR
${VERBATIM_QUESTIONS}

MANDATORY DISCLAIMER:
"${VERBATIM_DISCLAIMER}"

OUTPUT FORMAT: Plain text, professional, clear section headers with ═══ separators, no markdown.`;
  }

  return `Generate a scope generator output for work type: ${workType}, output path: ${outputPath}. Intake: ${JSON.stringify(universalIntake)}`;
}

function buildFlagCalloutText(flags) {
  const lines = [];
  if (flags.consultant_flag) {
    lines.push('NO CONSULTANT FLAG: No licensed elevator consultant has been engaged for this project. ElevatorIQ strongly recommends independent professional assessment before final contractor selection, particularly for projects exceeding $25,000 or involving safety-critical components.');
  }
  if (flags.proprietary_flag) {
    lines.push('PROPRIETARY COMPONENT FLAG: One or more components identified may be proprietary to your current service provider. This may limit the ability to obtain competing bids without additional retrofit costs. Contractors must disclose in their proposals whether any proposed components are proprietary and the impact on future service flexibility.');
  }
  if (flags.prevailing_wage_flag) {
    lines.push('PREVAILING WAGE FLAG: If this project is subject to prevailing wage or union labor requirements, confirm compliance obligations with your contractor before award. Significant cost variance between bids may reflect differing assumptions about labor classification.');
  }
  if (flags.phasing_flag) {
    lines.push('PHASING FLAG: Phased modernization affects scheduling, cost, and contractor coordination. Contractors should provide phase-specific pricing, timelines, and interim operational plans in their proposals.');
  }
  if (flags.response_time_premium) {
    lines.push('RESPONSE TIME PREMIUM FLAG: The response time commitment requested may carry a cost premium. Contractors should confirm availability and disclose pricing impact for the requested response tier.');
  }
  if (flags.shutdown_flag) {
    lines.push('SHUTDOWN + CONTRACT FLAG: If your elevator is under an active maintenance contract, review your agreement regarding repair obligations and contractor exclusivity before soliciting outside bids.');
  }
  return lines.join('\n\n');
}

/**
 * Post-generation validation — checks for prohibited terms, required sections.
 * Returns { valid: bool, issues: string[] }
 */
function validateOutput(text) {
  const issues = [];
  const prohibited = ['specification', ' specs ', 'engineering recommendation', 'we recommend', 'ElevatorIQ recommends', 'must install', 'must replace', 'required installation'];
  const required = ['Document Purpose Statement', 'CONTRACTOR DETERMINATION REQUIRED', 'STANDARDIZED RESPONSE REQUIREMENTS', 'Disclaimer', 'QUESTIONS TO ASK EVERY CONTRACTOR'];

  prohibited.forEach((term) => {
    if (text.toLowerCase().includes(term.toLowerCase())) {
      issues.push(`Prohibited term found: "${term}"`);
    }
  });

  required.forEach((section) => {
    if (!text.toLowerCase().includes(section.toLowerCase())) {
      issues.push(`Required section missing: "${section}"`);
    }
  });

  return { valid: issues.length === 0, issues };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/scope-generator/sessions
 * Create a new scope generator session.
 */
router.post('/sessions', async (req, res) => {
  const { work_type, bid_review_id = null } = req.body;

  const validWorkTypes = ['maintenance', 'repair', 'modernization', 'new_installation'];
  if (!validWorkTypes.includes(work_type)) {
    return res.status(400).json({ error: 'Invalid work_type. Must be one of: ' + validWorkTypes.join(', ') });
  }

  try {
    const ip = getClientIp(req);
    const result = await db.query(
      `INSERT INTO scope_sessions (work_type, bid_review_id, ip_address)
       VALUES ($1, $2, $3)
       RETURNING id, work_type, status, created_at`,
      [work_type, bid_review_id, ip]
    );
    const session = result.rows[0];

    // Pre-populate from bid review if available
    let prePopulatedData = null;
    if (bid_review_id) {
      try {
        const caseResult = await db.query(
          `SELECT metadata FROM cases WHERE id = $1`,
          [bid_review_id]
        );
        if (caseResult.rows[0]?.metadata) {
          const meta = caseResult.rows[0].metadata;
          prePopulatedData = {
            building_type: meta.building_type || null,
            elevator_type: meta.elevator_type || null,
            floor_count: meta.floor_count || null,
            installation_year: meta.equipment_age || null,
            primary_issue: meta.known_issues || null,
          };
        }
      } catch (e) {
        // Pre-population is best-effort; don't fail the session creation
        console.warn('[ScopeGenerator] Could not fetch bid review data for pre-population:', e.message);
      }
    }

    res.json({
      session_id: session.id,
      work_type: session.work_type,
      pre_populated_data: prePopulatedData,
    });
  } catch (err) {
    console.error('[ScopeGenerator] Create session error:', err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

/**
 * POST /api/v1/scope-generator/sessions/:id/intake/universal
 * Save universal intake data (upsert).
 */
router.post('/sessions/:id/intake/universal', async (req, res) => {
  const { id } = req.params;
  const intake = req.body;

  if (!intake.building_address) {
    return res.status(400).json({ error: 'building_address is required' });
  }

  try {
    await db.query(
      `INSERT INTO scope_intake_universal (
        session_id, building_name, building_address, building_type,
        floor_count, elevator_count, operational_status,
        elevator_type, installation_year, active_contract, open_violations,
        project_drivers, consultant_involved, desired_timeline, budget_range
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (session_id) DO UPDATE SET
        building_name = EXCLUDED.building_name,
        building_address = EXCLUDED.building_address,
        building_type = EXCLUDED.building_type,
        floor_count = EXCLUDED.floor_count,
        elevator_count = EXCLUDED.elevator_count,
        operational_status = EXCLUDED.operational_status,
        elevator_type = EXCLUDED.elevator_type,
        installation_year = EXCLUDED.installation_year,
        active_contract = EXCLUDED.active_contract,
        open_violations = EXCLUDED.open_violations,
        project_drivers = EXCLUDED.project_drivers,
        consultant_involved = EXCLUDED.consultant_involved,
        desired_timeline = EXCLUDED.desired_timeline,
        budget_range = EXCLUDED.budget_range,
        updated_at = now()`,
      [
        id,
        intake.building_name || null,
        intake.building_address,
        intake.building_type || null,
        intake.floor_count || null,
        intake.elevator_count || null,
        intake.operational_status || null,
        intake.elevator_type || null,
        intake.installation_year || null,
        intake.active_contract || null,
        intake.open_violations || null,
        intake.project_drivers || null,
        intake.consultant_involved || null,
        intake.desired_timeline || null,
        intake.budget_range || null,
      ]
    );

    const consultantFlag = intake.consultant_involved === 'No';
    res.json({ session_id: id, consultant_flag: consultantFlag, saved: true });
  } catch (err) {
    console.error('[ScopeGenerator] Save universal intake error:', err);
    res.status(500).json({ error: 'Failed to save universal intake' });
  }
});

/**
 * POST /api/v1/scope-generator/sessions/:id/intake/:work_type
 * Save work-type specific intake data.
 */
router.post('/sessions/:id/intake/:work_type', async (req, res) => {
  const { id, work_type } = req.params;
  const intake = req.body;

  try {
    // Fetch universal intake to compute flags
    const univResult = await db.query(
      'SELECT * FROM scope_intake_universal WHERE session_id = $1',
      [id]
    );
    const universalIntake = univResult.rows[0] || {};
    const flags = buildFlags(universalIntake, intake, work_type);
    const outputPath = deriveOutputPath(work_type, intake);

    if (work_type === 'maintenance') {
      await db.query(
        `INSERT INTO scope_intake_maintenance (
          session_id, contract_status, coverage_level, contract_expiration, bid_reason,
          service_calls_12mo, recurring_issues, last_major_repair,
          contract_length, response_time, after_hours_coverage, entrapment_response
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (session_id) DO UPDATE SET
          contract_status = EXCLUDED.contract_status,
          coverage_level = EXCLUDED.coverage_level,
          contract_expiration = EXCLUDED.contract_expiration,
          bid_reason = EXCLUDED.bid_reason,
          service_calls_12mo = EXCLUDED.service_calls_12mo,
          recurring_issues = EXCLUDED.recurring_issues,
          last_major_repair = EXCLUDED.last_major_repair,
          contract_length = EXCLUDED.contract_length,
          response_time = EXCLUDED.response_time,
          after_hours_coverage = EXCLUDED.after_hours_coverage,
          entrapment_response = EXCLUDED.entrapment_response,
          updated_at = now()`,
        [
          id,
          intake.contract_status || null,
          intake.coverage_level || null,
          intake.contract_expiration || null,
          intake.bid_reason || null,
          intake.service_calls_12mo || null,
          intake.recurring_issues || null,
          intake.last_major_repair || null,
          intake.contract_length || null,
          intake.response_time || null,
          intake.after_hours_coverage || null,
          intake.entrapment_response || null,
        ]
      );
    } else if (work_type === 'repair') {
      const scopeKnown = intake.scope_known === true || intake.scope_known === 'true';
      await db.query(
        `INSERT INTO scope_intake_repair (
          session_id, primary_issue, issue_duration, operational_status, contractor_assessed,
          scope_known, components_needing_repair, proprietary_component,
          active_maintenance_contract, open_to_assessment,
          code_violation, urgency_deadline, budget_range, bids_sought, shutdown_flag
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (session_id) DO UPDATE SET
          primary_issue = EXCLUDED.primary_issue,
          issue_duration = EXCLUDED.issue_duration,
          operational_status = EXCLUDED.operational_status,
          contractor_assessed = EXCLUDED.contractor_assessed,
          scope_known = EXCLUDED.scope_known,
          components_needing_repair = EXCLUDED.components_needing_repair,
          proprietary_component = EXCLUDED.proprietary_component,
          active_maintenance_contract = EXCLUDED.active_maintenance_contract,
          open_to_assessment = EXCLUDED.open_to_assessment,
          code_violation = EXCLUDED.code_violation,
          urgency_deadline = EXCLUDED.urgency_deadline,
          budget_range = EXCLUDED.budget_range,
          bids_sought = EXCLUDED.bids_sought,
          shutdown_flag = EXCLUDED.shutdown_flag,
          updated_at = now()`,
        [
          id,
          intake.primary_issue || null,
          intake.issue_duration || null,
          intake.operational_status || null,
          intake.contractor_assessed || null,
          scopeKnown,
          intake.components_needing_repair || null,
          intake.proprietary_component || null,
          intake.active_maintenance_contract || null,
          intake.open_to_assessment || null,
          intake.code_violation || null,
          intake.urgency_deadline || null,
          intake.budget_range || null,
          intake.bids_sought || null,
          flags.shutdown_flag,
        ]
      );
    } else if (work_type === 'modernization') {
      await db.query(
        `INSERT INTO scope_intake_modernization (
          session_id, system_type, installation_year, current_condition, prior_assessment,
          ada_issues, modernization_drivers, scope_preference, components_checklist,
          system_type_preference, occupied_during_construction, phased_approach,
          backup_elevator, access_restrictions, permits_pulled, compliance_deadline,
          budget_range, funding_source, prevailing_wage
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        ON CONFLICT (session_id) DO UPDATE SET
          system_type = EXCLUDED.system_type,
          installation_year = EXCLUDED.installation_year,
          current_condition = EXCLUDED.current_condition,
          prior_assessment = EXCLUDED.prior_assessment,
          ada_issues = EXCLUDED.ada_issues,
          modernization_drivers = EXCLUDED.modernization_drivers,
          scope_preference = EXCLUDED.scope_preference,
          components_checklist = EXCLUDED.components_checklist,
          system_type_preference = EXCLUDED.system_type_preference,
          occupied_during_construction = EXCLUDED.occupied_during_construction,
          phased_approach = EXCLUDED.phased_approach,
          backup_elevator = EXCLUDED.backup_elevator,
          access_restrictions = EXCLUDED.access_restrictions,
          permits_pulled = EXCLUDED.permits_pulled,
          compliance_deadline = EXCLUDED.compliance_deadline,
          budget_range = EXCLUDED.budget_range,
          funding_source = EXCLUDED.funding_source,
          prevailing_wage = EXCLUDED.prevailing_wage,
          updated_at = now()`,
        [
          id,
          intake.system_type || null,
          intake.installation_year || null,
          intake.current_condition || null,
          intake.prior_assessment || null,
          intake.ada_issues || null,
          intake.modernization_drivers || null,
          intake.scope_preference || null,
          intake.components_checklist || null,
          intake.system_type_preference || null,
          intake.occupied_during_construction || null,
          intake.phased_approach || null,
          intake.backup_elevator || null,
          intake.access_restrictions || null,
          intake.permits_pulled || null,
          intake.compliance_deadline || null,
          intake.budget_range || null,
          intake.funding_source || null,
          intake.prevailing_wage || null,
        ]
      );
    } else if (work_type === 'new_installation') {
      await db.query(
        `INSERT INTO scope_intake_new_installation (
          session_id, contact_name, contact_email, project_type,
          estimated_timeline, project_description, notify_when_ready
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (session_id) DO UPDATE SET
          contact_name = EXCLUDED.contact_name,
          contact_email = EXCLUDED.contact_email,
          project_type = EXCLUDED.project_type,
          estimated_timeline = EXCLUDED.estimated_timeline,
          project_description = EXCLUDED.project_description`,
        [
          id,
          intake.contact_name || null,
          intake.contact_email,
          intake.project_type || null,
          intake.estimated_timeline || null,
          intake.project_description || null,
          true,
        ]
      );
    }

    // Update session output_path
    await db.query(
      `UPDATE scope_sessions SET output_path = $1 WHERE id = $2`,
      [outputPath, id]
    );

    res.json({
      session_id: id,
      routing: { output_path: outputPath, flags },
      saved: true,
    });
  } catch (err) {
    console.error('[ScopeGenerator] Save work-type intake error:', err);
    res.status(500).json({ error: 'Failed to save work-type intake' });
  }
});

/**
 * POST /api/v1/scope-generator/sessions/:id/generate
 * Trigger AI document generation using assembled intake data.
 */
router.post('/sessions/:id/generate', async (req, res) => {
  const { id } = req.params;
  const ip = getClientIp(req);

  try {
    // Fetch session
    const sessionResult = await db.query('SELECT * FROM scope_sessions WHERE id = $1', [id]);
    if (!sessionResult.rows.length) return res.status(404).json({ error: 'Session not found' });
    const session = sessionResult.rows[0];

    // Fetch universal intake
    const univResult = await db.query('SELECT * FROM scope_intake_universal WHERE session_id = $1', [id]);
    const universalIntake = univResult.rows[0];
    if (!universalIntake) return res.status(400).json({ error: 'Universal intake not completed' });

    // Fetch work-type intake
    const tableMap = {
      maintenance: 'scope_intake_maintenance',
      repair: 'scope_intake_repair',
      modernization: 'scope_intake_modernization',
      new_installation: 'scope_intake_new_installation',
    };
    const workTypeResult = await db.query(
      `SELECT * FROM ${tableMap[session.work_type]} WHERE session_id = $1`,
      [id]
    );
    const workTypeIntake = workTypeResult.rows[0] || {};

    // Handle coming_soon_capture path — no AI generation needed
    if (session.output_path === 'coming_soon_capture') {
      await db.query(
        `UPDATE scope_sessions SET status = 'complete', completed_at = now() WHERE id = $1`,
        [id]
      );
      return res.json({
        output_id: null,
        framework_id: null,
        output_path: 'coming_soon_capture',
        document_text: null,
        preview_available: false,
        acknowledgment_required: false,
        message: 'New Installation support is coming soon. You have been added to the notification list.',
      });
    }

    const flags = buildFlags(universalIntake, workTypeIntake, session.work_type);
    const outputPath = session.output_path || deriveOutputPath(session.work_type, workTypeIntake);
    const userPrompt = buildUserPrompt(session.work_type, outputPath, universalIntake, workTypeIntake, flags);

    // Call Claude
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      system: SYSTEM_PROMPT,
    });

    let documentText = response.content[0]?.text || '';

    // Post-generation validation
    const validation = validateOutput(documentText);
    if (!validation.valid) {
      console.warn('[ScopeGenerator] Validation issues:', validation.issues);
      // Log but don't fail — surface to output metadata
    }

    const frameworkId = await generateFrameworkId();
    const intakeSnapshot = { universal: universalIntake, work_type: workTypeIntake, flags };

    // Save output
    const outputResult = await db.query(
      `INSERT INTO scope_outputs (
        session_id, output_path, document_text, framework_id,
        intake_snapshot, prompt_version, ip_address
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, framework_id`,
      [id, outputPath, documentText, frameworkId, JSON.stringify(intakeSnapshot), 'v1.0', ip]
    );
    const output = outputResult.rows[0];

    // Mark session complete
    await db.query(
      `UPDATE scope_sessions SET status = 'complete', completed_at = now(), output_path = $1 WHERE id = $2`,
      [outputPath, id]
    );

    // Create consultant referral record if applicable
    const needsReferral = outputPath === 'rfi_document' ||
      outputPath === 'modernization_readiness_guide' ||
      flags.consultant_flag;

    if (needsReferral) {
      const triggerReason = outputPath === 'rfi_document' ? 'unknown_scope'
        : outputPath === 'modernization_readiness_guide' ? 'not_sure_modernization'
        : 'no_consultant';
      await db.query(
        `INSERT INTO scope_consultant_referrals (session_id, output_id, trigger_reason)
         VALUES ($1, $2, $3)`,
        [id, output.id, triggerReason]
      );
    }

    res.json({
      output_id: output.id,
      framework_id: output.framework_id,
      output_path: outputPath,
      document_text: documentText,
      preview_available: true,
      acknowledgment_required: true,
      flags,
      validation_issues: validation.valid ? [] : validation.issues,
    });
  } catch (err) {
    console.error('[ScopeGenerator] Generate error:', err);
    res.status(500).json({ error: 'Document generation failed', details: err.message });
  }
});

/**
 * POST /api/v1/scope-generator/sessions/:id/outputs/:oid/acknowledge
 * Record user acknowledgment — enables download.
 */
router.post('/sessions/:id/outputs/:oid/acknowledge', async (req, res) => {
  const { id, oid } = req.params;
  const { acknowledgments = {} } = req.body;

  const allChecked =
    acknowledgments.is_procurement_tool === true &&
    acknowledgments.contractor_responsibility === true &&
    acknowledgments.not_engineer_of_record === true;

  if (!allChecked) {
    return res.status(400).json({ error: 'All three acknowledgments must be confirmed' });
  }

  try {
    await db.query(
      `UPDATE scope_outputs
       SET acknowledgment_confirmed = true, acknowledgment_timestamp = now()
       WHERE id = $1 AND session_id = $2`,
      [oid, id]
    );

    res.json({ acknowledged: true, download_enabled: true });
  } catch (err) {
    console.error('[ScopeGenerator] Acknowledge error:', err);
    res.status(500).json({ error: 'Failed to record acknowledgment' });
  }
});

/**
 * GET /api/v1/scope-generator/sessions/:id/outputs/:oid/download
 * Download branded PDF (default) or plain text. Returns 403 if not acknowledged.
 */
router.get('/sessions/:id/outputs/:oid/download', async (req, res) => {
  const { id, oid } = req.params;
  const format = req.query.format || 'pdf';

  try {
    // Fetch output + session + universal intake for property info
    const result = await db.query(
      `SELECT o.document_text, o.framework_id, o.acknowledgment_confirmed, o.output_path,
              s.work_type,
              u.building_name, u.building_address
       FROM scope_outputs o
       JOIN scope_sessions s ON s.id = o.session_id
       LEFT JOIN scope_intake_universal u ON u.session_id = o.session_id
       WHERE o.id = $1 AND o.session_id = $2`,
      [oid, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Output not found' });
    const output = result.rows[0];

    if (!output.acknowledgment_confirmed) {
      return res.status(403).json({ error: 'Acknowledgment required before download' });
    }

    const property = [output.building_name, output.building_address].filter(Boolean).join(' — ') || 'Property';

    if (format === 'txt') {
      const filename = `ElevatorIQ_${output.framework_id}_Bid_Framework.txt`;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(output.document_text);
    }

    // Default: branded PDF
    console.log(`[ScopeGenerator] Generating PDF for ${output.framework_id}...`);
    const pdfBuffer = await generateScopePDF(
      output.document_text,
      output.work_type,
      output.output_path,
      output.framework_id,
      property
    );

    const filename = `ElevatorIQ_${output.framework_id}_Bid_Framework.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);

  } catch (err) {
    console.error('[ScopeGenerator] Download error:', err);
    res.status(500).json({ error: 'Download failed', details: err.message });
  }
});

/**
 * POST /api/v1/scope-generator/sessions/:id/referral
 * Log consultant referral click.
 */
router.post('/sessions/:id/referral', async (req, res) => {
  const { id } = req.params;
  const { output_id = null, trigger_reason = 'unknown' } = req.body;

  try {
    await db.query(
      `UPDATE scope_consultant_referrals
       SET referral_clicked = true, clicked_at = now()
       WHERE session_id = $1 AND (output_id = $2 OR $2 IS NULL)`,
      [id, output_id]
    );
    res.json({ logged: true });
  } catch (err) {
    console.error('[ScopeGenerator] Referral log error:', err);
    res.json({ logged: false }); // Non-critical; don't surface error to user
  }
});

/**
 * GET /api/v1/scope-generator/sessions/:id
 * Get full session state.
 */
router.get('/sessions/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const sessionResult = await db.query('SELECT * FROM scope_sessions WHERE id = $1', [id]);
    if (!sessionResult.rows.length) return res.status(404).json({ error: 'Session not found' });
    const session = sessionResult.rows[0];

    const univResult = await db.query('SELECT * FROM scope_intake_universal WHERE session_id = $1', [id]);
    const outputResult = await db.query(
      'SELECT id, framework_id, output_path, acknowledgment_confirmed, generated_at FROM scope_outputs WHERE session_id = $1 ORDER BY generated_at DESC LIMIT 1',
      [id]
    );

    res.json({
      session,
      universal_intake: univResult.rows[0] || null,
      latest_output: outputResult.rows[0] || null,
    });
  } catch (err) {
    console.error('[ScopeGenerator] Get session error:', err);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

module.exports = router;
