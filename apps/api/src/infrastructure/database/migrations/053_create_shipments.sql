-- Migration: 053_create_shipments
-- Description: Integración Andreani. Crea shipments (un envío por pedido, con a lo sumo uno
--   activo) y shipment_events (trazas del carrier, deduplicadas), agrega columnas de envío a
--   orders y registra el carrier externo 'andreani'. varchar+CHECK en vez de enums.
-- Created: 2026-11-21

CREATE TABLE IF NOT EXISTS shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  carrier_code VARCHAR(30) NOT NULL DEFAULT 'andreani',
  service_type VARCHAR(20) NOT NULL
    CHECK (service_type IN ('home_delivery', 'branch_pickup')),
  contract VARCHAR(50) NULL,
  channel VARCHAR(3) NULL CHECK (channel IN ('B2C', 'B2B')),
  status VARCHAR(20) NOT NULL DEFAULT 'requesting'
    CHECK (status IN ('requesting', 'pending', 'created', 'rejected', 'in_transit',
      'out_for_delivery', 'ready_for_pickup', 'delivery_failed', 'delivered', 'returning',
      'returned', 'incident', 'cancelling', 'cancelled', 'error', 'expired')),
  tracking_number VARCHAR(50) NULL,
  group_number VARCHAR(50) NULL,
  andreani_state VARCHAR(100) NULL,
  destination_branch JSONB NULL,
  localidad VARCHAR(100) NULL,
  packages JSONB NOT NULL DEFAULT '[]',
  request_payload JSONB NULL,
  raw_response JSONB NULL,
  quoted_price NUMERIC(12, 2) NULL,
  label_url TEXT NULL,
  last_event VARCHAR(100) NULL,
  last_event_at TIMESTAMPTZ NULL,
  estimated_delivery_at TIMESTAMPTZ NULL,
  delivered_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  error_message TEXT NULL,
  next_poll_at TIMESTAMPTZ NULL,
  poll_failures INTEGER NOT NULL DEFAULT 0,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un solo envío activo por pedido
CREATE UNIQUE INDEX IF NOT EXISTS idx_shipments_one_active_per_order
  ON shipments (order_id)
  WHERE status NOT IN ('cancelled', 'rejected', 'error', 'expired');

CREATE INDEX IF NOT EXISTS idx_shipments_order_id ON shipments (order_id);

-- Cola de polling de tracking
CREATE INDEX IF NOT EXISTS idx_shipments_next_poll
  ON shipments (next_poll_at)
  WHERE status NOT IN ('delivered', 'returned', 'cancelled', 'rejected', 'error', 'expired');

CREATE TABLE IF NOT EXISTS shipment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL,
  cycle VARCHAR(50) NULL,
  event VARCHAR(100) NOT NULL,
  reason VARCHAR(255) NULL,
  sub_reason VARCHAR(255) NULL,
  status_label VARCHAR(255) NULL,
  branch_name VARCHAR(255) NULL,
  branch_id VARCHAR(50) NULL,
  comment TEXT NULL,
  source VARCHAR(10) NOT NULL CHECK (source IN ('pull', 'push', 'mock')),
  raw JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipment_events_shipment
  ON shipment_events (shipment_id, occurred_at);

-- Dedupe: insertar con ON CONFLICT DO NOTHING RETURNING * devuelve solo eventos nuevos
CREATE UNIQUE INDEX IF NOT EXISTS idx_shipment_events_dedupe
  ON shipment_events (shipment_id, event, occurred_at, COALESCE(reason, ''));

-- Columnas de envío en orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_method VARCHAR(20) NOT NULL DEFAULT 'home_delivery'
    CHECK (shipping_method IN ('home_delivery', 'branch_pickup')),
  ADD COLUMN IF NOT EXISTS pickup_branch JSONB NULL,
  ADD COLUMN IF NOT EXISTS recipient_document VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ NULL;

-- Las tablas nuevas no heredan el RLS de la migración 044
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_events ENABLE ROW LEVEL SECURITY;

INSERT INTO shipping_carriers (name, code, is_active, is_external)
VALUES ('Andreani', 'andreani', true, true)
ON CONFLICT (code) DO UPDATE SET is_external = true;

-- Rollback SQL (commented for reference)
-- DROP TABLE IF EXISTS shipment_events;
-- DROP TABLE IF EXISTS shipments;
-- ALTER TABLE orders DROP COLUMN IF EXISTS shipped_at, DROP COLUMN IF EXISTS recipient_document,
--   DROP COLUMN IF EXISTS pickup_branch, DROP COLUMN IF EXISTS shipping_method;
-- DELETE FROM shipping_carriers WHERE code = 'andreani';
