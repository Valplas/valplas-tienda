-- Migration 042: users.is_admin_created
--
-- Marca los clientes que el admin cargó desde el backoffice (userDomain.createUser). Mientras
-- no inicien sesión cuentan, igual que los migrados del CRM, como cuentas sin uso en la web:
-- las sugerencias de merge las cruzan por dirección con las cuentas que sí usa el cliente.
-- last_login_at no alcanza para distinguirlos: el registro web no lo setea.
-- Created: 2026-10-22

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin_created BOOLEAN NOT NULL DEFAULT false;

-- Backfill: sin username cargado, userDomain.createUser usa los dígitos del teléfono (con un
-- sufijo `_xxx` si ya existía). Los cargados con un username a mano no se detectan.
UPDATE users SET is_admin_created = true
WHERE role = 'customer' AND is_legacy = false AND google_id IS NULL
  AND phone IS NOT NULL
  AND split_part(username, '_', 1) = regexp_replace(phone, '\D', '', 'g');

-- Rollback:
-- ALTER TABLE users DROP COLUMN IF EXISTS is_admin_created;
