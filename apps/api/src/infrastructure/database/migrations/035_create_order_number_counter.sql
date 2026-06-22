-- Migration 035: contador atómico de order_number por año
--
-- Reemplaza el patrón `SELECT COUNT(*) FROM orders WHERE EXTRACT(YEAR ...)` usado
-- para numerar pedidos, que tenía dos problemas:
--   1) EXTRACT(YEAR FROM created_at) no es sargable (no usa el índice de created_at).
--   2) Race condition: dos checkouts concurrentes leían el mismo count y generaban
--      el mismo order_number, violando el UNIQUE de orders.order_number (el segundo
--      INSERT fallaba en pleno checkout).
--
-- El contador se incrementa con INSERT ... ON CONFLICT DO UPDATE RETURNING, que toma
-- un lock de fila y serializa las inserciones concurrentes de forma atómica.

CREATE TABLE IF NOT EXISTS order_number_counters (
  year INTEGER PRIMARY KEY,
  last_value INTEGER NOT NULL DEFAULT 0
);

-- Sembrar con la cantidad actual de órdenes por año para no colisionar con los
-- order_number ya emitidos (el esquema anterior era un contador global por año).
INSERT INTO order_number_counters (year, last_value)
SELECT EXTRACT(YEAR FROM created_at)::int AS year, COUNT(*) AS last_value
FROM orders
GROUP BY EXTRACT(YEAR FROM created_at)
ON CONFLICT (year) DO NOTHING;

-- Rollback:
-- DROP TABLE IF EXISTS order_number_counters;
