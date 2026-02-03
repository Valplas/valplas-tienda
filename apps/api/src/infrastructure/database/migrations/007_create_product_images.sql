-- Migration: 007_create_product_images
-- Description: Create product_images table for product gallery
-- Created: 2026-02-01

CREATE TABLE product_images (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Foreign key to products
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  -- Image info
  url VARCHAR(500) NOT NULL,
  alt_text VARCHAR(255),
  display_order INTEGER NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT false,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_product_images_product_id ON product_images(product_id);
CREATE INDEX idx_product_images_display_order ON product_images(product_id, display_order);
CREATE INDEX idx_product_images_primary ON product_images(product_id, is_primary) WHERE is_primary = true;

-- Apply updated_at trigger
CREATE TRIGGER update_product_images_updated_at
  BEFORE UPDATE ON product_images
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to ensure only one primary image per product
CREATE OR REPLACE FUNCTION ensure_single_primary_image()
RETURNS TRIGGER AS $$
BEGIN
  -- If this image is being set as primary
  IF NEW.is_primary = true THEN
    -- Remove primary flag from all other images of this product
    UPDATE product_images
    SET is_primary = false
    WHERE product_id = NEW.product_id
      AND id != NEW.id
      AND is_primary = true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger for primary image logic
CREATE TRIGGER ensure_single_primary_image_trigger
  BEFORE INSERT OR UPDATE ON product_images
  FOR EACH ROW
  EXECUTE FUNCTION ensure_single_primary_image();

-- Rollback SQL (commented for reference)
-- DROP TRIGGER IF EXISTS ensure_single_primary_image_trigger ON product_images;
-- DROP FUNCTION IF EXISTS ensure_single_primary_image();
-- DROP TRIGGER IF EXISTS update_product_images_updated_at ON product_images;
-- DROP TABLE IF EXISTS product_images CASCADE;
