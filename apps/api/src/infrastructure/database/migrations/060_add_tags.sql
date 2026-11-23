-- Migration: 060_add_tags
-- Description: Tags (sinónimos editables: "consorcio", "telgopor", "burbuja", "posnet") por producto
--   y por categoría. Los usa la búsqueda del bot; la API pública no los expone.
--   Se guardan normalizados desde la app (minúscula, sin espacios de más, sin duplicados).
-- Created: 2026-11-23

ALTER TABLE products ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE categories ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

-- ROLLBACK:
-- ALTER TABLE categories DROP COLUMN IF EXISTS tags;
-- ALTER TABLE products DROP COLUMN IF EXISTS tags;
