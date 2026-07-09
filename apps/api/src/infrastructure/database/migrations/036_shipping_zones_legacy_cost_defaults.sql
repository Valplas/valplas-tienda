-- Migration: 036_shipping_zones_legacy_cost_defaults
-- Description: base_cost / free_shipping_threshold en shipping_zones son columnas legacy.
--   El precio de envío ahora vive en shipping_rates. Como el alta de zonas (createZone)
--   ya no las setea, les damos DEFAULT 0 para no violar el NOT NULL.
-- Created: 2026-06-29

ALTER TABLE shipping_zones
  ALTER COLUMN base_cost SET DEFAULT 0;

ALTER TABLE shipping_zones
  ALTER COLUMN free_shipping_threshold SET DEFAULT 0;

-- Normalizar filas existentes con valores nulos (por si las hubiera)
UPDATE shipping_zones SET base_cost = 0 WHERE base_cost IS NULL;
UPDATE shipping_zones SET free_shipping_threshold = 0 WHERE free_shipping_threshold IS NULL;

-- Rollback SQL (comentado para referencia)
-- ALTER TABLE shipping_zones ALTER COLUMN base_cost DROP DEFAULT;
-- ALTER TABLE shipping_zones ALTER COLUMN free_shipping_threshold DROP DEFAULT;
