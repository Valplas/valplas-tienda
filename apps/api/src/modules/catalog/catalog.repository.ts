import { query } from '../../infrastructure/database/client.js';

export interface PriceTier {
  min_quantity: number;
  unit_price: number;
  price_list_id: string;
}

export interface PublicProduct {
  id: string;
  sku: string;
  name: string;
  slug: string;
  image_url: string | null;
  available_stock: number;
  price: number;
  category_id: string;
  brand_id: string | null;
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  tiers: PriceTier[];
}

export type CatalogSort =
  | 'featured'
  | 'price_asc'
  | 'price_desc'
  | 'name_asc'
  | 'name_desc'
  | 'newest';

export interface CatalogFilters {
  search?: string;
  category_id?: string;
  brand_id?: string;
  min_price?: number;
  max_price?: number;
  sort?: CatalogSort;
  page?: number;
  limit?: number;
}

// Precio efectivo de venta: precio del tier unitario (menor min_quantity) o,
// si el producto no tiene lista asignada, cost_price tal cual.
const EFFECTIVE_PRICE_SQL = `COALESCE(
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
)`;

// Mapea la opción de orden a su cláusula SQL. Whitelist estricta: evita
// inyección y valores inválidos caen a 'featured'.
const ORDER_BY_CLAUSE: Record<CatalogSort, string> = {
  featured: 'p.is_featured DESC, p.name ASC',
  price_asc: `${EFFECTIVE_PRICE_SQL} ASC, p.name ASC`,
  price_desc: `${EFFECTIVE_PRICE_SQL} DESC, p.name ASC`,
  name_asc: 'p.name ASC',
  name_desc: 'p.name DESC',
  newest: 'p.created_at DESC'
};

/**
 * Obtener productos públicos con tiers de precio calculados en DB.
 * cost_price y margin nunca se exponen al cliente.
 */
export async function findPublicProducts(
  filters: CatalogFilters
): Promise<{ products: PublicProduct[]; total: number }> {
  const {
    search,
    category_id,
    brand_id,
    min_price,
    max_price,
    sort,
    page = 1,
    limit = 20
  } = filters;
  const offset = (page - 1) * limit;
  const conditions: string[] = [
    'p.deleted_at IS NULL',
    'p.is_active = true',
    '(p.stock - p.reserved_stock) > 0'
  ];
  const filterParams: unknown[] = [];
  let paramIndex = 1;

  if (search) {
    conditions.push(
      `(unaccent(p.name) ILIKE unaccent($${paramIndex}) OR p.sku ILIKE $${paramIndex})`
    );
    filterParams.push(`%${search}%`);
    paramIndex++;
  }

  if (category_id) {
    conditions.push(`p.category_id = $${paramIndex}`);
    filterParams.push(category_id);
    paramIndex++;
  }

  if (brand_id) {
    conditions.push(`p.brand_id = $${paramIndex}`);
    filterParams.push(brand_id);
    paramIndex++;
  }

  if (min_price !== undefined) {
    conditions.push(`${EFFECTIVE_PRICE_SQL} >= $${paramIndex}`);
    filterParams.push(min_price);
    paramIndex++;
  }

  if (max_price !== undefined) {
    conditions.push(`${EFFECTIVE_PRICE_SQL} <= $${paramIndex}`);
    filterParams.push(max_price);
    paramIndex++;
  }

  const where = conditions.join(' AND ');
  const orderBy = ORDER_BY_CLAUSE[sort ?? 'featured'] ?? ORDER_BY_CLAUSE.featured;

  const productsQuery = `
    SELECT
      p.id,
      p.sku,
      p.name,
      p.slug,
      ${EFFECTIVE_PRICE_SQL} AS price,
      (p.stock - p.reserved_stock) AS available_stock,
      p.category_id,
      p.brand_id,
      c.name AS category_name,
      b.name AS brand_name,
      (
        SELECT pi.url
        FROM product_images pi
        WHERE pi.product_id = p.id
        ORDER BY pi.display_order ASC
        LIMIT 1
      ) AS image_url
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN brands b ON b.id = p.brand_id
    WHERE ${where}
    ORDER BY ${orderBy}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  const paginationParams = [...filterParams, limit, offset];

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM products p
    WHERE ${where}
  `;

  const [productsResult, countResult] = await Promise.all([
    query<{
      id: string;
      sku: string;
      name: string;
      slug: string;
      price: number;
      available_stock: number;
      category_id: string;
      brand_id: string | null;
      category_name: string | null;
      brand_name: string | null;
      image_url: string | null;
    }>(productsQuery, paginationParams),
    query<{ total: string }>(countQuery, filterParams)
  ]);

  const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

  if (productsResult.rows.length === 0) {
    return { products: [], total };
  }

  const productIds = productsResult.rows.map((p) => p.id);

  const tiersResult = await query<{
    product_id: string;
    min_quantity: number;
    unit_price: number;
    price_list_id: string;
  }>(
    `SELECT
      ppt.product_id,
      ppt.min_quantity,
      ppt.price_list_id,
      TRUNC(p.cost_price * (1 + pl.margin / 100) * 100) / 100 AS unit_price
    FROM product_price_tiers ppt
    JOIN products p ON p.id = ppt.product_id
    JOIN price_lists pl ON pl.id = ppt.price_list_id
    WHERE ppt.product_id = ANY($1)
      AND ppt.is_active = true
      AND pl.is_active = true
      AND pl.deleted_at IS NULL
    ORDER BY ppt.product_id, ppt.min_quantity ASC`,
    [productIds]
  );

  const tiersByProduct = new Map<string, PriceTier[]>();
  for (const row of tiersResult.rows) {
    if (!tiersByProduct.has(row.product_id)) {
      tiersByProduct.set(row.product_id, []);
    }
    tiersByProduct.get(row.product_id)!.push({
      min_quantity: row.min_quantity,
      unit_price: Number(row.unit_price),
      price_list_id: row.price_list_id
    });
  }

  const products: PublicProduct[] = productsResult.rows.map((row) => ({
    id: row.id,
    sku: row.sku,
    name: row.name,
    slug: row.slug,
    price: Number(row.price),
    available_stock: row.available_stock,
    category_id: row.category_id,
    brand_id: row.brand_id,
    category: row.category_name ? { id: row.category_id, name: row.category_name } : null,
    brand: row.brand_id && row.brand_name ? { id: row.brand_id, name: row.brand_name } : null,
    image_url: row.image_url,
    tiers: tiersByProduct.get(row.id) ?? []
  }));

  return { products, total };
}
