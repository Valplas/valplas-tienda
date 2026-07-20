-- Migration: 038_drop_base_price_from_products
-- Description: base_price duplicaba cost_price (el import del CRM cargaba el mismo
--   valor en ambas). El precio de venta ahora se deriva SIEMPRE de las listas:
--   unit_price = cost_price * (1 + margin / 100). Producto sin lista asignada
--   vende a cost_price (placeholder hasta asignarle lista).
--   Backfill: productos con cost_price = 0 heredan el valor de base_price.
-- Created: 2026-07-19

-- Backfill: productos sin costo cargado toman el precio base como costo
UPDATE products SET cost_price = base_price WHERE cost_price = 0 AND base_price > 0;

DROP INDEX IF EXISTS idx_products_base_price;

ALTER TABLE products DROP COLUMN base_price;

-- Índice para orden/filtro por precio en catálogo (reemplaza idx_products_base_price)
CREATE INDEX idx_products_cost_price ON products(cost_price) WHERE deleted_at IS NULL;

-- Rollback SQL (comentado para referencia)
-- DROP INDEX IF EXISTS idx_products_cost_price;
-- ALTER TABLE products ADD COLUMN base_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (base_price >= 0);
-- UPDATE products SET base_price = cost_price;
-- CREATE INDEX idx_products_base_price ON products(base_price) WHERE deleted_at IS NULL;
