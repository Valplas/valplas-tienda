-- Migration: 052_phone_match_key_national
-- Description: phone_match_key() pasa a devolver el número nacional argentino de 10 dígitos
--   (código de área + abonado), sin importar cómo esté guardado el teléfono. La versión de 050
--   solo colapsaba '+549' → '+54' y suponía valores ya normalizados a E.164, pero hay teléfonos
--   guardados crudos (import del CRM, cargas viejas): '1122334455' no coincidía con
--   '+5491122334455'.
--
--   Pasos, sobre los dígitos del valor:
--     1. '00' inicial (prefijo internacional)         0054 9 11 ...      → 54 9 11 ...
--     2. código de país 54 y 9 de móvil opcional      54 9 1122334455    → 1122334455
--     3. 0 troncal nacional                           0 1122334455       → 1122334455
--     4. AMBA con 0/15                                0 11 15 22334455   → 1122334455
--
--   Ejemplos que dan '1122334455': '+5491122334455', '+541122334455', '1122334455',
--   '11 2233-4455', '01122334455', '011 15 2233-4455', '11 15 2233 4455'.
--   No se resuelven (código de área ambiguo): el 15 en áreas del interior ('351 15 1234567') y
--   los números de 8 dígitos sin código de área. Esos los normaliza a E.164 el script
--   src/infrastructure/database/scripts/normalize-phones.ts (libphonenumber).
--
--   Números de otros países: quedan como sus dígitos, sin colisionar con los argentinos.
--   Espejo en TS: phoneMatchKey() en shared/utils/phone.ts (mantener iguales).
--
--   El índice de expresión depende del cuerpo de la función: CREATE OR REPLACE no lo
--   recalcula, por eso el REINDEX.
--
-- Created: 2026-11-17

CREATE OR REPLACE FUNCTION phone_match_key(p TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^00', ''),
               '^549?(\d{10})$', '\1'),
             '^0(\d{10})$', '\1'),
           '^0?1115(\d{8})$', '11\1')
$$;

REINDEX INDEX idx_users_phone_match_key;

-- Rollback SQL (commented for reference): vuelve a la versión de 050
-- CREATE OR REPLACE FUNCTION phone_match_key(p TEXT) RETURNS TEXT
-- LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
--   SELECT regexp_replace(p, '^\+549', '+54')
-- $$;
-- REINDEX INDEX idx_users_phone_match_key;
