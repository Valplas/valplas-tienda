-- Migration 027: Enable unaccent extension for accent-insensitive search
-- Allows searching "marmol" to match "mármol", etc.

-- Up
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Rollback (do not run unless you want to remove the extension)
-- DROP EXTENSION IF EXISTS unaccent;
