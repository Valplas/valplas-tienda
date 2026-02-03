-- Migration: 010_create_stock_triggers
-- Description: Critical triggers for stock management (VERY CRITICAL)
-- Created: 2026-02-01

-- ============================================================================
-- TRIGGER 1: Reserve stock when order is created
-- ============================================================================
CREATE OR REPLACE FUNCTION reserve_stock_on_order_create()
RETURNS TRIGGER AS $$
DECLARE
  item RECORD;
  available_stock INTEGER;
BEGIN
  -- Loop through all order items for this order
  FOR item IN
    SELECT product_id, quantity
    FROM order_items
    WHERE order_id = NEW.id
  LOOP
    -- Lock the product row to prevent race conditions
    SELECT (stock - reserved_stock) INTO available_stock
    FROM products
    WHERE id = item.product_id
    FOR UPDATE;

    -- Check if there's enough available stock
    IF available_stock < item.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for product %. Available: %, Requested: %',
        item.product_id, available_stock, item.quantity
        USING ERRCODE = 'check_violation';
    END IF;

    -- Reserve the stock
    UPDATE products
    SET reserved_stock = reserved_stock + item.quantity
    WHERE id = item.product_id;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reserve_stock_trigger
  AFTER INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION reserve_stock_on_order_create();

-- ============================================================================
-- TRIGGER 2: Deduct stock when payment is confirmed
-- ============================================================================
CREATE OR REPLACE FUNCTION deduct_stock_on_payment_confirmed()
RETURNS TRIGGER AS $$
DECLARE
  item RECORD;
BEGIN
  -- Only execute when status changes to 'payment_confirmed'
  IF NEW.status = 'payment_confirmed' AND OLD.status != 'payment_confirmed' THEN
    -- Loop through all order items
    FOR item IN
      SELECT product_id, quantity
      FROM order_items
      WHERE order_id = NEW.id
    LOOP
      -- Deduct from both stock and reserved_stock
      UPDATE products
      SET
        stock = stock - item.quantity,
        reserved_stock = reserved_stock - item.quantity
      WHERE id = item.product_id;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER deduct_stock_trigger
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION deduct_stock_on_payment_confirmed();

-- ============================================================================
-- TRIGGER 3: Release stock when order is cancelled
-- ============================================================================
CREATE OR REPLACE FUNCTION release_stock_on_order_cancel()
RETURNS TRIGGER AS $$
DECLARE
  item RECORD;
  was_payment_confirmed BOOLEAN;
BEGIN
  -- Only execute when status changes to 'cancelled'
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    -- Check if payment was previously confirmed
    was_payment_confirmed := (OLD.status = 'payment_confirmed' OR
                              OLD.status = 'processing' OR
                              OLD.status = 'ready_to_ship' OR
                              OLD.status = 'shipped');

    -- Loop through all order items
    FOR item IN
      SELECT product_id, quantity
      FROM order_items
      WHERE order_id = NEW.id
    LOOP
      IF was_payment_confirmed THEN
        -- If payment was confirmed, restitute both stock and reserved_stock
        UPDATE products
        SET
          stock = stock + item.quantity,
          reserved_stock = reserved_stock + item.quantity
        WHERE id = item.product_id;
      ELSE
        -- If only reserved, just release the reservation
        UPDATE products
        SET reserved_stock = reserved_stock - item.quantity
        WHERE id = item.product_id;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER release_stock_trigger
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION release_stock_on_order_cancel();

-- Rollback SQL (commented for reference)
-- DROP TRIGGER IF EXISTS release_stock_trigger ON orders;
-- DROP FUNCTION IF EXISTS release_stock_on_order_cancel();
-- DROP TRIGGER IF EXISTS deduct_stock_trigger ON orders;
-- DROP FUNCTION IF EXISTS deduct_stock_on_payment_confirmed();
-- DROP TRIGGER IF EXISTS reserve_stock_trigger ON orders;
-- DROP FUNCTION IF EXISTS reserve_stock_on_order_create();
