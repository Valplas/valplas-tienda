-- Migration: 011_create_helper_functions
-- Description: Helper functions for stock and order number generation
-- Created: 2026-02-01

-- ============================================================================
-- FUNCTION 1: Get available stock for a product
-- ============================================================================
CREATE OR REPLACE FUNCTION get_available_stock(p_product_id UUID)
RETURNS INTEGER AS $$
DECLARE
  available INTEGER;
BEGIN
  SELECT (stock - reserved_stock) INTO available
  FROM products
  WHERE id = p_product_id
    AND deleted_at IS NULL;

  RETURN COALESCE(available, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- FUNCTION 2: Generate order number (format: VLP-YYYYMMDD-NNNN)
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS VARCHAR(20) AS $$
DECLARE
  today_date VARCHAR(8);
  today_count INTEGER;
  new_number VARCHAR(20);
BEGIN
  -- Get today's date in YYYYMMDD format
  today_date := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');

  -- Count orders created today
  SELECT COUNT(*) INTO today_count
  FROM orders
  WHERE order_number LIKE 'VLP-' || today_date || '-%';

  -- Increment counter
  today_count := today_count + 1;

  -- Generate order number: VLP-YYYYMMDD-NNNN
  new_number := 'VLP-' || today_date || '-' || LPAD(today_count::TEXT, 4, '0');

  RETURN new_number;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Rollback SQL (commented for reference)
-- DROP FUNCTION IF EXISTS generate_order_number();
-- DROP FUNCTION IF EXISTS get_available_stock(UUID);
