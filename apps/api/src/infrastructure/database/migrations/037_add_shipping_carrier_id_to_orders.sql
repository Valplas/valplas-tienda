-- Migration: 037_add_shipping_carrier_id_to_orders
-- Description: Add shipping_carrier_id FK reference to orders table.
--   El código de creación de pedidos (order.repository.createOrder) inserta
--   shipping_carrier_id, pero ninguna migración lo agregaba (schema drift):
--   en DBs limpias fallaba con `column "shipping_carrier_id" ... does not exist`.
--   La tabla ya guarda carrier_name como snapshot; esta columna es la referencia
--   opcional al transportista elegido.
-- Created: 2026-07-01

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_carrier_id UUID
  REFERENCES shipping_carriers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_shipping_carrier_id ON orders(shipping_carrier_id)
  WHERE shipping_carrier_id IS NOT NULL;

-- Rollback SQL (commented for reference)
-- DROP INDEX IF EXISTS idx_orders_shipping_carrier_id;
-- ALTER TABLE orders DROP COLUMN IF EXISTS shipping_carrier_id;
