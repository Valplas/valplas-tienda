-- Migration: 022_add_shipping_address_id_to_orders
-- Description: Add shipping_address_id FK reference to orders table.
--   The address data is already stored as a snapshot (shipping_street, etc.).
--   This column is an optional reference to the original user_address record.
-- Created: 2026-03-11

ALTER TABLE orders
  ADD COLUMN shipping_address_id UUID REFERENCES user_addresses(id) ON DELETE SET NULL;

CREATE INDEX idx_orders_shipping_address_id ON orders(shipping_address_id)
  WHERE shipping_address_id IS NOT NULL;

-- Rollback SQL (commented for reference)
-- DROP INDEX IF EXISTS idx_orders_shipping_address_id;
-- ALTER TABLE orders DROP COLUMN IF EXISTS shipping_address_id;
