-- Migration 007: Add ElevatorIQ Score to cases
-- The score (0-100) is computed by Claude during analysis and persisted here
-- for fast retrieval without re-parsing the extraction JSON.
ALTER TABLE cases ADD COLUMN IF NOT EXISTS elevatoriq_score INTEGER;
