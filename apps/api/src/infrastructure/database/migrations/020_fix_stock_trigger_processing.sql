-- Migration: 020_fix_stock_trigger_processing
-- Description:
-- 1. Treat 'processing' same as 'payment_confirmed' in handle_stock_on_item_insert
--    (admin orders are now created at 'processing' status)
-- 2. Add app.skip_stock_trigger session variable support so the edit endpoint
--    can manage stock manually without double-deduction
-- Created: 2026-03-10

CREATE OR REPLACE FUNCTION handle_stock_on_item_insert()
RETURNS TRIGGER AS $$
DECLARE
  order_status TEXT;
  available_stock INTEGER;
BEGIN
  -- Skip if called from admin order edit (stock handled manually in that path)
  IF current_setting('app.skip_stock_trigger', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Get the order status
  SELECT status INTO order_status
  FROM orders
  WHERE id = NEW.order_id;

  -- Lock the product row to prevent race conditions
  SELECT (stock - reserved_stock) INTO available_stock
  FROM products
  WHERE id = NEW.product_id
  FOR UPDATE;

  -- Check if there's enough available stock
  IF available_stock < NEW.quantity THEN
    RAISE EXCEPTION 'Stock insuficiente para el producto %. Disponible: %, Solicitado: %',
      NEW.product_id, available_stock, NEW.quantity
      USING ERRCODE = 'check_violation';
  END IF;

  IF order_status = 'payment_confirmed' OR order_status = 'processing' THEN
    -- Deduct stock directly (payment already confirmed / admin order)
    UPDATE products
    SET stock = stock - NEW.quantity
    WHERE id = NEW.product_id;
  ELSE
    -- Normal order pending payment: only reserve stock
    UPDATE products
    SET reserved_stock = reserved_stock + NEW.quantity
    WHERE id = NEW.product_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Rollback SQL (commented for reference)
-- Restore the version from migration 019_fix_stock_triggers.sql
