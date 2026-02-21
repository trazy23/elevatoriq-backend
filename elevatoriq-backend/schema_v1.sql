-- ElevatorIQ schema_v1.sql
-- PostgreSQL — 10 Tables — v1.1

-- customers: User accounts and plan tier
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    company TEXT,
    plan_tier TEXT NOT NULL DEFAULT 'free',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- cases: One analysis session per upload batch
CREATE TABLE cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id),
    review_type TEXT NOT NULL,
    module TEXT NOT NULL,
    state TEXT,
    market TEXT,
    equipment_type TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    customer_email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
CREATE INDEX idx_cases_status ON cases(status);
CREATE INDEX idx_cases_customer ON cases(customer_id);

-- documents: Each uploaded file linked to a case
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_type TEXT,
    storage_path TEXT NOT NULL,
    auto_detected BOOLEAN NOT NULL DEFAULT FALSE,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_documents_case ON documents(case_id);

-- reports: Generated PDF metadata and download tokens
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id),
    storage_path TEXT NOT NULL,
    download_token UUID NOT NULL DEFAULT gen_random_uuid(),
    token_expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
    emailed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_reports_token ON reports(download_token);
CREATE INDEX idx_reports_case ON reports(case_id);

-- extractions_raw: Append-only immutable audit trail
CREATE TABLE extractions_raw (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id),
    module TEXT NOT NULL,
    state TEXT,
    market TEXT,
    equipment_type TEXT,
    contract_type TEXT,
    unit_count INTEGER,
    confidence_overall TEXT,
    benchmark_version TEXT,
    raw_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Immutability rules
CREATE RULE no_update_extractions AS
    ON UPDATE TO extractions_raw DO INSTEAD NOTHING;
CREATE RULE no_delete_extractions AS
    ON DELETE TO extractions_raw DO INSTEAD NOTHING;

CREATE INDEX idx_extractions_case ON extractions_raw(case_id);
CREATE INDEX idx_extractions_module ON extractions_raw(module);
CREATE INDEX idx_extractions_market ON extractions_raw(state, market);

-- facts_labor: Normalized labor rate data points for aggregation
CREATE TABLE facts_labor (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    extraction_id UUID NOT NULL REFERENCES extractions_raw(id),
    state TEXT NOT NULL,
    market TEXT NOT NULL,
    equipment_type TEXT NOT NULL,
    contract_type TEXT,
    rate_regular NUMERIC(10,2),
    rate_overtime NUMERIC(10,2),
    overtime_multiplier NUMERIC(5,2),
    travel_minimum_hours NUMERIC(5,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_labor_market ON facts_labor(state, market, equipment_type);

-- facts_line_items: Invoice line items with taxonomy — Module A
CREATE TABLE facts_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    extraction_id UUID NOT NULL REFERENCES extractions_raw(id),
    taxonomy_category TEXT NOT NULL,
    description_normalized TEXT,
    amount_billed NUMERIC(12,2),
    labor_hours NUMERIC(8,2),
    scope_flag TEXT,
    billing_flag TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_line_items_taxonomy ON facts_line_items(taxonomy_category);

-- facts_parts: Parts and material cost data — Modules A/B
CREATE TABLE facts_parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    extraction_id UUID NOT NULL REFERENCES extractions_raw(id),
    taxonomy_category TEXT NOT NULL,
    equipment_type TEXT NOT NULL,
    part_cost NUMERIC(12,2),
    material_markup_percent NUMERIC(6,2),
    parts_coverage_type TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_parts_taxonomy ON facts_parts(taxonomy_category, equipment_type);

-- facts_contract_terms: Commercial terms — Modules B/C
CREATE TABLE facts_contract_terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    extraction_id UUID NOT NULL REFERENCES extractions_raw(id),
    state TEXT NOT NULL,
    market TEXT NOT NULL,
    equipment_type TEXT NOT NULL,
    contract_type TEXT,
    base_price_per_unit NUMERIC(12,2),
    term_years NUMERIC(4,1),
    auto_renew_flag BOOLEAN,
    escalation_type TEXT,
    escalation_percent NUMERIC(6,3),
    warranty_months INTEGER,
    pm_frequency_per_year INTEGER,
    after_hours_policy TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_contract_market ON facts_contract_terms(state, market, equipment_type);

-- benchmarks: Versioned aggregated intelligence — the flywheel output
CREATE TABLE benchmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    benchmark_version TEXT NOT NULL,
    dimension TEXT NOT NULL,
    state TEXT NOT NULL,
    market TEXT NOT NULL,
    equipment_type TEXT NOT NULL,
    contract_type TEXT,
    sample_size INTEGER NOT NULL,
    median_value NUMERIC(12,4),
    p25_value NUMERIC(12,4),
    p75_value NUMERIC(12,4),
    mean_value NUMERIC(12,4),
    stddev_value NUMERIC(12,4),
    published BOOLEAN NOT NULL DEFAULT FALSE,
    aggregated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_benchmarks_lookup
    ON benchmarks(state, market, equipment_type, dimension, published);
CREATE INDEX idx_benchmarks_version ON benchmarks(benchmark_version);
