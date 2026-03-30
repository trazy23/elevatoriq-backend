-- ============================================================
-- ElevatorIQ — Nurture Email Sequence Migration
-- Track scheduled and sent nurture emails for free-tier users
-- ============================================================

CREATE TABLE IF NOT EXISTS nurture_emails (
  id                     SERIAL PRIMARY KEY,
  case_id                UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  customer_email         TEXT NOT NULL,
  customer_name          TEXT,
  email_type             TEXT NOT NULL CHECK (email_type IN ('nurture_1', 'nurture_2', 'nurture_3')),
  scheduled_for          TIMESTAMPTZ NOT NULL,
  sent_at                TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nurture_emails_case_id
  ON nurture_emails(case_id);
CREATE INDEX IF NOT EXISTS idx_nurture_emails_email
  ON nurture_emails(customer_email);
CREATE INDEX IF NOT EXISTS idx_nurture_emails_scheduled
  ON nurture_emails(scheduled_for) WHERE sent_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_nurture_emails_type
  ON nurture_emails(email_type);
