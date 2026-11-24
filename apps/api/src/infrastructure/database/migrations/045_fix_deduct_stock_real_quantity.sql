-- Migration: 045_fix_deduct_stock_real_quantity
-- Description: deduct_stock_on_payment_confirmed (010) todavía usaba order_items.quantity
--   (bultos). La migración 034 reescribió los otros dos triggers de stock pero omitió este.
--   Para ítems con bundle_size_snapshot > 1, al confirmarse el pago:
--     - stock bajaba solo `quantity` en vez de `real_quantity` (stock inflado), y
--     - reserved_stock quedaba con un remanente de (real_quantity - quantity), y
--     - un cancel posterior devolvía real_quantity completo a stock.
--   Ahora descuenta real_quantity (unidades), consistente con 034.
--
--   No corrige pedidos ya confirmados con bundle > 1 (requiere revisión de datos aparte).
--
-- Created: 2026-11-15

CREATE OR REPLACE FUNCTION deduct_stock_on_payment_confirmed()
RETURNS TRIGGER AS $$
DECLARE
  item RECORD;
BEGIN
  -- Only execute when status changes to 'payment_confirmed'
  IF NEW.status = 'payment_confirmed' AND OLD.status != 'payment_confirmed' THEN
    FOR item IN
      SELECT product_id, real_quantity
      FROM order_items
      WHERE order_id = NEW.id
    LOOP
      -- Deduct actual units from both stock and reserved_stock
      UPDATE products
      SET
        stock = stock - item.real_quantity,
        reserved_stock = reserved_stock - item.real_quantity
      WHERE id = item.product_id;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Rollback SQL (commented for reference)
-- Restore deduct_stock_on_payment_confirmed from 010_create_stock_triggers.sql (uses item.quantity)
