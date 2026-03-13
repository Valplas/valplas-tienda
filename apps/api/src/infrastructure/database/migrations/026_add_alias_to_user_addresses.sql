-- Migration: 026_add_alias_to_user_addresses
-- Description: Add alias column to user_addresses (e.g. "Casa", "Trabajo")
-- Created: 2026-03-13

ALTER TABLE user_addresses
  ADD COLUMN alias VARCHAR(100);

-- Rollback SQL (commented for reference)
-- ALTER TABLE user_addresses DROP COLUMN IF EXISTS alias;
