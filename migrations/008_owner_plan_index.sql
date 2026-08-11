-- Migration 008: Add index to support monthly included-review cap queries
-- The getAccessLevel function queries cases by customer_email + payment_status + created_at (month)
-- This index makes that query fast even at scale.

CREATE INDEX IF NOT EXISTS idx_cases_email_status_created
  ON cases (customer_email, payment_status, created_at);
