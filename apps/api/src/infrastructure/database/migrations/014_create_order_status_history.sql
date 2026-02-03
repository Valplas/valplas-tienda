-- Migration: 014_create_order_status_history
-- Description: Create order status history table
-- Created: 2026-02-03

-- ============================================================================
-- TABLE: order_status_history
-- ============================================================================
CREATE TABLE IF NOT EXISTS order_status_history (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Foreign key to orders
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- Status (should match order_status enum)
  status VARCHAR(50) NOT NULL,

  -- Notes about the status change
  notes TEXT,

  -- Who changed the status (user_id)
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_status ON order_status_history(status);
CREATE INDEX IF NOT EXISTS idx_order_status_history_created ON order_status_history(created_at);

-- Rollback SQL (commented for reference)
-- DROP TABLE IF EXISTS order_status_history CASCADE;
