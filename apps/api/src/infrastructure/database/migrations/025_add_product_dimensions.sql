-- Migration: 025_add_product_dimensions
-- Description: Add physical dimensions and origin fields to products (matching legacy CRM)
-- Created: 2026-03-12

ALTER TABLE products
  ADD COLUMN weight    NUMERIC(10, 3),  -- kg
  ADD COLUMN width     NUMERIC(10, 2),  -- cm
  ADD COLUMN length    NUMERIC(10, 2),  -- cm
  ADD COLUMN height    NUMERIC(10, 2),  -- cm
  ADD COLUMN origin    VARCHAR(100);

COMMENT ON COLUMN products.weight IS 'Peso en kg';
COMMENT ON COLUMN products.width  IS 'Ancho en cm';
COMMENT ON COLUMN products.length IS 'Largo en cm';
COMMENT ON COLUMN products.height IS 'Alto en cm';
COMMENT ON COLUMN products.origin IS 'País o región de origen del producto';

-- Rollback SQL:
-- ALTER TABLE products
--   DROP COLUMN IF EXISTS weight,
--   DROP COLUMN IF EXISTS width,
--   DROP COLUMN IF EXISTS length,
--   DROP COLUMN IF EXISTS height,
--   DROP COLUMN IF EXISTS origin;
