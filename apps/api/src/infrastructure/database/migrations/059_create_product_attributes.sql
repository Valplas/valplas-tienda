-- Migration: 059_create_product_attributes
-- Description: Diccionario de atributos de producto (micrones, gramaje, ...), su asignación a
--   categorías (claves precargadas en el formulario) y los valores por producto.
--   Son medidas/especificaciones del producto, NO las dimensiones de envío products.width/height/length.
--   Cada tabla sube la versión del catálogo al commit (patrón de 056).
-- Created: 2026-11-23

DO $$ BEGIN
  CREATE TYPE attribute_value_type AS ENUM ('number', 'text', 'option');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS attribute_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(40) NOT NULL UNIQUE,
  label VARCHAR(60) NOT NULL,
  value_type attribute_value_type NOT NULL,
  unit VARCHAR(20),
  options TEXT[],
  aliases TEXT[] NOT NULL DEFAULT '{}',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT attribute_definitions_key_format CHECK (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  CONSTRAINT attribute_definitions_options_only_option CHECK (
    (value_type = 'option' AND options IS NOT NULL AND cardinality(options) > 0)
    OR (value_type <> 'option' AND options IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS category_attributes (
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  attribute_id UUID NOT NULL REFERENCES attribute_definitions(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (category_id, attribute_id)
);
CREATE INDEX IF NOT EXISTS idx_category_attributes_attribute ON category_attributes(attribute_id);

CREATE TABLE IF NOT EXISTS product_attribute_values (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  attribute_id UUID NOT NULL REFERENCES attribute_definitions(id) ON DELETE RESTRICT,
  value_number NUMERIC(14,4),
  value_text VARCHAR(120),
  PRIMARY KEY (product_id, attribute_id),
  CONSTRAINT product_attribute_values_exactly_one CHECK (
    (value_number IS NOT NULL AND value_text IS NULL)
    OR (value_number IS NULL AND value_text IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_pav_attribute_number ON product_attribute_values(attribute_id, value_number);
CREATE INDEX IF NOT EXISTS idx_pav_attribute_text ON product_attribute_values(attribute_id, lower(value_text));

-- Las tablas nuevas no heredan el RLS de la migración 044
ALTER TABLE attribute_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_attribute_values ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS attribute_definitions_catalog_bump ON attribute_definitions;
CREATE CONSTRAINT TRIGGER attribute_definitions_catalog_bump
  AFTER INSERT OR UPDATE OR DELETE ON attribute_definitions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION bump_catalog_version();

DROP TRIGGER IF EXISTS category_attributes_catalog_bump ON category_attributes;
CREATE CONSTRAINT TRIGGER category_attributes_catalog_bump
  AFTER INSERT OR UPDATE OR DELETE ON category_attributes
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION bump_catalog_version();

DROP TRIGGER IF EXISTS product_attribute_values_catalog_bump ON product_attribute_values;
CREATE CONSTRAINT TRIGGER product_attribute_values_catalog_bump
  AFTER INSERT OR UPDATE OR DELETE ON product_attribute_values
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION bump_catalog_version();

INSERT INTO attribute_definitions (key, label, value_type, unit, options, aliases, display_order) VALUES
  ('ancho', 'Ancho', 'number', 'cm', NULL, '{}', 10),
  ('alto', 'Alto', 'number', 'cm', NULL, '{}', 20),
  ('profundidad', 'Profundidad', 'number', 'cm', NULL, '{}', 30),
  ('micrones', 'Micrones', 'number', 'µm', NULL, '{mic,micras,micron}', 40),
  ('largo', 'Largo', 'number', 'm', NULL, '{metros,mts,mt}', 50),
  ('gramaje', 'Gramaje', 'number', 'g/m²', NULL, '{gr,grs,gramos}', 60),
  ('peso', 'Peso', 'number', 'kg', NULL, '{}', 70),
  ('capacidad', 'Capacidad', 'number', 'L', NULL, '{litros,lts,lt}', 80),
  ('color', 'Color', 'text', NULL, NULL, '{}', 90),
  ('talle', 'Talle', 'option', NULL, '{XS,S,M,L,XL,XXL}', '{}', 100)
ON CONFLICT (key) DO NOTHING;

-- ROLLBACK:
-- DROP TABLE IF EXISTS product_attribute_values;
-- DROP TABLE IF EXISTS category_attributes;
-- DROP TABLE IF EXISTS attribute_definitions;
-- DROP TYPE IF EXISTS attribute_value_type;
