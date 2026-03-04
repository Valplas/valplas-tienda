-- Migration: 015_create_price_lists
-- Description: Create price_lists table for B2B manual order pricing
-- Created: 2026-03-04

CREATE TABLE price_lists (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  margin     NUMERIC(10, 4) NOT NULL DEFAULT 0,   -- percentage, e.g. 50.0000 = 50%
  discount   NUMERIC(10, 4) NOT NULL DEFAULT 0,   -- stored for future use, not applied in formula
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_price_lists_active ON price_lists(is_active) WHERE deleted_at IS NULL;

CREATE TRIGGER update_price_lists_updated_at
  BEFORE UPDATE ON price_lists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Rollback SQL:
-- DROP TRIGGER IF EXISTS update_price_lists_updated_at ON price_lists;
-- DROP TABLE IF EXISTS price_lists CASCADE;
