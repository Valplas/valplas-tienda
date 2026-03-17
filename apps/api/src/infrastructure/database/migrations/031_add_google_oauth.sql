-- Migration 031: Add Google OAuth support
-- Adds google_id column and makes password_hash/username optional for OAuth users

ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;

-- OAuth users don't have a password
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- OAuth users may not have a username initially
ALTER TABLE users ALTER COLUMN username DROP NOT NULL;

-- Rollback:
-- ALTER TABLE users DROP COLUMN IF EXISTS google_id;
-- ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;
-- ALTER TABLE users ALTER COLUMN username SET NOT NULL;
