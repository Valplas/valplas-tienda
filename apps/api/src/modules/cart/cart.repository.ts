import { query } from '../../infrastructure/database/client.js';
import type { Product } from '@valplas/shared/types';

/**
 * Obtener stock disponible de un producto
 */
export async function getAvailableStock(productId: string): Promise<number> {
  const result = await query<{ available_stock: number }>(
    `SELECT (stock - reserved_stock) as available_stock
     FROM products
     WHERE id = $1 AND deleted_at IS NULL AND is_active = true`,
    [productId]
  );

  if (!result.rows[0]) {
    return 0;
  }

  return result.rows[0].available_stock;
}

/**
 * Obtener detalles de un producto para el carrito
 */
export async function getProductForCart(productId: string): Promise<{
  id: string;
  name: string;
  slug: string;
  sku: string;
  basePrice: number;
  imageUrl: string | null;
  availableStock: number;
} | null> {
  const result = await query<{
    id: string;
    name: string;
    slug: string;
    sku: string;
    base_price: number;
    image_url: string | null;
    available_stock: number;
  }>(
    `SELECT
      p.id,
      p.name,
      p.slug,
      p.sku,
      p.base_price,
      (p.stock - p.reserved_stock) as available_stock,
      (SELECT url FROM product_images WHERE product_id = p.id AND is_primary = true LIMIT 1) as image_url
     FROM products p
     WHERE p.id = $1 AND p.deleted_at IS NULL AND p.is_active = true`,
    [productId]
  );

  if (!result.rows[0]) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    basePrice: row.base_price,
    imageUrl: row.image_url,
    availableStock: row.available_stock
  };
}

/**
 * Obtener múltiples productos para el carrito
 */
export async function getProductsForCart(
  productIds: string[]
): Promise<
  Array<{
    id: string;
    name: string;
    slug: string;
    sku: string;
    basePrice: number;
    imageUrl: string | null;
    availableStock: number;
  }>
> {
  if (productIds.length === 0) {
    return [];
  }

  const result = await query<{
    id: string;
    name: string;
    slug: string;
    sku: string;
    base_price: number;
    image_url: string | null;
    available_stock: number;
  }>(
    `SELECT
      p.id,
      p.name,
      p.slug,
      p.sku,
      p.base_price,
      (p.stock - p.reserved_stock) as available_stock,
      (SELECT url FROM product_images WHERE product_id = p.id AND is_primary = true LIMIT 1) as image_url
     FROM products p
     WHERE p.id = ANY($1) AND p.deleted_at IS NULL AND p.is_active = true`,
    [productIds]
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    basePrice: row.base_price,
    imageUrl: row.image_url,
    availableStock: row.available_stock
  }));
}
