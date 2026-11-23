-- Migration: 056_catalog_bump_at_commit
-- Description: Reemplaza los triggers de sentencia de 055 por triggers de restricción
--   DEFERRABLE INITIALLY DEFERRED a nivel de fila, que suben la versión del catálogo en el COMMIT.
--
--   Por qué: con 055 el UPDATE de catalog_state corría al final de la primera sentencia que
--   tocaba el catálogo y el lock de esa fila se sostenía hasta el commit. Eso (1) generaba
--   deadlocks (40P01) con transacciones multi-sentencia que toman locks de productos en otro
--   orden (checkout con varios ítems, edición admin, webhook de pago) y (2) mantenía el lock
--   global durante llamadas HTTP externas dentro de transaction() (imágenes en Supabase Storage).
--   Al diferir al commit, el lock de catalog_state es siempre el ÚLTIMO que se toma y no se
--   sostiene entre sentencias ni durante I/O.
--
--   Un trigger de fila solo dispara para filas realmente afectadas (un UPDATE ... WHERE false no
--   sube la versión) y la función sube la versión a lo sumo una vez por transacción
--   (flag valplas.catalog_bumped, local a la transacción).
--
-- Created: 2026-11-23

DROP TRIGGER IF EXISTS products_catalog_bump_ins ON products;
DROP TRIGGER IF EXISTS products_catalog_bump_upd ON products;
DROP TRIGGER IF EXISTS products_catalog_bump_del ON products;
DROP TRIGGER IF EXISTS product_price_tiers_catalog_bump_ins ON product_price_tiers;
DROP TRIGGER IF EXISTS product_price_tiers_catalog_bump_upd ON product_price_tiers;
DROP TRIGGER IF EXISTS product_price_tiers_catalog_bump_del ON product_price_tiers;
DROP TRIGGER IF EXISTS price_lists_catalog_bump_ins ON price_lists;
DROP TRIGGER IF EXISTS price_lists_catalog_bump_upd ON price_lists;
DROP TRIGGER IF EXISTS price_lists_catalog_bump_del ON price_lists;
DROP TRIGGER IF EXISTS categories_catalog_bump_ins ON categories;
DROP TRIGGER IF EXISTS categories_catalog_bump_upd ON categories;
DROP TRIGGER IF EXISTS categories_catalog_bump_del ON categories;
DROP TRIGGER IF EXISTS brands_catalog_bump_ins ON brands;
DROP TRIGGER IF EXISTS brands_catalog_bump_upd ON brands;
DROP TRIGGER IF EXISTS brands_catalog_bump_del ON brands;
DROP TRIGGER IF EXISTS product_images_catalog_bump_ins ON product_images;
DROP TRIGGER IF EXISTS product_images_catalog_bump_upd ON product_images;
DROP TRIGGER IF EXISTS product_images_catalog_bump_del ON product_images;

CREATE OR REPLACE FUNCTION bump_catalog_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('valplas.catalog_bumped', true) = 'on' THEN
    RETURN NULL;
  END IF;
  PERFORM set_config('valplas.catalog_bumped', 'on', true);
  UPDATE catalog_state SET version = version + 1, updated_at = clock_timestamp() WHERE id = 1;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS products_catalog_bump ON products;
CREATE CONSTRAINT TRIGGER products_catalog_bump
  AFTER INSERT OR UPDATE OR DELETE ON products
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION bump_catalog_version();

DROP TRIGGER IF EXISTS product_price_tiers_catalog_bump ON product_price_tiers;
CREATE CONSTRAINT TRIGGER product_price_tiers_catalog_bump
  AFTER INSERT OR UPDATE OR DELETE ON product_price_tiers
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION bump_catalog_version();

DROP TRIGGER IF EXISTS price_lists_catalog_bump ON price_lists;
CREATE CONSTRAINT TRIGGER price_lists_catalog_bump
  AFTER INSERT OR UPDATE OR DELETE ON price_lists
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION bump_catalog_version();

DROP TRIGGER IF EXISTS categories_catalog_bump ON categories;
CREATE CONSTRAINT TRIGGER categories_catalog_bump
  AFTER INSERT OR UPDATE OR DELETE ON categories
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION bump_catalog_version();

DROP TRIGGER IF EXISTS brands_catalog_bump ON brands;
CREATE CONSTRAINT TRIGGER brands_catalog_bump
  AFTER INSERT OR UPDATE OR DELETE ON brands
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION bump_catalog_version();

DROP TRIGGER IF EXISTS product_images_catalog_bump ON product_images;
CREATE CONSTRAINT TRIGGER product_images_catalog_bump
  AFTER INSERT OR UPDATE OR DELETE ON product_images
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION bump_catalog_version();

-- ROLLBACK (solo quita los triggers nuevos; volver a los de sentencia de 055 es manual,
--   recreándolos a mano junto con la versión de sentencia de bump_catalog_version()):
-- DROP TRIGGER IF EXISTS products_catalog_bump ON products;
-- DROP TRIGGER IF EXISTS product_price_tiers_catalog_bump ON product_price_tiers;
-- DROP TRIGGER IF EXISTS price_lists_catalog_bump ON price_lists;
-- DROP TRIGGER IF EXISTS categories_catalog_bump ON categories;
-- DROP TRIGGER IF EXISTS brands_catalog_bump ON brands;
-- DROP TRIGGER IF EXISTS product_images_catalog_bump ON product_images;
