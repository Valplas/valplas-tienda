-- Migration: 008_create_orders
-- Description: Create orders table with address snapshot
-- Created: 2026-02-01

CREATE TABLE orders (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Foreign key to users
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  -- Order identifier (format: VLP-YYYYMMDD-NNNN)
  order_number VARCHAR(20) NOT NULL UNIQUE,

  -- Order status
  status order_status NOT NULL DEFAULT 'pending_payment',

  -- Pricing (in cents - INTEGER for precision)
  subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
  shipping_cost INTEGER NOT NULL DEFAULT 0 CHECK (shipping_cost >= 0),
  total INTEGER NOT NULL CHECK (total >= 0),

  -- Shipping address snapshot (denormalized - NO FK)
  shipping_street VARCHAR(255) NOT NULL,
  shipping_street_number VARCHAR(20) NOT NULL,
  shipping_floor VARCHAR(10),
  shipping_apartment VARCHAR(10),
  shipping_city VARCHAR(100) NOT NULL,
  shipping_province VARCHAR(100) NOT NULL,
  shipping_postcode VARCHAR(10) NOT NULL,
  shipping_latitude DECIMAL(10, 8),
  shipping_longitude DECIMAL(11, 8),
  shipping_notes TEXT,

  -- Payment info
  payment_method VARCHAR(50), -- 'mercadopago', 'cash', etc.
  payment_id VARCHAR(100), -- External payment ID (e.g., MP preference ID)
  paid_at TIMESTAMP WITH TIME ZONE,

  -- Delivery info
  carrier_name VARCHAR(100),
  tracking_number VARCHAR(100),
  delivered_at TIMESTAMP WITH TIME ZONE,

  -- Cancellation info
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancelled_reason TEXT,

  -- Notes
  customer_notes TEXT,
  admin_notes TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_order_number ON orders(order_number);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_orders_payment_id ON orders(payment_id) WHERE payment_id IS NOT NULL;

-- Apply updated_at trigger
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Rollback SQL (commented for reference)
-- DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
-- DROP TABLE IF EXISTS orders CASCADE;
