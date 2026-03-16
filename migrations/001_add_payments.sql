-- ============================================================
-- ElevatorIQ — Payments & Subscriptions Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add payment_status column to cases table
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'free'
  CHECK (payment_status IN ('free', 'pending_payment', 'paid', 'subscribed'));

-- Index for webhook lookups
CREATE INDEX IF NOT EXISTS idx_cases_payment_status ON cases(payment_status);

-- 2. Subscriptions table — tracks active Stripe subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_email         TEXT NOT NULL,
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT UNIQUE,
  plan_type              TEXT NOT NULL CHECK (plan_type IN (
                           'invoice_monitor', 'portfolio_pro', 'portfolio_pro_annual'
                         )),
  status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
                           'active', 'canceled', 'past_due', 'trialing', 'incomplete'
                         )),
  current_period_end     TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_email
  ON subscriptions(customer_email);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub_id
  ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON subscriptions(status);

-- 3. Payments table — tracks individual pay-per-review transactions
CREATE TABLE IF NOT EXISTS payments (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                   UUID REFERENCES cases(id) ON DELETE SET NULL,
  customer_email            TEXT NOT NULL,
  stripe_session_id         TEXT UNIQUE,
  stripe_payment_intent_id  TEXT,
  amount_cents              INTEGER NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                              'pending', 'completed', 'failed', 'refunded'
                            )),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_case_id
  ON payments(case_id);
CREATE INDEX IF NOT EXISTS idx_payments_email
  ON payments(customer_email);
CREATE INDEX IF NOT EXISTS idx_payments_session
  ON payments(stripe_session_id);

-- 4. Add subscription lookup to admin stats (update existing view or just note the tables)
-- The admin route queries cases/customers directly, subscriptions will appear in future analytics

-- Done. Verify:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'cases' AND column_name = 'payment_status';
-- SELECT COUNT(*) FROM subscriptions;
-- SELECT COUNT(*) FROM payments;
