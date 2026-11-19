-- Migration: 050_add_phone_match_key
-- Description: Clave de comparación de teléfonos argentinos.
--   Un mismo celular aparece en E.164 con y sin el 9 de móvil: WhatsApp manda
--   +5491141234567 y un número cargado a mano como "11 4123-4567" se normaliza a
--   +541141234567 (libphonenumber no puede saber que es un celular). La igualdad exacta
--   falla, así que se compara por phone_match_key, que colapsa '+549' → '+54'.
--
--   Espera valores ya normalizados a E.164 (ver shared/utils/phone.ts y el script
--   tools/migration/src/normalize-phones.ts). Espejo en TS: phoneMatchKey().
--
--   Usos: find-or-create de clientes del bot, conflicto de teléfono al editar un usuario
--   y sugerencias de merge por teléfono.
--
-- Created: 2026-11-16

CREATE OR REPLACE FUNCTION phone_match_key(p TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT regexp_replace(p, '^\+549', '+54')
$$;

CREATE INDEX IF NOT EXISTS idx_users_phone_match_key
  ON users (phone_match_key(phone))
  WHERE deleted_at IS NULL AND phone IS NOT NULL;

-- Rollback SQL (commented for reference)
-- DROP INDEX IF EXISTS idx_users_phone_match_key;
-- DROP FUNCTION IF EXISTS phone_match_key(TEXT);
