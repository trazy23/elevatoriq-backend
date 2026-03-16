-- ============================================================
-- ElevatorIQ — Enrich Customers Table
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add profile fields to customers table
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS name         TEXT,
  ADD COLUMN IF NOT EXISTS role         TEXT CHECK (role IN (
                                          'property_manager', 'facilities_director',
                                          'building_owner', 'consultant', 'other'
                                        )),
  ADD COLUMN IF NOT EXISTS phone        TEXT,
  ADD COLUMN IF NOT EXISTS city         TEXT,
  ADD COLUMN IF NOT EXISTS state        TEXT,
  ADD COLUMN IF NOT EXISTS properties_count INTEGER,
  ADD COLUMN IF NOT EXISTS notes        TEXT;   -- internal admin notes

-- 2. Index on role for segmentation queries
CREATE INDEX IF NOT EXISTS idx_customers_role ON customers(role);
CREATE INDEX IF NOT EXISTS idx_customers_state ON customers(state);

-- Verify:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'customers' ORDER BY ordinal_position;
