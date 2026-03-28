-- Migration 035: Create whatsapp_sessions table
-- Stores WhatsApp bot conversation state per phone number

CREATE TABLE whatsapp_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone        VARCHAR(20) UNIQUE NOT NULL,    -- E.164: +5491122334455
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  state        VARCHAR(50) NOT NULL DEFAULT 'idle',
  context      JSONB NOT NULL DEFAULT '{}',
  last_message_id VARCHAR(100),                -- Para idempotencia: evitar procesar el mismo mensaje dos veces
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_sessions_phone ON whatsapp_sessions(phone);
CREATE INDEX idx_whatsapp_sessions_expires_at ON whatsapp_sessions(expires_at);

-- Rollback: DROP TABLE whatsapp_sessions;
