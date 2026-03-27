-- Migration: 034_fix_stock_triggers_real_quantity
-- Description: Update stock triggers to use real_quantity instead of quantity.
--   After migration 033, order_items.quantity = bundles, order_items.real_quantity = actual units.
--   Stock must be managed based on real_quantity (actual units).
--
--   Rewrites:
--     1. handle_stock_on_item_insert  (from 020) → uses NEW.real_quantity
--     2. release_stock_on_order_cancel (from 019) → uses item.real_quantity
--
-- Created: 2026-03-27

-- ============================================================================
-- Rewrite handle_stock_on_item_insert to use real_quantity
-- (originally from 019, updated in 020 to support processing status + skip flag)
-- ============================================================================
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

  -- Check available stock against real_quantity (actual units)
  IF available_stock < NEW.real_quantity THEN
    RAISE EXCEPTION 'Stock insuficiente para el producto %. Disponible: %, Solicitado: %',
      NEW.product_id, available_stock, NEW.real_quantity
      USING ERRCODE = 'check_violation';
  END IF;

  IF order_status = 'payment_confirmed' OR order_status = 'processing' THEN
    -- Deduct actual units from stock directly (admin order / confirmed payment)
    UPDATE products
    SET stock = stock - NEW.real_quantity
    WHERE id = NEW.product_id;
  ELSE
    -- Normal order pending payment: reserve actual units
    UPDATE products
    SET reserved_stock = reserved_stock + NEW.real_quantity
    WHERE id = NEW.product_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Rewrite release_stock_on_order_cancel to use real_quantity
-- (originally from 019, replaces use of item.quantity with item.real_quantity)
-- ============================================================================
CREATE OR REPLACE FUNCTION release_stock_on_order_cancel()
RETURNS TRIGGER AS $$
DECLARE
  item RECORD;
  was_payment_confirmed BOOLEAN;
BEGIN
  -- Only execute when status changes to 'cancelled'
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    was_payment_confirmed := (OLD.status = 'payment_confirmed' OR
                              OLD.status = 'processing' OR
                              OLD.status = 'ready_to_ship' OR
                              OLD.status = 'shipped');

    FOR item IN
      SELECT product_id, real_quantity
      FROM order_items
      WHERE order_id = NEW.id
    LOOP
      IF was_payment_confirmed THEN
        -- Payment was confirmed: stock was decremented, reserved_stock is 0
        -- Restore actual units to stock
        UPDATE products
        SET stock = stock + item.real_quantity
        WHERE id = item.product_id;
      ELSE
        -- Payment never confirmed: only reserved_stock was incremented
        -- Release the reservation of actual units
        UPDATE products
        SET reserved_stock = reserved_stock - item.real_quantity
        WHERE id = item.product_id;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger already exists from migration 019/010, function replacement is sufficient
-- (DROP + CREATE trigger to be safe)
DROP TRIGGER IF EXISTS release_stock_trigger ON orders;
CREATE TRIGGER release_stock_trigger
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION release_stock_on_order_cancel();

-- Note: handle_stock_on_item_insert_trigger already exists from migration 019,
-- replacing the function above is sufficient (trigger definition unchanged).

-- Rollback SQL (commented for reference)
-- Restore handle_stock_on_item_insert from migration 020_fix_stock_trigger_processing.sql
-- Restore release_stock_on_order_cancel from migration 019_fix_stock_triggers.sql
