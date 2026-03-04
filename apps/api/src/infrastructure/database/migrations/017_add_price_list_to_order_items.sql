-- Migration: 017_add_price_list_to_order_items
-- Description: Add price list tracking fields to order_items
-- Created: 2026-03-04
-- revenue is a generated column: (unit_price - cost_price_snapshot) * quantity

ALTER TABLE order_items
  ADD COLUMN price_list_id      UUID REFERENCES price_lists(id) ON DELETE SET NULL,
  ADD COLUMN cost_price_snapshot INTEGER,
  ADD COLUMN revenue            INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN cost_price_snapshot IS NOT NULL
      THEN (unit_price - cost_price_snapshot) * quantity
      ELSE NULL
    END
  ) STORED;

CREATE INDEX idx_order_items_price_list_id
  ON order_items(price_list_id)
  WHERE price_list_id IS NOT NULL;

-- Rollback SQL:
-- DROP INDEX IF EXISTS idx_order_items_price_list_id;
-- ALTER TABLE order_items
--   DROP COLUMN IF EXISTS revenue,
--   DROP COLUMN IF EXISTS cost_price_snapshot,
--   DROP COLUMN IF EXISTS price_list_id;
