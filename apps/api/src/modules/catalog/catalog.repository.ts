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
// Se calcula UNA vez por fila con LATERAL y se reutiliza (`ep.tier_price`) en SELECT, filtro y orden;
// antes era un subquery correlacionado repetido hasta 3 veces por fila.
const PRICE_LATERAL = `LEFT JOIN LATERAL (
  SELECT TRUNC(p.cost_price * (1 + pl.margin / 100) * 100) / 100 AS tier_price
  FROM product_price_tiers ppt
  JOIN price_lists pl ON pl.id = ppt.price_list_id
  WHERE ppt.product_id = p.id
    AND ppt.is_active = true
    AND pl.is_active = true
    AND pl.deleted_at IS NULL
  ORDER BY ppt.min_quantity ASC
  LIMIT 1
) ep ON true`;

const EFFECTIVE_PRICE_SQL = 'COALESCE(ep.tier_price, p.cost_price)';

// Mapea la opción de orden a su cláusula SQL. Whitelist estricta: evita
// inyección y valores inválidos caen a 'featured'. `p.id` desempata: sin él el orden
// no es determinista y la paginación por OFFSET puede repetir o saltear productos.
const ORDER_BY_CLAUSE: Record<CatalogSort, string> = {
  featured: 'p.is_featured DESC, p.name ASC, p.id ASC',
  price_asc: `${EFFECTIVE_PRICE_SQL} ASC, p.name ASC, p.id ASC`,
  price_desc: `${EFFECTIVE_PRICE_SQL} DESC, p.name ASC, p.id ASC`,
  name_asc: 'p.name ASC, p.id ASC',
  name_desc: 'p.name DESC, p.id ASC',
  newest: 'p.created_at DESC, p.id ASC'
};

interface CatalogRow {
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
}

/**
 * Obtener productos públicos con tiers de precio calculados en DB.
 * cost_price y margin nunca se exponen al cliente.
 *
 * Paginación en dos pasos para no calcular precio, imagen ni joins de categoría/marca
 * sobre filas que se descartan: (1) página de ids con filtro y orden, (2) detalle solo de
 * esos ids. El LATERAL de precio entra al paso 1 únicamente si hay filtro u orden por precio.
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
  const resolvedSort = sort ?? 'featured';
  const orderBy = ORDER_BY_CLAUSE[resolvedSort] ?? ORDER_BY_CLAUSE.featured;

  const hasPriceFilter = min_price !== undefined || max_price !== undefined;
  const sortsByPrice = resolvedSort === 'price_asc' || resolvedSort === 'price_desc';
  const pageJoin = hasPriceFilter || sortsByPrice ? PRICE_LATERAL : '';
  const countJoin = hasPriceFilter ? PRICE_LATERAL : '';

  const idsQuery = `
    SELECT p.id
    FROM products p
    ${pageJoin}
    WHERE ${where}
    ORDER BY ${orderBy}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  const paginationParams = [...filterParams, limit, offset];

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM products p
    ${countJoin}
    WHERE ${where}
  `;

  const [idsResult, countResult] = await Promise.all([
    query<{ id: string }>(idsQuery, paginationParams),
    query<{ total: string }>(countQuery, filterParams)
  ]);

  const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

  if (idsResult.rows.length === 0) {
    return { products: [], total };
  }

  const productIds = idsResult.rows.map((r) => r.id);

  // Detalle y tiers solo dependen de los ids: se piden en paralelo
  const [detailResult, tiersResult] = await Promise.all([
    query<CatalogRow>(
      `SELECT
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
        img.url AS image_url
      FROM products p
      ${PRICE_LATERAL}
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN brands b ON b.id = p.brand_id
      LEFT JOIN LATERAL (
        SELECT pi.url
        FROM product_images pi
        WHERE pi.product_id = p.id
        ORDER BY pi.display_order ASC
        LIMIT 1
      ) img ON true
      WHERE p.id = ANY($1)`,
      [productIds]
    ),
    query<{
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
    )
  ]);

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

  // El detalle viene sin orden: se restituye el de la página de ids
  const detailById = new Map(detailResult.rows.map((row) => [row.id, row]));
  const products: PublicProduct[] = [];
  for (const id of productIds) {
    const row = detailById.get(id);
    if (!row) continue;
    products.push({
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
    });
  }

  return { products, total };
}
