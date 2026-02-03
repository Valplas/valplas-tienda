-- Migration: 009_create_order_items
-- Description: Create order_items table with product snapshot
-- Created: 2026-02-01

CREATE TABLE order_items (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Foreign keys
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,

  -- Product snapshot (denormalized for historical record)
  product_name VARCHAR(255) NOT NULL,
  product_sku VARCHAR(50) NOT NULL,
  product_image_url VARCHAR(500),

  -- Quantity and pricing (in cents)
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  subtotal INTEGER NOT NULL CHECK (subtotal >= 0),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);

-- Apply updated_at trigger
CREATE TRIGGER update_order_items_updated_at
  BEFORE UPDATE ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger to auto-calculate subtotal
CREATE OR REPLACE FUNCTION calculate_order_item_subtotal()
RETURNS TRIGGER AS $$
BEGIN
  NEW.subtotal = NEW.quantity * NEW.unit_price;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_order_item_subtotal_trigger
  BEFORE INSERT OR UPDATE ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_order_item_subtotal();

-- Rollback SQL (commented for reference)
-- DROP TRIGGER IF EXISTS calculate_order_item_subtotal_trigger ON order_items;
-- DROP FUNCTION IF EXISTS calculate_order_item_subtotal();
-- DROP TRIGGER IF EXISTS update_order_items_updated_at ON order_items;
-- DROP TABLE IF EXISTS order_items CASCADE;
