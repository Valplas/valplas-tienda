-- Migration 032: Create product_price_tiers
-- Defines pricing tiers per product: each tier maps a min_quantity to a price_list.
-- Formula: unit_price = ROUND(p.cost_price::numeric * (1 + pl.margin / 100))::integer
-- Tiers coexist with manual admin orders (order_items.price_list_id is independent).

CREATE TABLE product_price_tiers (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id     UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price_list_id  UUID        NOT NULL REFERENCES price_lists(id) ON DELETE RESTRICT,
  min_quantity   INTEGER     NOT NULL CHECK (min_quantity >= 1),
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, min_quantity)
);

CREATE INDEX idx_product_price_tiers_product_id ON product_price_tiers(product_id)
  WHERE is_active = true;

CREATE TRIGGER set_product_price_tiers_updated_at
  BEFORE UPDATE ON product_price_tiers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Rollback:
-- DROP TRIGGER IF EXISTS set_product_price_tiers_updated_at ON product_price_tiers;
-- DROP TABLE IF EXISTS product_price_tiers CASCADE;
