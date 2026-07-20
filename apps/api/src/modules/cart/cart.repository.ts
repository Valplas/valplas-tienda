import { query } from '../../infrastructure/database/client.js';

export interface TierInfo {
  minQuantity: number;
  unitPrice: number;
}

/**
 * Obtener info de tiers para múltiples ítems del carrito en un solo query.
 * Retorna un Map<"productId:priceListId", TierInfo>
 */
export async function getTiersForCartItems(
  items: Array<{ productId: string; priceListId: string }>
): Promise<Map<string, TierInfo>> {
  if (items.length === 0) return new Map();

  const productIds = items.map((i) => i.productId);
  const priceListIds = items.map((i) => i.priceListId);

  const result = await query<{
    product_id: string;
    price_list_id: string;
    min_quantity: number;
    unit_price: number;
  }>(
    `SELECT ppt.product_id, ppt.price_list_id, ppt.min_quantity,
      TRUNC(
        p.cost_price
        * (1 + pl.margin / 100) * 100
      ) / 100 AS unit_price
     FROM product_price_tiers ppt
     JOIN products p ON ppt.product_id = p.id AND p.deleted_at IS NULL
     JOIN price_lists pl ON ppt.price_list_id = pl.id AND pl.is_active = true AND pl.deleted_at IS NULL
     WHERE ppt.is_active = true
       AND (ppt.product_id, ppt.price_list_id) IN (
         SELECT * FROM unnest($1::uuid[], $2::uuid[])
       )`,
    [productIds, priceListIds]
  );

  const map = new Map<string, TierInfo>();
  for (const row of result.rows) {
    map.set(`${row.product_id}:${row.price_list_id}`, {
      minQuantity: row.min_quantity,
      unitPrice: Number(row.unit_price)
    });
  }
  return map;
}

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
  price: number;
  imageUrl: string | null;
  availableStock: number;
} | null> {
  const result = await query<{
    id: string;
    name: string;
    slug: string;
    sku: string;
    price: number;
    image_url: string | null;
    available_stock: number;
  }>(
    `SELECT
      p.id,
      p.name,
      p.slug,
      p.sku,
      COALESCE(
        (SELECT TRUNC(p.cost_price * (1 + pl.margin / 100) * 100) / 100
         FROM product_price_tiers ppt
         JOIN price_lists pl ON pl.id = ppt.price_list_id
         WHERE ppt.product_id = p.id
           AND ppt.is_active = true
           AND pl.is_active = true
           AND pl.deleted_at IS NULL
         ORDER BY ppt.min_quantity ASC
         LIMIT 1),
        p.cost_price
      ) AS price,
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
    price: Number(row.price),
    imageUrl: row.image_url,
    availableStock: row.available_stock
  };
}

/**
 * Obtener múltiples productos para el carrito
 */
export async function getProductsForCart(productIds: string[]): Promise<
  Array<{
    id: string;
    name: string;
    slug: string;
    sku: string;
    price: number;
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
    price: number;
    image_url: string | null;
    available_stock: number;
  }>(
    `SELECT
      p.id,
      p.name,
      p.slug,
      p.sku,
      COALESCE(
        (SELECT TRUNC(p.cost_price * (1 + pl.margin / 100) * 100) / 100
         FROM product_price_tiers ppt
         JOIN price_lists pl ON pl.id = ppt.price_list_id
         WHERE ppt.product_id = p.id
           AND ppt.is_active = true
           AND pl.is_active = true
           AND pl.deleted_at IS NULL
         ORDER BY ppt.min_quantity ASC
         LIMIT 1),
        p.cost_price
      ) AS price,
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
    price: Number(row.price),
    imageUrl: row.image_url,
    availableStock: row.available_stock
  }));
}
