-- 010_fix_subscription_plan_type_check.sql
-- Purpose: align subscriptions.plan_type CHECK constraint with current payment code.
-- Status: DRAFT ONLY. Review and apply manually in production DB after approval.
--
-- Current payment code uses:
--   owner_plan, manager_plan, manager_plan_annual
-- Legacy migration 001_add_payments.sql used:
--   invoice_monitor, portfolio_pro, portfolio_pro_annual
--
-- This migration keeps legacy values temporarily so existing rows do not fail,
-- while allowing the live code values needed by Stripe webhooks.

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname
    INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
  WHERE rel.relname = 'subscriptions'
    AND att.attname = 'plan_type'
    AND con.contype = 'c'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE subscriptions DROP CONSTRAINT %I', constraint_name);
  END IF;

  ALTER TABLE subscriptions
    ADD CONSTRAINT subscriptions_plan_type_check
    CHECK (plan_type IN (
      'owner_plan',
      'manager_plan',
      'manager_plan_annual',
      'invoice_monitor',
      'portfolio_pro',
      'portfolio_pro_annual'
    ));
END $$;

-- Optional later cleanup, after confirming no legacy rows remain:
-- ALTER TABLE subscriptions DROP CONSTRAINT subscriptions_plan_type_check;
-- ALTER TABLE subscriptions
--   ADD CONSTRAINT subscriptions_plan_type_check
--   CHECK (plan_type IN ('owner_plan', 'manager_plan', 'manager_plan_annual'));
