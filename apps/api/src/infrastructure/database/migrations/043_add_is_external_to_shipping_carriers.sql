-- Migration 043: shipping_carriers.is_external
--
-- Marca los carriers cuyo envío lo gestiona un proveedor externo integrado (ej: Andreani).
-- La dirección de entrega de un pedido con carrier externo no se puede modificar desde el
-- backoffice: el envío ya fue cotizado/generado en el sistema del proveedor.
-- Created: 2026-10-22

ALTER TABLE shipping_carriers ADD COLUMN IF NOT EXISTS is_external BOOLEAN NOT NULL DEFAULT false;

-- Rollback:
-- ALTER TABLE shipping_carriers DROP COLUMN IF EXISTS is_external;
