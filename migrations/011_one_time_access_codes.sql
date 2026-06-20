-- 011_one_time_access_codes.sql
-- One-time access codes for unlocking ElevatorIQ reports after preview.

CREATE TABLE IF NOT EXISTS access_codes (
  code TEXT PRIMARY KEY,
  label TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  redeemed_at TIMESTAMPTZ,
  redeemed_case_id UUID REFERENCES cases(id),
  redeemed_email TEXT
);

CREATE INDEX IF NOT EXISTS idx_access_codes_redeemed_at ON access_codes(redeemed_at);
CREATE INDEX IF NOT EXISTS idx_access_codes_created_at ON access_codes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_codes_redeemed_case ON access_codes(redeemed_case_id);
