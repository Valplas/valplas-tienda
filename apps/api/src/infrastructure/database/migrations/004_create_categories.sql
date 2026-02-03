-- Migration: 004_create_categories
-- Description: Create categories table with hierarchical structure
-- Created: 2026-02-01

CREATE TABLE categories (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Self-referencing foreign key for hierarchy
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,

  -- Category info
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  image_url VARCHAR(500),

  -- Ordering
  display_order INTEGER NOT NULL DEFAULT 0,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes
CREATE INDEX idx_categories_slug ON categories(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_categories_parent_id ON categories(parent_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_categories_active ON categories(is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_categories_display_order ON categories(display_order) WHERE deleted_at IS NULL;

-- Apply updated_at trigger
CREATE TRIGGER update_categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Rollback SQL (commented for reference)
-- DROP TRIGGER IF EXISTS update_categories_updated_at ON categories;
-- DROP TABLE IF EXISTS categories CASCADE;
