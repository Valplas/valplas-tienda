import type { PoolClient } from 'pg';
import { query } from '../../../infrastructure/database/client.js';

export interface ProductImageRow {
  id: string;
  productId: string;
  url: string;
  altText: string | null;
  displayOrder: number;
  isPrimary: boolean;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface NewProductImage {
  productId: string;
  url: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  altText?: string | null;
  displayOrder: number;
  isPrimary: boolean;
}

/** Handle mínimo para poder recibir tanto `pool` (fuera de transacción) como el `client` de `transaction()`. */
type DbHandle = Pick<PoolClient, 'query'>;

interface RawImageRow {
  id: string;
  product_id: string;
  url: string;
  alt_text: string | null;
  display_order: number;
  is_primary: boolean;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

function mapImage(row: RawImageRow): ProductImageRow {
  return {
    id: row.id,
    productId: row.product_id,
    url: row.url,
    altText: row.alt_text,
    displayOrder: row.display_order,
    isPrimary: row.is_primary,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    createdAt: row.created_at
  };
}

export async function countImagesForProduct(productId: string): Promise<number> {
  const result = await query<{ count: string }>(
    'SELECT COUNT(*) as count FROM product_images WHERE product_id = $1',
    [productId]
  );
  return parseInt(result.rows[0].count, 10);
}

export async function findImageById(imageId: string): Promise<ProductImageRow | null> {
  const result = await query<RawImageRow>('SELECT * FROM product_images WHERE id = $1', [imageId]);
  return result.rows[0] ? mapImage(result.rows[0]) : null;
}

export async function findImagesByIds(
  productId: string,
  imageIds: string[]
): Promise<ProductImageRow[]> {
  const result = await query<RawImageRow>(
    'SELECT * FROM product_images WHERE product_id = $1 AND id = ANY($2)',
    [productId, imageIds]
  );
  return result.rows.map(mapImage);
}

export async function insertImage(db: DbHandle, data: NewProductImage): Promise<ProductImageRow> {
  const result = await db.query<RawImageRow>(
    `INSERT INTO product_images (
      product_id, url, alt_text, display_order, is_primary,
      storage_path, mime_type, size_bytes, width, height
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      data.productId,
      data.url,
      data.altText ?? null,
      data.displayOrder,
      data.isPrimary,
      data.storagePath,
      data.mimeType,
      data.sizeBytes,
      data.width,
      data.height
    ]
  );
  return mapImage(result.rows[0]);
}

export async function deleteImage(db: DbHandle, imageId: string): Promise<void> {
  await db.query('DELETE FROM product_images WHERE id = $1', [imageId]);
}

/**
 * Promueve la siguiente imagen (por display_order) a primary. El trigger
 * ensure_single_primary_image (migración 007) solo dispara en INSERT/UPDATE,
 * no en DELETE, así que borrar la primary requiere esta re-promoción explícita.
 */
export async function promoteNextPrimary(db: DbHandle, productId: string): Promise<void> {
  await db.query(
    `UPDATE product_images
     SET is_primary = true
     WHERE id = (
       SELECT id FROM product_images
       WHERE product_id = $1
       ORDER BY display_order ASC
       LIMIT 1
     )`,
    [productId]
  );
}

export async function reorderImages(
  db: DbHandle,
  productId: string,
  imageIds: string[]
): Promise<void> {
  for (const [index, imageId] of imageIds.entries()) {
    await db.query(
      `UPDATE product_images
       SET display_order = $1, is_primary = $2
       WHERE id = $3 AND product_id = $4`,
      [index, index === 0, imageId, productId]
    );
  }
}
