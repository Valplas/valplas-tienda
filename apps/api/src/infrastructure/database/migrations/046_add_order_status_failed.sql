-- Migration: 046_add_order_status_failed
-- Description: Agrega el estado 'failed' (pago rechazado) a order_status.
--   La app ya lo usa (VALID_STATUS_TRANSITIONS, webhook de Mercado Pago:
--   rejected/cancelled → 'failed'), pero el enum del 001 no lo incluye, así que
--   el UPDATE fallaba con "invalid input value for enum order_status".
--
--   ALTER TYPE ... ADD VALUE no puede usar el valor nuevo en la misma transacción:
--   la liberación de stock para 'failed' va en la migración 047.
--
-- Created: 2026-11-15

ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'failed';

-- Rollback SQL (commented for reference)
-- PostgreSQL no permite quitar un valor de un enum. Para revertir hay que recrear el tipo
-- sin 'failed' (requiere que ninguna fila use ese valor) y reasignar las columnas.
