-- Migration: 054_trim_catalog_names
-- Description: Catálogo v2. Limpia espacios sobrantes ya almacenados: recorta los extremos y
--   colapsa espacios internos repetidos en products/categories/brands.name, y recorta products.sku.
--   Complementa el trim global de inputs (los datos nuevos ya entran limpios).
-- Created: 2026-11-23

UPDATE products
SET name = regexp_replace(btrim(name), '\s+', ' ', 'g')
WHERE name <> regexp_replace(btrim(name), '\s+', ' ', 'g');

UPDATE categories
SET name = regexp_replace(btrim(name), '\s+', ' ', 'g')
WHERE name <> regexp_replace(btrim(name), '\s+', ' ', 'g');

UPDATE brands
SET name = regexp_replace(btrim(name), '\s+', ' ', 'g')
WHERE name <> regexp_replace(btrim(name), '\s+', ' ', 'g');

UPDATE products
SET sku = btrim(sku)
WHERE sku <> btrim(sku);

-- Rollback: irreversible (datos); no aplica.
