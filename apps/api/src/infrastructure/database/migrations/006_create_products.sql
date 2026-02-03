-- Migration: 006_create_products
-- Description: Create products table with stock management (CRITICAL)
-- Created: 2026-02-01

CREATE TABLE products (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Foreign keys
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,

  -- Product identifiers
  sku VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,

  -- Product info
  description TEXT,

  -- Pricing (in cents - INTEGER for precision)
  base_price INTEGER NOT NULL CHECK (base_price >= 0),

  -- Stock management
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  reserved_stock INTEGER NOT NULL DEFAULT 0 CHECK (reserved_stock >= 0),

  -- Flags
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE,

  -- Constraints
  CONSTRAINT stock_consistency CHECK (reserved_stock <= stock)
);

-- Create critical indexes for performance
CREATE INDEX idx_products_slug ON products(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_sku ON products(sku) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_category_id ON products(category_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_brand_id ON products(brand_id) WHERE deleted_at IS NULL AND brand_id IS NOT NULL;
CREATE INDEX idx_products_base_price ON products(base_price) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_stock ON products(stock) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_featured ON products(is_featured) WHERE deleted_at IS NULL AND is_featured = true;
CREATE INDEX idx_products_active ON products(is_active) WHERE deleted_at IS NULL;

-- Create trigram index for fuzzy search on name
CREATE INDEX idx_products_name_trgm ON products USING gin(name gin_trgm_ops) WHERE deleted_at IS NULL;

-- Apply updated_at trigger
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Rollback SQL (commented for reference)
-- DROP TRIGGER IF EXISTS update_products_updated_at ON products;
-- DROP TABLE IF EXISTS products CASCADE;
