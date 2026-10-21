-- Migration: 041_create_banners_and_store_settings
-- Description: Banners administrables de la home y configuración global de la tienda.
--   banners: imagen PC (3:1) obligatoria + imagen celular (4:3) opcional (si falta,
--   el front usa la de PC). El destino del clic se arma con link_product_id (abre la
--   ficha, tiene prioridad) o link_category_id / link_brand_id (catálogo filtrado).
--   Ningún link = banner sin clic. starts_at / ends_at opcionales (vigencia).
--   storage_path guarda el object key del bucket, igual que product_images (039).
--   store_settings: una sola fila (id = 1) con columnas tipadas; hoy solo el logo.
-- Created: 2026-10-20

CREATE TABLE banners (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Nombre interno (backoffice) y texto alternativo de la imagen
  title VARCHAR(120) NOT NULL,

  -- Imagen PC (obligatoria)
  desktop_image_url VARCHAR(500) NOT NULL,
  desktop_storage_path VARCHAR(500) NOT NULL,
  desktop_width INTEGER NOT NULL,
  desktop_height INTEGER NOT NULL,

  -- Imagen celular (opcional)
  mobile_image_url VARCHAR(500),
  mobile_storage_path VARCHAR(500),
  mobile_width INTEGER,
  mobile_height INTEGER,

  -- Destino del clic
  link_category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  link_brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  link_product_id UUID REFERENCES products(id) ON DELETE SET NULL,

  -- Orden y estado
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Vigencia (NULL = sin límite)
  starts_at TIMESTAMP WITH TIME ZONE,
  ends_at TIMESTAMP WITH TIME ZONE,

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT banners_valid_window CHECK (
    starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at
  ),
  CONSTRAINT banners_mobile_image_complete CHECK (
    (mobile_image_url IS NULL) = (mobile_storage_path IS NULL)
  )
);

CREATE INDEX idx_banners_display_order ON banners(display_order) WHERE deleted_at IS NULL;
CREATE INDEX idx_banners_link_category_id ON banners(link_category_id);
CREATE INDEX idx_banners_link_brand_id ON banners(link_brand_id);
CREATE INDEX idx_banners_link_product_id ON banners(link_product_id);
CREATE INDEX idx_banners_created_by ON banners(created_by);

CREATE TRIGGER update_banners_updated_at
  BEFORE UPDATE ON banners
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE store_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1,

  -- Logo del header
  logo_url VARCHAR(500),
  logo_storage_path VARCHAR(500),
  logo_width INTEGER,
  logo_height INTEGER,

  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT store_settings_single_row CHECK (id = 1)
);

CREATE INDEX idx_store_settings_updated_by ON store_settings(updated_by);

CREATE TRIGGER update_store_settings_updated_at
  BEFORE UPDATE ON store_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

INSERT INTO store_settings (id) VALUES (1);

-- Rollback SQL (comentado para referencia)
-- DROP TRIGGER IF EXISTS update_store_settings_updated_at ON store_settings;
-- DROP TABLE IF EXISTS store_settings;
-- DROP TRIGGER IF EXISTS update_banners_updated_at ON banners;
-- DROP TABLE IF EXISTS banners;
