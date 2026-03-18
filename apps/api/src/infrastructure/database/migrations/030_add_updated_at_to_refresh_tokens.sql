-- Migration 030: Add updated_at to refresh_tokens
-- Adds updated_at column and auto-update trigger per project convention

ALTER TABLE refresh_tokens
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Auto-update updated_at on row modification
CREATE TRIGGER set_refresh_tokens_updated_at
  BEFORE UPDATE ON refresh_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Rollback:
-- DROP TRIGGER IF EXISTS set_refresh_tokens_updated_at ON refresh_tokens;
-- ALTER TABLE refresh_tokens DROP COLUMN updated_at;
