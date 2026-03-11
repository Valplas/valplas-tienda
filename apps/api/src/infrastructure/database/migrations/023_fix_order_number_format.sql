-- Migration: 023_fix_order_number_format
-- Description: Fix order number format to PREFIX-YYYYMMDD-NNNNNN with yearly counter.
--   The date in the number is the creation date, but the sequence counter resets yearly.
--   Example: VLP-20260311-000001 (first VLP order of 2026, created on March 11)
-- Created: 2026-03-11

CREATE OR REPLACE FUNCTION generate_order_number(p_prefix VARCHAR DEFAULT 'VLP')
RETURNS VARCHAR(25) AS $$
DECLARE
  today_str  VARCHAR(8);
  year_str   VARCHAR(4);
  year_count INTEGER;
  new_number VARCHAR(25);
BEGIN
  today_str := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');
  year_str  := TO_CHAR(CURRENT_DATE, 'YYYY');

  -- Count all orders this year for this prefix (yearly counter)
  SELECT COUNT(*) INTO year_count
  FROM orders
  WHERE order_number LIKE p_prefix || '-' || year_str || '%';

  year_count := year_count + 1;

  new_number := p_prefix || '-' || today_str || '-' || LPAD(year_count::TEXT, 6, '0');

  RETURN new_number;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Rollback SQL (commented for reference)
-- (restore function from migration 021)
