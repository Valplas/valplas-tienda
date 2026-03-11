-- Migration: 021_update_order_number_format
-- Description: Update order number format to support prefix (VLP/ADM) and 6-digit sequence
--   VLP = customer web orders, ADM = admin/owner created orders
--   New format: PREFIX-YYYYMMDD-NNNNNN (max 19 chars, fits in VARCHAR(20))
-- Created: 2026-03-11

-- Extend column to accommodate new format safely (VLP-20261231-999999 = 19 chars)
ALTER TABLE orders ALTER COLUMN order_number TYPE VARCHAR(25);

-- Update DB function to accept prefix and use 6-digit sequence
CREATE OR REPLACE FUNCTION generate_order_number(p_prefix VARCHAR DEFAULT 'VLP')
RETURNS VARCHAR(25) AS $$
DECLARE
  today_date VARCHAR(8);
  today_count INTEGER;
  new_number VARCHAR(25);
BEGIN
  today_date := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');

  SELECT COUNT(*) INTO today_count
  FROM orders
  WHERE order_number LIKE p_prefix || '-' || today_date || '-%';

  today_count := today_count + 1;

  new_number := p_prefix || '-' || today_date || '-' || LPAD(today_count::TEXT, 6, '0');

  RETURN new_number;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Rollback SQL (commented for reference)
-- ALTER TABLE orders ALTER COLUMN order_number TYPE VARCHAR(20);
-- DROP FUNCTION IF EXISTS generate_order_number(VARCHAR);
-- CREATE OR REPLACE FUNCTION generate_order_number() ... (restore from 011)
