-- Migration: 049_add_sales_channel
-- Description: Canal de venta para análisis y para el bot de WhatsApp.
--   - sales_channel (enum): web | admin | whatsapp | legacy
--   - orders.sales_channel: por qué canal entró la orden. El prefijo del order_number
--     (VLP/ADM/WSP) es solo para lectura humana; los reportes filtran por esta columna.
--   - orders.client_reference: clave de idempotencia que manda un canal externo (bot).
--     Un reintento con la misma clave devuelve la orden ya creada en vez de duplicarla.
--   - users.signup_channel: por qué canal se creó la cuenta (ej: cliente dado de alta
--     por el bot). Se muestra en las sugerencias de merge.
--
--   Backfill:
--     - Órdenes ADM-% → admin.
--     - Órdenes importadas del CRM (tools/migration/src/migrate-orders.ts: usuario legacy,
--       shipping_street_number 'S/N' y shipping_postcode '0000') → legacy.
--     - Usuarios is_legacy → legacy; is_admin_created → admin.
--
-- Created: 2026-11-16

CREATE TYPE sales_channel AS ENUM ('web', 'admin', 'whatsapp', 'legacy');

ALTER TABLE orders ADD COLUMN IF NOT EXISTS sales_channel sales_channel NOT NULL DEFAULT 'web';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_reference VARCHAR(100) NULL;

UPDATE orders SET sales_channel = 'admin' WHERE order_number LIKE 'ADM-%';

UPDATE orders o SET sales_channel = 'legacy'
FROM users u
WHERE u.id = o.user_id
  AND u.is_legacy = true
  AND o.shipping_street_number = 'S/N'
  AND o.shipping_postcode = '0000';

CREATE INDEX IF NOT EXISTS idx_orders_sales_channel_created_at
  ON orders (sales_channel, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_client_reference
  ON orders (client_reference)
  WHERE client_reference IS NOT NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_channel sales_channel NOT NULL DEFAULT 'web';

UPDATE users SET signup_channel = 'legacy' WHERE is_legacy = true;
UPDATE users SET signup_channel = 'admin' WHERE is_legacy = false AND is_admin_created = true;

-- Rollback SQL (commented for reference)
-- ALTER TABLE users DROP COLUMN IF EXISTS signup_channel;
-- DROP INDEX IF EXISTS idx_orders_client_reference;
-- DROP INDEX IF EXISTS idx_orders_sales_channel_created_at;
-- ALTER TABLE orders DROP COLUMN IF EXISTS client_reference;
-- ALTER TABLE orders DROP COLUMN IF EXISTS sales_channel;
-- DROP TYPE IF EXISTS sales_channel;
