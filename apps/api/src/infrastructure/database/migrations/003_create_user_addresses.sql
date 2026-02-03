-- Migration: 003_create_user_addresses
-- Description: Create user_addresses table with Google Maps integration
-- Created: 2026-02-01

CREATE TABLE user_addresses (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Foreign key to users
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Address fields
  street VARCHAR(255) NOT NULL,
  street_number VARCHAR(20) NOT NULL,
  floor VARCHAR(10),
  apartment VARCHAR(10),
  city VARCHAR(100) NOT NULL,
  province VARCHAR(100) NOT NULL,
  postcode VARCHAR(10) NOT NULL,

  -- Google Maps data
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  place_id VARCHAR(255),

  -- Additional info
  notes TEXT,

  -- Default address flag (only one per user)
  is_default BOOLEAN NOT NULL DEFAULT false,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes
CREATE INDEX idx_user_addresses_user_id ON user_addresses(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_user_addresses_postcode ON user_addresses(postcode) WHERE deleted_at IS NULL;
CREATE INDEX idx_user_addresses_default ON user_addresses(user_id, is_default) WHERE deleted_at IS NULL AND is_default = true;

-- Apply updated_at trigger
CREATE TRIGGER update_user_addresses_updated_at
  BEFORE UPDATE ON user_addresses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to ensure only one default address per user
CREATE OR REPLACE FUNCTION ensure_single_default_address()
RETURNS TRIGGER AS $$
BEGIN
  -- If this address is being set as default
  IF NEW.is_default = true THEN
    -- Remove default flag from all other addresses of this user
    UPDATE user_addresses
    SET is_default = false
    WHERE user_id = NEW.user_id
      AND id != NEW.id
      AND is_default = true
      AND deleted_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger for default address logic
CREATE TRIGGER ensure_single_default_address_trigger
  BEFORE INSERT OR UPDATE ON user_addresses
  FOR EACH ROW
  EXECUTE FUNCTION ensure_single_default_address();

-- Rollback SQL (commented for reference)
-- DROP TRIGGER IF EXISTS ensure_single_default_address_trigger ON user_addresses;
-- DROP FUNCTION IF EXISTS ensure_single_default_address();
-- DROP TRIGGER IF EXISTS update_user_addresses_updated_at ON user_addresses;
-- DROP TABLE IF EXISTS user_addresses CASCADE;
