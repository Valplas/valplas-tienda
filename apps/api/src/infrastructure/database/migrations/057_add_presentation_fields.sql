-- Migration: 057_add_presentation_fields
-- Description: Unidad de venta del producto (ej. "paquete" que contiene 100 "bolsas") y nombre
--   opcional de cada presentación (tier, ej. "Bulto"). Además guarda en order_items un snapshot
--   del nombre de la presentación al momento de la compra. Todo opcional (NULL).
-- Created: 2026-11-23

ALTER TABLE products
  ADD COLUMN unit_label VARCHAR(30),
  ADD COLUMN unit_content_quantity NUMERIC(12,3),
  ADD COLUMN unit_content_label VARCHAR(40);

ALTER TABLE products
  ADD CONSTRAINT products_unit_content_quantity_positive
    CHECK (unit_content_quantity IS NULL OR unit_content_quantity > 0),
  ADD CONSTRAINT products_unit_content_complete
    CHECK ((unit_content_quantity IS NULL) = (unit_content_label IS NULL));

ALTER TABLE product_price_tiers
  ADD COLUMN label VARCHAR(40);

ALTER TABLE order_items
  ADD COLUMN presentation_label_snapshot VARCHAR(120);

-- Rollback:
-- ALTER TABLE order_items DROP COLUMN IF EXISTS presentation_label_snapshot;
-- ALTER TABLE product_price_tiers DROP COLUMN IF EXISTS label;
-- ALTER TABLE products DROP CONSTRAINT IF EXISTS products_unit_content_complete;
-- ALTER TABLE products DROP CONSTRAINT IF EXISTS products_unit_content_quantity_positive;
-- ALTER TABLE products
--   DROP COLUMN IF EXISTS unit_content_label,
--   DROP COLUMN IF EXISTS unit_content_quantity,
--   DROP COLUMN IF EXISTS unit_label;
