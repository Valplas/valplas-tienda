-- Migration: 021_update_order_number_format
-- Description: Update order number format to PREFIX-YYYY-NNNNNN
--   VLP = customer web orders, ADM = admin/owner created orders
--   Counter resets yearly. Format: VLP-2026-000001 (max 16 chars)
-- Created: 2026-03-11

-- Extend column to accommodate new format (VLP-2026-999999 = 14 chars, safe margin)
ALTER TABLE orders ALTER COLUMN order_number TYPE VARCHAR(25);

-- Update DB function to accept prefix, group by year, use 6-digit sequence
CREATE OR REPLACE FUNCTION generate_order_number(p_prefix VARCHAR DEFAULT 'VLP')
RETURNS VARCHAR(25) AS $$
DECLARE
  current_year VARCHAR(4);
  year_count   INTEGER;
  new_number   VARCHAR(25);
BEGIN
  current_year := TO_CHAR(CURRENT_DATE, 'YYYY');

  SELECT COUNT(*) INTO year_count
  FROM orders
  WHERE order_number LIKE p_prefix || '-' || current_year || '-%';

  year_count := year_count + 1;

  new_number := p_prefix || '-' || current_year || '-' || LPAD(year_count::TEXT, 6, '0');

  RETURN new_number;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Rollback SQL (commented for reference)
-- ALTER TABLE orders ALTER COLUMN order_number TYPE VARCHAR(20);
-- DROP FUNCTION IF EXISTS generate_order_number(VARCHAR);
-- CREATE OR REPLACE FUNCTION generate_order_number() ... (restore from 011)
