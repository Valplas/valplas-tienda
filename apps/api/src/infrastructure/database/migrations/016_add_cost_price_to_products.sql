-- Migration: 016_add_cost_price_to_products
-- Description: Add cost_price column to products for price list calculations
-- Created: 2026-03-04
-- Formula: unit_price = ROUND(cost_price * (1 + margin / 100))

ALTER TABLE products ADD COLUMN cost_price INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN products.cost_price IS 'Precio de costo en centavos. Usado para calcular precio con lista de precios.';

-- Rollback SQL:
-- ALTER TABLE products DROP COLUMN IF EXISTS cost_price;
