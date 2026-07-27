-- Migration: 039_add_storage_metadata_to_product_images
-- Description: Agrega metadata de Supabase Storage a product_images para soportar
--   upload real (antes la tabla solo se leía, no había camino de escritura).
--   storage_path guarda el object key del bucket (necesario para delete/move,
--   no derivable de forma robusta desde `url`). mime_type/size_bytes/width/height
--   se completan en el momento del upload (post-procesamiento con sharp).
-- Created: 2026-07-20

ALTER TABLE product_images
  ADD COLUMN storage_path VARCHAR(500),
  ADD COLUMN mime_type VARCHAR(50),
  ADD COLUMN size_bytes INTEGER,
  ADD COLUMN width INTEGER,
  ADD COLUMN height INTEGER;

-- Rollback SQL (comentado para referencia)
-- ALTER TABLE product_images
--   DROP COLUMN storage_path,
--   DROP COLUMN mime_type,
--   DROP COLUMN size_bytes,
--   DROP COLUMN width,
--   DROP COLUMN height;
