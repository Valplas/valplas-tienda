-- Migration: 018_convert_prices_to_numeric
-- Description: Convert all monetary columns from INTEGER (centavos) to NUMERIC(12, 2) (pesos ARS)
-- Existing data is automatically divided by 100 via the USING clause
-- Created: 2026-03-09

-- Step 1: Drop GENERATED revenue column (depends on columns being altered)
ALTER TABLE order_items DROP COLUMN IF EXISTS revenue;

-- Step 2: products → NUMERIC(12, 2) pesos
ALTER TABLE products ALTER COLUMN base_price TYPE NUMERIC(12, 2) USING ROUND(base_price::NUMERIC / 100, 2);
ALTER TABLE products ALTER COLUMN cost_price TYPE NUMERIC(12, 2) USING ROUND(cost_price::NUMERIC / 100, 2);

-- Step 3: order_items → NUMERIC(12, 2) pesos
ALTER TABLE order_items ALTER COLUMN unit_price TYPE NUMERIC(12, 2) USING ROUND(unit_price::NUMERIC / 100, 2);
ALTER TABLE order_items ALTER COLUMN subtotal TYPE NUMERIC(12, 2) USING ROUND(subtotal::NUMERIC / 100, 2);
ALTER TABLE order_items ALTER COLUMN cost_price_snapshot TYPE NUMERIC(12, 2) USING ROUND(cost_price_snapshot::NUMERIC / 100, 2);

-- Step 4: orders → NUMERIC(12, 2) pesos
ALTER TABLE orders ALTER COLUMN subtotal TYPE NUMERIC(12, 2) USING ROUND(subtotal::NUMERIC / 100, 2);
ALTER TABLE orders ALTER COLUMN shipping_cost TYPE NUMERIC(12, 2) USING ROUND(shipping_cost::NUMERIC / 100, 2);
ALTER TABLE orders ALTER COLUMN total TYPE NUMERIC(12, 2) USING ROUND(total::NUMERIC / 100, 2);

-- Step 5: Recreate revenue as NUMERIC(12, 2) GENERATED column
ALTER TABLE order_items ADD COLUMN revenue NUMERIC(12, 2) GENERATED ALWAYS AS (
  CASE
    WHEN cost_price_snapshot IS NOT NULL
    THEN ROUND((unit_price - cost_price_snapshot) * quantity, 2)
    ELSE NULL
  END
) STORED;

-- Update comments
COMMENT ON COLUMN products.base_price IS 'Precio base en pesos ARS (hasta 2 decimales).';
COMMENT ON COLUMN products.cost_price IS 'Precio de costo en pesos ARS. Usado para calcular precio con lista de precios.';
COMMENT ON COLUMN order_items.unit_price IS 'Precio unitario en pesos ARS al momento de la compra.';
COMMENT ON COLUMN order_items.subtotal IS 'Subtotal en pesos ARS (calculado por trigger: quantity * unit_price).';
COMMENT ON COLUMN order_items.revenue IS 'Ganancia en pesos ARS: (unit_price - cost_price_snapshot) * quantity.';

-- Rollback SQL:
-- ALTER TABLE order_items DROP COLUMN IF EXISTS revenue;
-- ALTER TABLE order_items ALTER COLUMN unit_price TYPE INTEGER USING ROUND(unit_price * 100)::INTEGER;
-- ALTER TABLE order_items ALTER COLUMN subtotal TYPE INTEGER USING ROUND(subtotal * 100)::INTEGER;
-- ALTER TABLE order_items ALTER COLUMN cost_price_snapshot TYPE INTEGER USING ROUND(COALESCE(cost_price_snapshot, 0) * 100)::INTEGER;
-- ALTER TABLE order_items ADD COLUMN revenue INTEGER GENERATED ALWAYS AS (CASE WHEN cost_price_snapshot IS NOT NULL THEN (unit_price - cost_price_snapshot) * quantity ELSE NULL END) STORED;
-- ALTER TABLE products ALTER COLUMN base_price TYPE INTEGER USING ROUND(base_price * 100)::INTEGER;
-- ALTER TABLE products ALTER COLUMN cost_price TYPE INTEGER USING ROUND(cost_price * 100)::INTEGER;
-- ALTER TABLE orders ALTER COLUMN subtotal TYPE INTEGER USING ROUND(subtotal * 100)::INTEGER;
-- ALTER TABLE orders ALTER COLUMN shipping_cost TYPE INTEGER USING ROUND(shipping_cost * 100)::INTEGER;
-- ALTER TABLE orders ALTER COLUMN total TYPE INTEGER USING ROUND(total * 100)::INTEGER;
