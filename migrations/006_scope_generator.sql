-- Migration 006: Scope Generator Feature
-- ElevatorIQ — Stage 2 Procurement Funnel
-- Run after 005_seed_knowledge_wisconsin.sql

-- ─── Enumerations ─────────────────────────────────────────────────────────────

CREATE TYPE IF NOT EXISTS work_type AS ENUM (
  'maintenance',
  'repair',
  'modernization',
  'new_installation'
);

CREATE TYPE IF NOT EXISTS output_path AS ENUM (
  'bid_framework',
  'rfi_document',
  'modernization_readiness_guide',
  'coming_soon_capture'
);

-- ─── Scope Generator Sessions ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scope_sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID,                                          -- NULL for anonymous (cold start)
  bid_review_id         UUID,                                          -- NULL if cold start; references cases(id) if available
  work_type             work_type NOT NULL,
  output_path           output_path,
  status                TEXT NOT NULL DEFAULT 'in_progress',           -- in_progress / complete / abandoned
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at          TIMESTAMPTZ,
  ip_address            INET
);

CREATE INDEX IF NOT EXISTS scope_sessions_user_idx ON scope_sessions(user_id);
CREATE INDEX IF NOT EXISTS scope_sessions_bid_review_idx ON scope_sessions(bid_review_id);
CREATE INDEX IF NOT EXISTS scope_sessions_status_idx ON scope_sessions(status);

-- ─── Universal Intake ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scope_intake_universal (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID NOT NULL REFERENCES scope_sessions(id) ON DELETE CASCADE,
  -- Building context
  building_name         TEXT,
  building_address      TEXT NOT NULL,
  building_type         TEXT,
  floor_count           INTEGER,
  elevator_count        INTEGER,
  operational_status    TEXT,
  -- Equipment context
  elevator_type         TEXT,
  installation_year     INTEGER,
  active_contract       TEXT,
  open_violations       TEXT,
  -- Project context
  project_drivers       TEXT[],
  consultant_involved   TEXT,
  consultant_flag       BOOLEAN GENERATED ALWAYS AS (consultant_involved = 'No') STORED,
  desired_timeline      TEXT,
  budget_range          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS scope_intake_universal_session_idx ON scope_intake_universal(session_id);

-- ─── Maintenance Intake ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scope_intake_maintenance (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID NOT NULL REFERENCES scope_sessions(id) ON DELETE CASCADE,
  contract_status       TEXT,
  coverage_level        TEXT,
  contract_expiration   DATE,
  bid_reason            TEXT,
  contract_upload_url   TEXT,
  service_calls_12mo    TEXT,
  recurring_issues      TEXT,
  last_major_repair     TEXT,
  contract_length       TEXT,
  response_time         TEXT,
  response_time_premium BOOLEAN GENERATED ALWAYS AS (
    response_time IN ('Within 2 hours — premium', '24/7 including holidays — premium')
  ) STORED,
  after_hours_coverage  TEXT,
  entrapment_response   TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS scope_intake_maintenance_session_idx ON scope_intake_maintenance(session_id);

-- ─── Repair Intake ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scope_intake_repair (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID NOT NULL REFERENCES scope_sessions(id) ON DELETE CASCADE,
  primary_issue         TEXT,
  issue_duration        TEXT,
  operational_status    TEXT,
  contractor_assessed   TEXT,
  existing_proposal_url TEXT,
  scope_known           BOOLEAN,  -- true = known scope (bid framework), false = unknown (RFI)
  -- Known scope fields
  components_needing_repair TEXT[],
  diagnosis_upload_url  TEXT,
  proprietary_component TEXT,
  proprietary_flag      BOOLEAN GENERATED ALWAYS AS (
    proprietary_component IN ('Yes', 'Unknown')
  ) STORED,
  -- Unknown scope fields
  active_maintenance_contract TEXT,
  open_to_assessment    TEXT,
  -- Shared
  code_violation        TEXT,
  urgency_deadline      DATE,
  budget_range          TEXT,
  bids_sought           TEXT,
  shutdown_flag         BOOLEAN,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS scope_intake_repair_session_idx ON scope_intake_repair(session_id);

-- ─── Modernization Intake ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scope_intake_modernization (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID NOT NULL REFERENCES scope_sessions(id) ON DELETE CASCADE,
  system_type           TEXT,
  installation_year     INTEGER,
  current_condition     TEXT,
  prior_assessment      TEXT,
  assessment_upload_url TEXT,
  ada_issues            TEXT,
  modernization_drivers TEXT[],
  scope_preference      TEXT,
  not_sure_flag         BOOLEAN GENERATED ALWAYS AS (scope_preference = 'Not sure — need guidance') STORED,
  components_checklist  TEXT[],
  system_type_preference TEXT,
  occupied_during_construction TEXT,
  phased_approach       TEXT,
  phasing_flag          BOOLEAN GENERATED ALWAYS AS (phased_approach = 'Yes — phased required') STORED,
  backup_elevator       TEXT,
  access_restrictions   TEXT,
  permits_pulled        TEXT,
  compliance_deadline   DATE,
  budget_range          TEXT,
  funding_source        TEXT,
  prevailing_wage       TEXT,
  prevailing_wage_flag  BOOLEAN GENERATED ALWAYS AS (
    prevailing_wage IN ('Yes', 'Unknown')
  ) STORED,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS scope_intake_modernization_session_idx ON scope_intake_modernization(session_id);

-- ─── New Installation Coming Soon Capture ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS scope_intake_new_installation (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID NOT NULL REFERENCES scope_sessions(id) ON DELETE CASCADE,
  contact_name          TEXT,
  contact_email         TEXT NOT NULL,
  project_type          TEXT,
  estimated_timeline    TEXT,
  project_description   TEXT,
  notify_when_ready     BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS scope_intake_new_installation_session_idx ON scope_intake_new_installation(session_id);

-- ─── Generated Output Documents ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scope_outputs (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id                  UUID NOT NULL REFERENCES scope_sessions(id) ON DELETE CASCADE,
  output_path                 output_path NOT NULL,
  document_text               TEXT NOT NULL,
  document_pdf_url            TEXT,
  document_docx_url           TEXT,
  framework_id                TEXT UNIQUE NOT NULL,          -- human-readable ID e.g. EIQ-2026-0042
  acknowledgment_confirmed    BOOLEAN NOT NULL DEFAULT false,
  acknowledgment_timestamp    TIMESTAMPTZ,
  generated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  intake_snapshot             JSONB NOT NULL,
  prompt_version              TEXT NOT NULL DEFAULT 'v1.0',
  ip_address                  INET
);

CREATE INDEX IF NOT EXISTS scope_outputs_session_idx ON scope_outputs(session_id);
CREATE INDEX IF NOT EXISTS scope_outputs_framework_id_idx ON scope_outputs(framework_id);

-- ─── Consultant Referral Tracking ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scope_consultant_referrals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID NOT NULL REFERENCES scope_sessions(id) ON DELETE CASCADE,
  output_id             UUID REFERENCES scope_outputs(id),
  trigger_reason        TEXT,   -- unknown_scope / not_sure_modernization / no_consultant
  referral_clicked      BOOLEAN NOT NULL DEFAULT false,
  clicked_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scope_consultant_referrals_session_idx ON scope_consultant_referrals(session_id);

-- ─── Framework ID Sequence ────────────────────────────────────────────────────
-- Used to generate human-readable EIQ-YYYY-NNNN IDs

CREATE SEQUENCE IF NOT EXISTS scope_framework_seq START 1;
