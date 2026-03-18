-- 029_create_refresh_tokens.sql
-- Description: Persist refresh tokens for rotation and revocation

CREATE TABLE refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE, -- SHA-256 del token, nunca el token plano
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,                 -- NULL = activo
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Búsqueda por hash (en cada refresh y logout)
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

-- Búsqueda por usuario (para revocar todas las sesiones)
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);

-- Cleanup eficiente por fecha
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- Rollback:
-- DROP INDEX IF EXISTS idx_refresh_tokens_expires_at;
-- DROP INDEX IF EXISTS idx_refresh_tokens_user_id;
-- DROP INDEX IF EXISTS idx_refresh_tokens_token_hash;
-- DROP TABLE IF EXISTS refresh_tokens;
