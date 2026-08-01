-- 013: Contract-aware Portfolio Watch V1
-- Local/draft migration. Do not run in production without Trey approval.

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'pm_firm'
    CHECK (type IN ('pm_firm', 'owner', 'hoa_condo', 'institution', 'other')),
  billing_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (billing_status IN ('draft', 'trial', 'active', 'paused', 'cancelled')),
  plan TEXT NOT NULL DEFAULT 'portfolio_watch',
  prepaid_through TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  building_type TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_properties_org ON properties(org_id);

CREATE TABLE IF NOT EXISTS elevator_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  unit_type TEXT NOT NULL DEFAULT 'passenger'
    CHECK (unit_type IN ('passenger', 'freight', 'escalator', 'moving_walk', 'dumbwaiter', 'lift')),
  manufacturer TEXT,
  model TEXT,
  controller_type TEXT,
  drive_type TEXT CHECK (drive_type IS NULL OR drive_type IN ('hydraulic', 'traction', 'mrl', 'unknown')),
  install_year INTEGER,
  last_mod_year INTEGER,
  capacity_lbs INTEGER,
  speed_fpm INTEGER,
  floors_served TEXT,
  enrolled BOOLEAN NOT NULL DEFAULT TRUE,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_elevator_units_property ON elevator_units(property_id);
CREATE INDEX IF NOT EXISTS idx_elevator_units_enrolled ON elevator_units(enrolled);

CREATE TABLE IF NOT EXISTS portfolio_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  vendor TEXT,
  source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  monthly_price NUMERIC(12,2),
  annual_price NUMERIC(12,2),
  start_date DATE,
  end_date DATE,
  auto_renew BOOLEAN,
  renewal_term_months INTEGER,
  cancellation_notice_days INTEGER,
  cancellation_deadline DATE,
  coverage_level TEXT,
  escalation_terms TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'superseded', 'expired', 'draft')),
  supersedes_contract_id UUID REFERENCES portfolio_contracts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portfolio_contracts_property ON portfolio_contracts(property_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_contracts_status ON portfolio_contracts(status);
CREATE INDEX IF NOT EXISTS idx_portfolio_contracts_deadline ON portfolio_contracts(cancellation_deadline);

CREATE TABLE IF NOT EXISTS contract_units (
  contract_id UUID NOT NULL REFERENCES portfolio_contracts(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES elevator_units(id) ON DELETE CASCADE,
  PRIMARY KEY (contract_id, unit_id)
);
CREATE INDEX IF NOT EXISTS idx_contract_units_unit ON contract_units(unit_id);

CREATE TABLE IF NOT EXISTS extracted_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES portfolio_contracts(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_value TEXT,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.500 CHECK (confidence >= 0 AND confidence <= 1),
  source_page TEXT,
  source_snippet TEXT NOT NULL,
  user_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  user_corrected_value TEXT,
  corrected_at TIMESTAMPTZ,
  corrected_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_extracted_facts_contract ON extracted_facts(contract_id);
CREATE INDEX IF NOT EXISTS idx_extracted_facts_field ON extracted_facts(field_name);

CREATE TABLE IF NOT EXISTS portfolio_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES elevator_units(id) ON DELETE SET NULL,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  review_type TEXT NOT NULL CHECK (review_type IN ('repair_quote', 'invoice_check', 'contract_review', 'renewal_notice', 'mod_bid', 'other')),
  decision_status TEXT NOT NULL CHECK (decision_status IN ('green', 'yellow', 'red')),
  one_line_why TEXT,
  summary TEXT,
  next_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_information JSONB NOT NULL DEFAULT '[]'::jsonb,
  what_to_upload_next JSONB NOT NULL DEFAULT '[]'::jsonb,
  rulebook_version TEXT NOT NULL DEFAULT 'contract-aware-v1',
  review_prompt_version TEXT NOT NULL DEFAULT 'contract-aware-v1',
  escalated BOOLEAN NOT NULL DEFAULT FALSE,
  escalation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portfolio_reviews_org ON portfolio_reviews(org_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_reviews_property ON portfolio_reviews(property_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_reviews_unit ON portfolio_reviews(unit_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_reviews_status ON portfolio_reviews(decision_status);

CREATE TABLE IF NOT EXISTS portfolio_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES portfolio_reviews(id) ON DELETE CASCADE,
  severity TEXT NOT NULL CHECK (severity IN ('high', 'medium', 'low', 'info')),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  contract_reference TEXT,
  dollar_estimate NUMERIC(12,2),
  source_snippet TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portfolio_findings_review ON portfolio_findings(review_id);

CREATE TABLE IF NOT EXISTS vendor_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES portfolio_reviews(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_by_user BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portfolio_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES portfolio_contracts(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('cancellation_deadline_120', 'cancellation_deadline_90', 'cancellation_deadline_60', 'cancellation_deadline_30', 'confirmation_needed')),
  trigger_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'acknowledged', 'cancelled')),
  source_snippet TEXT NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portfolio_alerts_org ON portfolio_alerts(org_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_alerts_trigger ON portfolio_alerts(trigger_date, status);
