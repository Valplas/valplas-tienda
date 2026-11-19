-- Migration: 051_create_outbound_webhook_events
-- Description: Outbox transaccional de webhooks salientes hacia canales externos (bot de
--   WhatsApp). Un trigger en orders encola un evento en la MISMA transacción que cambia el
--   estado, así ningún camino (webhook de Mercado Pago, admin, job de órdenes vencidas,
--   cancelación desde el bot) se olvida de avisar y un reinicio del server no pierde eventos.
--   El job infrastructure/jobs/deliver-bot-webhooks.job.ts los entrega con reintentos.
--
--   Solo encola órdenes con sales_channel = 'whatsapp'.
--
-- Created: 2026-11-16

CREATE TABLE IF NOT EXISTS outbound_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel sales_channel NOT NULL,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ NULL,
  failed_at TIMESTAMPTZ NULL,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cola de pendientes: lo que el job reclama en cada corrida
CREATE INDEX IF NOT EXISTS idx_outbound_webhook_events_pending
  ON outbound_webhook_events (next_attempt_at)
  WHERE delivered_at IS NULL AND failed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_outbound_webhook_events_order_id
  ON outbound_webhook_events (order_id);

-- Las tablas nuevas no heredan el RLS de la migración 044
ALTER TABLE outbound_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION enqueue_order_status_webhook()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO outbound_webhook_events (channel, order_id, event_type, payload)
  VALUES (
    NEW.sales_channel,
    NEW.id,
    'order.status_changed',
    jsonb_build_object(
      'order_id', NEW.id,
      'order_number', NEW.order_number,
      'status', NEW.status,
      'previous_status', OLD.status,
      'total', NEW.total,
      'occurred_at', NOW()
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enqueue_order_status_webhook ON orders;
CREATE TRIGGER trg_enqueue_order_status_webhook
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  WHEN (NEW.sales_channel = 'whatsapp' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION enqueue_order_status_webhook();

-- Rollback SQL (commented for reference)
-- DROP TRIGGER IF EXISTS trg_enqueue_order_status_webhook ON orders;
-- DROP FUNCTION IF EXISTS enqueue_order_status_webhook();
-- DROP TABLE IF EXISTS outbound_webhook_events;
