-- Migration: 019_fix_stock_triggers
-- Description: Fix stock triggers for admin-created orders
--
-- Problem with existing triggers (migration 010):
-- 1. reserve_stock_trigger fires AFTER INSERT ON orders but reads order_items
--    which don't exist yet at that point → loop body never executes, no stock reserved
-- 2. deduct_stock_trigger fires AFTER UPDATE ON orders when status → payment_confirmed
--    but admin orders are INSERTED directly with payment_confirmed status → trigger never fires
-- 3. release_stock_on_order_cancel incorrectly increments reserved_stock when
--    cancelling from payment_confirmed (reserved_stock was already zeroed by deduct trigger)
--
-- Fix:
-- 1. Drop broken trigger 1 (reserve on order insert)
-- 2. Add trigger on order_items INSERT that handles stock/reservation atomically
-- 3. Fix cancel trigger: when was payment_confirmed, only restore stock (not reserved_stock)
--
-- Created: 2026-03-10

-- ============================================================================
-- Drop broken trigger 1
-- ============================================================================
DROP TRIGGER IF EXISTS reserve_stock_trigger ON orders;
DROP FUNCTION IF EXISTS reserve_stock_on_order_create();

-- ============================================================================
-- New trigger: handle stock when an order_item is inserted
-- If order status is payment_confirmed → deduct stock directly
-- Otherwise → increment reserved_stock
-- ============================================================================
CREATE OR REPLACE FUNCTION handle_stock_on_item_insert()
RETURNS TRIGGER AS $$
DECLARE
  order_status TEXT;
  available_stock INTEGER;
BEGIN
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

  IF order_status = 'payment_confirmed' THEN
    -- Admin-created order with confirmed status: deduct stock directly
    UPDATE products
    SET stock = stock - NEW.quantity
    WHERE id = NEW.product_id;
  ELSE
    -- Normal order pending payment: reserve stock
    UPDATE products
    SET reserved_stock = reserved_stock + NEW.quantity
    WHERE id = NEW.product_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER handle_stock_on_item_insert_trigger
  AFTER INSERT ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION handle_stock_on_item_insert();

-- ============================================================================
-- Fix trigger 3: release stock on cancel
-- When was payment_confirmed: only restore stock (reserved_stock was already 0)
-- When was pending: only release reserved_stock (stock was never decremented)
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
      SELECT product_id, quantity
      FROM order_items
      WHERE order_id = NEW.id
    LOOP
      IF was_payment_confirmed THEN
        -- Payment was confirmed: stock was decremented, reserved_stock is 0
        -- Only restore stock
        UPDATE products
        SET stock = stock + item.quantity
        WHERE id = item.product_id;
      ELSE
        -- Payment never confirmed: only reserved_stock was incremented
        -- Release the reservation
        UPDATE products
        SET reserved_stock = reserved_stock - item.quantity
        WHERE id = item.product_id;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger already exists from migration 010, just replace the function above
-- (DROP + CREATE to be safe)
DROP TRIGGER IF EXISTS release_stock_trigger ON orders;
CREATE TRIGGER release_stock_trigger
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION release_stock_on_order_cancel();

-- Rollback SQL (commented for reference)
-- DROP TRIGGER IF EXISTS handle_stock_on_item_insert_trigger ON order_items;
-- DROP FUNCTION IF EXISTS handle_stock_on_item_insert();
-- DROP TRIGGER IF EXISTS release_stock_trigger ON orders;
-- DROP FUNCTION IF EXISTS release_stock_on_order_cancel();
-- Restore original from 010_create_stock_triggers.sql
