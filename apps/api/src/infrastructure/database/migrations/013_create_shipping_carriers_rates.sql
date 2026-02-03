-- Migration: 013_create_shipping_carriers_rates
-- Description: Create shipping carriers and rates tables
-- Created: 2026-02-03

-- ============================================================================
-- TABLE: shipping_carriers
-- ============================================================================
CREATE TABLE IF NOT EXISTS shipping_carriers (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Carrier info
  name VARCHAR(100) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  logo_url TEXT,

  -- Configuration (JSON for flexibility)
  config JSONB,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_shipping_carriers_code ON shipping_carriers(code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shipping_carriers_active ON shipping_carriers(is_active) WHERE deleted_at IS NULL;

-- Apply updated_at trigger
CREATE TRIGGER update_shipping_carriers_updated_at
  BEFORE UPDATE ON shipping_carriers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: shipping_rates
-- ============================================================================
CREATE TABLE IF NOT EXISTS shipping_rates (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Foreign keys
  zone_id UUID NOT NULL REFERENCES shipping_zones(id) ON DELETE CASCADE,
  carrier_id UUID NOT NULL REFERENCES shipping_carriers(id) ON DELETE CASCADE,

  -- Price range (in cents)
  min_amount INTEGER NOT NULL CHECK (min_amount >= 0),
  max_amount INTEGER CHECK (max_amount IS NULL OR max_amount >= min_amount),

  -- Shipping price (in cents)
  price INTEGER NOT NULL CHECK (price >= 0),

  -- Delivery estimate (in days)
  estimated_days_min INTEGER NOT NULL CHECK (estimated_days_min >= 1),
  estimated_days_max INTEGER NOT NULL CHECK (estimated_days_max >= estimated_days_min),

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_shipping_rates_zone ON shipping_rates(zone_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shipping_rates_carrier ON shipping_rates(carrier_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shipping_rates_amount ON shipping_rates(min_amount, max_amount) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shipping_rates_active ON shipping_rates(is_active) WHERE deleted_at IS NULL;

-- Apply updated_at trigger
CREATE TRIGGER update_shipping_rates_updated_at
  BEFORE UPDATE ON shipping_rates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update shipping_zones to add missing columns
ALTER TABLE shipping_zones
  ADD COLUMN IF NOT EXISTS provinces JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS excluded_postcodes JSONB NOT NULL DEFAULT '[]';

-- Rollback SQL (commented for reference)
-- DROP TRIGGER IF EXISTS update_shipping_rates_updated_at ON shipping_rates;
-- DROP TABLE IF EXISTS shipping_rates CASCADE;
-- DROP TRIGGER IF EXISTS update_shipping_carriers_updated_at ON shipping_carriers;
-- DROP TABLE IF EXISTS shipping_carriers CASCADE;
