-- Migration: 012_create_shipping_tables
-- Description: Create shipping zones and postcode tables
-- Created: 2026-02-01

-- ============================================================================
-- TABLE: shipping_zones
-- ============================================================================
CREATE TABLE shipping_zones (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Zone info
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,

  -- Pricing (in cents)
  base_cost INTEGER NOT NULL CHECK (base_cost >= 0),
  free_shipping_threshold INTEGER NOT NULL DEFAULT 0 CHECK (free_shipping_threshold >= 0),

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes
CREATE INDEX idx_shipping_zones_active ON shipping_zones(is_active) WHERE deleted_at IS NULL;

-- Apply updated_at trigger
CREATE TRIGGER update_shipping_zones_updated_at
  BEFORE UPDATE ON shipping_zones
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: zone_postcodes
-- ============================================================================
CREATE TABLE zone_postcodes (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Foreign key to shipping_zones
  zone_id UUID NOT NULL REFERENCES shipping_zones(id) ON DELETE CASCADE,

  -- Postcode
  postcode VARCHAR(10) NOT NULL,

  -- Exclusion flag (postcode exists but not served)
  is_excluded BOOLEAN NOT NULL DEFAULT false,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Unique constraint: one postcode per zone
  CONSTRAINT unique_zone_postcode UNIQUE (zone_id, postcode)
);

-- Create indexes for fast lookups
CREATE INDEX idx_zone_postcodes_postcode ON zone_postcodes(postcode);
CREATE INDEX idx_zone_postcodes_zone_id ON zone_postcodes(zone_id);
CREATE INDEX idx_zone_postcodes_excluded ON zone_postcodes(is_excluded);

-- Apply updated_at trigger
CREATE TRIGGER update_zone_postcodes_updated_at
  BEFORE UPDATE ON zone_postcodes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Rollback SQL (commented for reference)
-- DROP TRIGGER IF EXISTS update_zone_postcodes_updated_at ON zone_postcodes;
-- DROP TABLE IF EXISTS zone_postcodes CASCADE;
-- DROP TRIGGER IF EXISTS update_shipping_zones_updated_at ON shipping_zones;
-- DROP TABLE IF EXISTS shipping_zones CASCADE;
