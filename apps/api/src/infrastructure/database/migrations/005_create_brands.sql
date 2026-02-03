-- Migration: 005_create_brands
-- Description: Create brands table with fuzzy search support
-- Created: 2026-02-01

CREATE TABLE brands (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Brand info
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  logo_url VARCHAR(500),

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes
CREATE INDEX idx_brands_slug ON brands(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_brands_active ON brands(is_active) WHERE deleted_at IS NULL;

-- Create trigram index for fuzzy search on name
CREATE INDEX idx_brands_name_trgm ON brands USING gin(name gin_trgm_ops) WHERE deleted_at IS NULL;

-- Apply updated_at trigger
CREATE TRIGGER update_brands_updated_at
  BEFORE UPDATE ON brands
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Rollback SQL (commented for reference)
-- DROP TRIGGER IF EXISTS update_brands_updated_at ON brands;
-- DROP TABLE IF EXISTS brands CASCADE;
