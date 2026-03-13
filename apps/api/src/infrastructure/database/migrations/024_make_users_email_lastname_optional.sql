-- Migration: 024_make_users_email_lastname_optional
-- Description: Make email and last_name nullable to support admin-created users without email
-- Created: 2026-03-12

ALTER TABLE users
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN last_name DROP NOT NULL,
  ALTER COLUMN last_name SET DEFAULT '';

-- Rollback SQL (commented for reference)
-- ALTER TABLE users
--   ALTER COLUMN email SET NOT NULL,
--   ALTER COLUMN last_name SET NOT NULL,
--   ALTER COLUMN last_name DROP DEFAULT;
