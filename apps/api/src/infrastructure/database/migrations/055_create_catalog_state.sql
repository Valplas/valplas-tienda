-- Migration: 055_create_catalog_state
-- Description: Versión global del catálogo. catalog_state guarda un contador que sube cada vez
--   que cambia algo que afecta lo que ve el bot (productos, tiers, listas de precios,
--   categorías, marcas, imágenes). El bot consulta GET /api/bot/catalog/status y solo
--   re-descarga el catálogo cuando catalogVersion cambia.
--
--   Triggers de sentencia con transition tables (un trigger por evento, porque una transition
--   table admite un solo evento y no admite lista de columnas). Si la sentencia no tocó filas
--   (p. ej. UPDATE ... WHERE false) no se sube la versión.
--
--   Concurrencia: el UPDATE de catalog_state toma el lock de la fila hasta el commit, así que
--   dos transacciones que tocan el catálogo (p. ej. dos órdenes reservando stock) se serializan
--   en ese punto. Aceptable con el volumen actual.
--
-- Created: 2026-11-23

CREATE TABLE IF NOT EXISTS catalog_state (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  version BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO catalog_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Las tablas nuevas no heredan el RLS de la migración 044
ALTER TABLE catalog_state ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION bump_catalog_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM changed_rows) THEN RETURN NULL; END IF;
  UPDATE catalog_state SET version = version + 1, updated_at = NOW() WHERE id = 1;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS products_catalog_bump_ins ON products;
CREATE TRIGGER products_catalog_bump_ins AFTER INSERT ON products
  REFERENCING NEW TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION bump_catalog_version();

DROP TRIGGER IF EXISTS products_catalog_bump_upd ON products;
CREATE TRIGGER products_catalog_bump_upd AFTER UPDATE ON products
  REFERENCING NEW TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION bump_catalog_version();

DROP TRIGGER IF EXISTS products_catalog_bump_del ON products;
CREATE TRIGGER products_catalog_bump_del AFTER DELETE ON products
  REFERENCING OLD TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION bump_catalog_version();

DROP TRIGGER IF EXISTS product_price_tiers_catalog_bump_ins ON product_price_tiers;
CREATE TRIGGER product_price_tiers_catalog_bump_ins AFTER INSERT ON product_price_tiers
  REFERENCING NEW TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION bump_catalog_version();

DROP TRIGGER IF EXISTS product_price_tiers_catalog_bump_upd ON product_price_tiers;
CREATE TRIGGER product_price_tiers_catalog_bump_upd AFTER UPDATE ON product_price_tiers
  REFERENCING NEW TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION bump_catalog_version();

DROP TRIGGER IF EXISTS product_price_tiers_catalog_bump_del ON product_price_tiers;
CREATE TRIGGER product_price_tiers_catalog_bump_del AFTER DELETE ON product_price_tiers
  REFERENCING OLD TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION bump_catalog_version();

DROP TRIGGER IF EXISTS price_lists_catalog_bump_ins ON price_lists;
CREATE TRIGGER price_lists_catalog_bump_ins AFTER INSERT ON price_lists
  REFERENCING NEW TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION bump_catalog_version();

DROP TRIGGER IF EXISTS price_lists_catalog_bump_upd ON price_lists;
CREATE TRIGGER price_lists_catalog_bump_upd AFTER UPDATE ON price_lists
  REFERENCING NEW TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION bump_catalog_version();

DROP TRIGGER IF EXISTS price_lists_catalog_bump_del ON price_lists;
CREATE TRIGGER price_lists_catalog_bump_del AFTER DELETE ON price_lists
  REFERENCING OLD TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION bump_catalog_version();

DROP TRIGGER IF EXISTS categories_catalog_bump_ins ON categories;
CREATE TRIGGER categories_catalog_bump_ins AFTER INSERT ON categories
  REFERENCING NEW TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION bump_catalog_version();

DROP TRIGGER IF EXISTS categories_catalog_bump_upd ON categories;
CREATE TRIGGER categories_catalog_bump_upd AFTER UPDATE ON categories
  REFERENCING NEW TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION bump_catalog_version();

DROP TRIGGER IF EXISTS categories_catalog_bump_del ON categories;
CREATE TRIGGER categories_catalog_bump_del AFTER DELETE ON categories
  REFERENCING OLD TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION bump_catalog_version();

DROP TRIGGER IF EXISTS brands_catalog_bump_ins ON brands;
CREATE TRIGGER brands_catalog_bump_ins AFTER INSERT ON brands
  REFERENCING NEW TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION bump_catalog_version();

DROP TRIGGER IF EXISTS brands_catalog_bump_upd ON brands;
CREATE TRIGGER brands_catalog_bump_upd AFTER UPDATE ON brands
  REFERENCING NEW TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION bump_catalog_version();

DROP TRIGGER IF EXISTS brands_catalog_bump_del ON brands;
CREATE TRIGGER brands_catalog_bump_del AFTER DELETE ON brands
  REFERENCING OLD TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION bump_catalog_version();

DROP TRIGGER IF EXISTS product_images_catalog_bump_ins ON product_images;
CREATE TRIGGER product_images_catalog_bump_ins AFTER INSERT ON product_images
  REFERENCING NEW TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION bump_catalog_version();

DROP TRIGGER IF EXISTS product_images_catalog_bump_upd ON product_images;
CREATE TRIGGER product_images_catalog_bump_upd AFTER UPDATE ON product_images
  REFERENCING NEW TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION bump_catalog_version();

DROP TRIGGER IF EXISTS product_images_catalog_bump_del ON product_images;
CREATE TRIGGER product_images_catalog_bump_del AFTER DELETE ON product_images
  REFERENCING OLD TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION bump_catalog_version();

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS products_catalog_bump_ins ON products;
-- DROP TRIGGER IF EXISTS products_catalog_bump_upd ON products;
-- DROP TRIGGER IF EXISTS products_catalog_bump_del ON products;
-- DROP TRIGGER IF EXISTS product_price_tiers_catalog_bump_ins ON product_price_tiers;
-- DROP TRIGGER IF EXISTS product_price_tiers_catalog_bump_upd ON product_price_tiers;
-- DROP TRIGGER IF EXISTS product_price_tiers_catalog_bump_del ON product_price_tiers;
-- DROP TRIGGER IF EXISTS price_lists_catalog_bump_ins ON price_lists;
-- DROP TRIGGER IF EXISTS price_lists_catalog_bump_upd ON price_lists;
-- DROP TRIGGER IF EXISTS price_lists_catalog_bump_del ON price_lists;
-- DROP TRIGGER IF EXISTS categories_catalog_bump_ins ON categories;
-- DROP TRIGGER IF EXISTS categories_catalog_bump_upd ON categories;
-- DROP TRIGGER IF EXISTS categories_catalog_bump_del ON categories;
-- DROP TRIGGER IF EXISTS brands_catalog_bump_ins ON brands;
-- DROP TRIGGER IF EXISTS brands_catalog_bump_upd ON brands;
-- DROP TRIGGER IF EXISTS brands_catalog_bump_del ON brands;
-- DROP TRIGGER IF EXISTS product_images_catalog_bump_ins ON product_images;
-- DROP TRIGGER IF EXISTS product_images_catalog_bump_upd ON product_images;
-- DROP TRIGGER IF EXISTS product_images_catalog_bump_del ON product_images;
-- DROP FUNCTION IF EXISTS bump_catalog_version();
-- DROP TABLE IF EXISTS catalog_state;
