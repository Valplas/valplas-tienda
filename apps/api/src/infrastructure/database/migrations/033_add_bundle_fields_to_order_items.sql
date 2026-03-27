-- Migration: 033_add_bundle_fields_to_order_items
-- Description: Add real_quantity and bundle_size_snapshot to order_items
--   for price tier / bulk purchasing support.
--
--   quantity              = number of bundles entered by the user (e.g. 2)
--   bundle_size_snapshot  = tier's min_quantity at order creation time (e.g. 12) — immutable snapshot
--   real_quantity         = quantity × bundle_size_snapshot (e.g. 24) — used by stock triggers
--
--   Historic rows (orders created before price tiers): bundle_size_snapshot = 1, real_quantity = quantity
-- Created: 2026-03-27

ALTER TABLE order_items
  ADD COLUMN real_quantity        INTEGER,
  ADD COLUMN bundle_size_snapshot INTEGER;

-- Backfill historic rows: treat each unit as a bundle of 1
UPDATE order_items
SET real_quantity = quantity,
    bundle_size_snapshot = 1
WHERE real_quantity IS NULL;

-- Enforce NOT NULL after backfill
ALTER TABLE order_items
  ALTER COLUMN real_quantity        SET NOT NULL,
  ALTER COLUMN bundle_size_snapshot SET NOT NULL;

-- Add constraints
ALTER TABLE order_items
  ADD CONSTRAINT order_items_real_quantity_positive        CHECK (real_quantity > 0),
  ADD CONSTRAINT order_items_bundle_size_snapshot_positive CHECK (bundle_size_snapshot >= 1);

-- Rollback SQL (commented for reference)
-- ALTER TABLE order_items DROP COLUMN IF EXISTS real_quantity;
-- ALTER TABLE order_items DROP COLUMN IF EXISTS bundle_size_snapshot;
