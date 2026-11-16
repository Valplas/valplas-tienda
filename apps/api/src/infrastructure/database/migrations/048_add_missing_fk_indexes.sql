-- Migration: 048_add_missing_fk_indexes
-- Description: Índices para dos FKs que no tenían ninguno. Sin ellos, borrar o
--   actualizar la fila referenciada (price_lists / users) escanea la tabla hija entera
--   para validar la integridad referencial, y los JOINs por esa columna no usan índice.
--     - product_price_tiers.price_list_id  (FK → price_lists, ON DELETE RESTRICT)
--     - order_status_history.changed_by    (FK → users, ON DELETE SET NULL)
--
--   Las tablas son chicas (< 30 filas en dev), así que el build bloqueante es inmediato.
--   El runner ejecuta cada archivo en una transacción: no se puede usar CONCURRENTLY.
--
-- Created: 2026-11-15

CREATE INDEX IF NOT EXISTS idx_product_price_tiers_price_list_id
  ON product_price_tiers (price_list_id);

CREATE INDEX IF NOT EXISTS idx_order_status_history_changed_by
  ON order_status_history (changed_by)
  WHERE changed_by IS NOT NULL;

-- Rollback SQL (commented for reference)
-- DROP INDEX IF EXISTS idx_product_price_tiers_price_list_id;
-- DROP INDEX IF EXISTS idx_order_status_history_changed_by;
