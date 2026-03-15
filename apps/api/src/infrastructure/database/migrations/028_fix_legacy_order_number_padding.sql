-- Migration: 028_fix_legacy_order_number_padding
-- Description: Pad the sequence part of legacy order numbers to 6 digits
--   VLP-20260314-2502 → VLP-20260314-002502
-- Created: 2026-03-15

UPDATE orders
SET order_number =
  split_part(order_number, '-', 1) || '-' ||
  split_part(order_number, '-', 2) || '-' ||
  lpad(split_part(order_number, '-', 3), 6, '0')
WHERE length(split_part(order_number, '-', 3)) < 6;

-- Rollback SQL (commented for reference):
-- No safe rollback — original padding is lost. Restore from backup if needed.
