-- Migration: 047_release_stock_on_order_failed
-- Description: Una orden que pasa a 'failed' (pago rechazado, solo desde pending_payment)
--   debe liberar el stock reservado, igual que 'cancelled'. 'failed' es terminal
--   (VALID_STATUS_TRANSITIONS['failed'] = []), así que sin esto la reserva quedaría
--   colgada para siempre. Requiere el valor 'failed' creado en la migración 046.
--
--   Cambios sobre la versión de 034:
--     - dispara con NEW.status IN ('cancelled', 'failed')
--     - ignora transiciones entre estados terminales (cancelled <-> failed)
--
-- Created: 2026-11-15

CREATE OR REPLACE FUNCTION release_stock_on_order_cancel()
RETURNS TRIGGER AS $$
DECLARE
  item RECORD;
  was_payment_confirmed BOOLEAN;
BEGIN
  IF NEW.status IN ('cancelled', 'failed')
     AND OLD.status NOT IN ('cancelled', 'failed') THEN
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
        UPDATE products
        SET stock = stock + item.real_quantity
        WHERE id = item.product_id;
      ELSE
        -- Payment never confirmed: only reserved_stock was incremented
        UPDATE products
        SET reserved_stock = reserved_stock - item.real_quantity
        WHERE id = item.product_id;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Rollback SQL (commented for reference)
-- Restore release_stock_on_order_cancel from 034_fix_stock_triggers_real_quantity.sql
