-- Migration: Rebuild knowledge table with proper schema
-- Run this in Supabase SQL Editor

DROP TABLE IF EXISTS knowledge;

CREATE TABLE knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  -- Categories: elevator_code, maintenance_standard, safety_standard,
  --             pricing_reference, inspection_requirement, regulatory_note
  content TEXT NOT NULL,
  source_url TEXT,
  equipment_types TEXT[],  -- null = applies to all equipment types
  states TEXT[],           -- null = applies to all states
  tags TEXT[],
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_knowledge_category ON knowledge(category);
CREATE INDEX idx_knowledge_active ON knowledge(active);
CREATE INDEX idx_knowledge_states ON knowledge USING GIN(states);
CREATE INDEX idx_knowledge_equipment ON knowledge USING GIN(equipment_types);
