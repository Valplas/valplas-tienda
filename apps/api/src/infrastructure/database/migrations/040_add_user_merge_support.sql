-- Migration 040: soporte para merge de cuentas (Google ↔ legacy del CRM)
--
-- - users.is_legacy: cuenta migrada del CRM (lo setea tools/migration/src/migrate-clients.ts)
-- - users.merged_into_id / merged_at: trazabilidad de la cuenta absorbida en un merge
-- - user_merge_dismissals: pares sugeridos que el admin marcó como "No es la misma persona"
-- - normalize_street(): normalización de calles para sugerir duplicados por dirección

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_legacy BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS merged_into_id UUID NULL REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_users_merged_into
  ON users(merged_into_id) WHERE merged_into_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_legacy
  ON users(is_legacy) WHERE is_legacy = true AND deleted_at IS NULL;

-- Backfill: cuentas migradas del CRM presentes hoy (email placeholder del script)
UPDATE users SET is_legacy = true
WHERE role = 'customer' AND email LIKE '%@sinmail.local';

CREATE TABLE IF NOT EXISTS user_merge_dismissals (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  legacy_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dismissed_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, legacy_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_merge_dismissals_legacy
  ON user_merge_dismissals(legacy_user_id);
CREATE INDEX IF NOT EXISTS idx_user_merge_dismissals_dismissed_by
  ON user_merge_dismissals(dismissed_by);

-- STABLE (no IMMUTABLE) porque unaccent() es STABLE
CREATE OR REPLACE FUNCTION normalize_street(p TEXT) RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT trim(regexp_replace(
    regexp_replace(
      regexp_replace(unaccent(lower(coalesce(p, ''))), '[^a-z0-9 ]', ' ', 'g'),
      '^\s*(av|avda|avenida|calle|pje|pasaje|bv|boulevard)\s+', '', 'g'),
    '\s+', ' ', 'g'))
$$;

-- Rollback:
-- DROP FUNCTION IF EXISTS normalize_street(TEXT);
-- DROP TABLE IF EXISTS user_merge_dismissals;
-- DROP INDEX IF EXISTS idx_user_merge_dismissals_dismissed_by;
-- DROP INDEX IF EXISTS idx_user_merge_dismissals_legacy;
-- DROP INDEX IF EXISTS idx_users_legacy;
-- DROP INDEX IF EXISTS idx_users_merged_into;
-- ALTER TABLE users DROP COLUMN IF EXISTS merged_at;
-- ALTER TABLE users DROP COLUMN IF EXISTS merged_into_id;
-- ALTER TABLE users DROP COLUMN IF EXISTS is_legacy;
