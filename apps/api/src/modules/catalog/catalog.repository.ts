import { query } from '../../infrastructure/database/client.js';
import { findValuesByProductIds, getAliasIndex } from '../attributes/attribute.repository.js';
import type { ProductAttributeView } from '../attributes/attribute.types.js';
import {
  buildSearchSql,
  MAX_CATEGORY_DEPTH,
  planSearchAttempts,
  SEARCH_JOINS,
  SEARCH_WITH,
  type SearchAttempt,
  type SearchMode
} from './catalog-search.js';
import {
  describePresentations,
  toPublicUnit,
  type PublicUnit,
  type TierForDisplay
} from './presentation.js';
import { parseSearch } from './search-parser.js';

/** Presentación pública de un producto (sin nombre de lista: expone el margen). */
export interface PriceTier {
  min_quantity: number;
  unit_price: number;
  price_list_id: string;
  bundle_price: number;
  label: string;
  contains: string | null;
  savings_percent: number;
  description: string;
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
  unit: PublicUnit | null;
  tiers: PriceTier[];
  /** Atributos activos con valor, por display_order; vacío si no tiene. */
  attributes: ProductAttributeView[];
  /**
   * Tags del producto + los de su categoría y ancestros. Solo se completa con `includeTags`
   * (bot): la API pública nunca los expone.
   */
  tags?: string[];
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
  /** Incluye productos activos con stock disponible 0 (por defecto solo los que tienen stock). */
  include_out_of_stock?: boolean;
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
  unit_label: string | null;
  unit_content_quantity: string | number | null;
  unit_content_label: string | null;
  tags: string[] | null;
}

/** Opciones de lectura de productos públicos. */
export interface PublicProductOptions {
  /** Completa `tags` (producto + categoría y ancestros). Solo para el bot. */
  includeTags?: boolean;
}

export interface PublicProductsPage {
  products: PublicProduct[];
  total: number;
  /**
   * Cómo se resolvió `search`: 'exact' (todos los términos), 'relaxed' (ningún producto tenía
   * todos: alcanza con una palabra) o null (sin búsqueda, o solo stopwords/signos).
   */
  search_mode: SearchMode | null;
}

/** Filtros fijos (sin búsqueda) y paginación, compartidos por todos los intentos. */
interface PageQuery {
  conditions: string[];
  params: unknown[];
  sort: CatalogSort | undefined;
  hasPriceFilter: boolean;
  limit: number;
  offset: number;
}

/**
 * Obtener productos públicos con tiers de precio calculados en DB.
 * cost_price y margin nunca se exponen al cliente.
 *
 * Paginación en dos pasos para no calcular precio, imagen ni joins de categoría/marca
 * sobre filas que se descartan: (1) página de ids con filtro y orden, (2) detalle solo de
 * esos ids. El LATERAL de precio entra al paso 1 únicamente si hay filtro u orden por precio.
 *
 * `search` pasa por parseSearch (stopwords, medidas, cantidades con unidad) y se prueba en
 * intentos (catalog-search.ts → planSearchAttempts): el primero con resultados gana. Con
 * búsqueda y `sort` ausente o 'featured' se ordena por relevancia; un `sort` explícito se respeta.
 */
export async function findPublicProducts(
  filters: CatalogFilters,
  options: PublicProductOptions = {}
): Promise<PublicProductsPage> {
  const {
    search,
    category_id,
    brand_id,
    min_price,
    max_price,
    sort,
    include_out_of_stock,
    page = 1,
    limit = 20
  } = filters;
  const conditions: string[] = ['p.deleted_at IS NULL', 'p.is_active = true'];
  if (!include_out_of_stock) {
    conditions.push('(p.stock - p.reserved_stock) > 0');
  }
  const params: unknown[] = [];

  if (category_id) {
    params.push(category_id);
    conditions.push(`p.category_id = $${params.length}`);
  }

  if (brand_id) {
    params.push(brand_id);
    conditions.push(`p.brand_id = $${params.length}`);
  }

  if (min_price !== undefined) {
    params.push(min_price);
    conditions.push(`${EFFECTIVE_PRICE_SQL} >= $${params.length}`);
  }

  if (max_price !== undefined) {
    params.push(max_price);
    conditions.push(`${EFFECTIVE_PRICE_SQL} <= $${params.length}`);
  }

  const pageQuery: PageQuery = {
    conditions,
    params,
    sort,
    hasPriceFilter: min_price !== undefined || max_price !== undefined,
    limit,
    offset: (page - 1) * limit
  };

  const attempts = search?.trim()
    ? planSearchAttempts(parseSearch(search, await getAliasIndex()))
    : [];

  if (attempts.length === 0) {
    const { ids, total } = await findPageIds(pageQuery, null);
    return { products: await findPublicProductsByIds(ids, options), total, search_mode: null };
  }

  let found: { ids: string[]; total: number } = { ids: [], total: 0 };
  let mode: SearchMode = attempts[0].mode;
  for (const attempt of attempts) {
    found = await findPageIds(pageQuery, attempt);
    mode = attempt.mode;
    if (found.total > 0) break;
  }

  return {
    products: await findPublicProductsByIds(found.ids, options),
    total: found.total,
    search_mode: mode
  };
}

/**
 * Paso 1 de la paginación: ids de la página y total con el MISMO WHERE (filtros + búsqueda).
 * Relevancia (score; en el relajado primero la cantidad de términos que coinciden) solo si hay
 * búsqueda y el orden pedido es el por defecto ('featured' o ausente).
 */
async function findPageIds(
  pageQuery: PageQuery,
  attempt: SearchAttempt | null
): Promise<{ ids: string[]; total: number }> {
  const { conditions, sort, hasPriceFilter, limit, offset } = pageQuery;
  const search = attempt ? buildSearchSql(attempt, pageQuery.params.length + 1) : null;
  const byRelevance = search !== null && (sort === undefined || sort === 'featured');

  const where = (search ? [...conditions, `(${search.where})`] : conditions).join(' AND ');
  let orderBy = ORDER_BY_CLAUSE[sort ?? 'featured'] ?? ORDER_BY_CLAUSE.featured;
  if (byRelevance && search) {
    orderBy = `${search.score} DESC, ${ORDER_BY_CLAUSE.featured}`;
    if (attempt?.mode === 'relaxed') orderBy = `${search.matched} DESC, ${orderBy}`;
  }

  // Postgres rechaza parámetros sin referenciar: el COUNT (y un orden explícito) solo llevan
  // los de filtros + WHERE de la búsqueda; score/matched usan además los del resto
  const whereParams = search
    ? [...pageQuery.params, ...search.params.slice(0, search.whereParamCount)]
    : pageQuery.params;
  const pageParams = byRelevance && search ? [...pageQuery.params, ...search.params] : whereParams;

  const sortsByPrice = !byRelevance && (sort === 'price_asc' || sort === 'price_desc');
  const pageJoin = hasPriceFilter || sortsByPrice ? PRICE_LATERAL : '';
  const countJoin = hasPriceFilter ? PRICE_LATERAL : '';
  const withClause = search ? SEARCH_WITH : '';
  const searchJoins = search ? SEARCH_JOINS : '';

  const idsQuery = `
    ${withClause}
    SELECT p.id
    FROM products p
    ${searchJoins}
    ${pageJoin}
    WHERE ${where}
    ORDER BY ${orderBy}
    LIMIT $${pageParams.length + 1} OFFSET $${pageParams.length + 2}
  `;

  const countQuery = `
    ${withClause}
    SELECT COUNT(*) AS total
    FROM products p
    ${searchJoins}
    ${countJoin}
    WHERE ${where}
  `;

  const [idsResult, countResult] = await Promise.all([
    query<{ id: string }>(idsQuery, [...pageParams, limit, offset]),
    query<{ total: string }>(countQuery, whereParams)
  ]);

  return {
    ids: idsResult.rows.map((r) => r.id),
    total: parseInt(countResult.rows[0]?.total ?? '0', 10)
  };
}

/** Unión sin duplicados conservando orden: primero los del producto, luego los de la categoría. */
function mergeTags(productTags: string[], categoryTags: string[]): string[] {
  return [...new Set([...productTags, ...categoryTags])];
}

/**
 * Tags de cada categoría dada más los de todos sus ancestros (propia primero, luego padre,
 * abuelo…), sin duplicados. UNA query recursiva para todas las categorías de la página.
 */
export async function getCategoryChainTags(categoryIds: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (categoryIds.length === 0) return result;

  const rows = await query<{ root_id: string; tags: string[] }>(
    `WITH RECURSIVE chain AS (
       SELECT c.id AS root_id, c.parent_id, c.tags, 0 AS depth
       FROM categories c
       WHERE c.id = ANY($1)
       UNION ALL
       SELECT ch.root_id, p.parent_id, p.tags, ch.depth + 1
       FROM chain ch
       JOIN categories p ON p.id = ch.parent_id AND p.deleted_at IS NULL
       WHERE ch.depth < $2
     )
     SELECT root_id, tags FROM chain ORDER BY root_id, depth`,
    [categoryIds, MAX_CATEGORY_DEPTH]
  );
  for (const row of rows.rows) {
    result.set(row.root_id, mergeTags(result.get(row.root_id) ?? [], row.tags ?? []));
  }
  return result;
}

/**
 * Tiers activos (presentaciones) de varios productos en UNA query, ordenados por min_quantity.
 * Precio unitario = costo × (1 + margen de la lista), truncado a centavos. Sin nombre de lista
 * ni margen. Productos sin tiers no aparecen en el mapa.
 */
export async function getActiveTiersByProductIds(
  productIds: string[]
): Promise<Map<string, TierForDisplay[]>> {
  const result = new Map<string, TierForDisplay[]>();
  if (productIds.length === 0) return result;

  const { rows } = await query<{
    product_id: string;
    min_quantity: number;
    unit_price: number;
    price_list_id: string;
    label: string | null;
  }>(
    `SELECT
      ppt.product_id,
      ppt.min_quantity,
      ppt.price_list_id,
      ppt.label,
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

  for (const row of rows) {
    const list = result.get(row.product_id) ?? [];
    list.push({
      priceListId: row.price_list_id,
      minQuantity: row.min_quantity,
      unitPrice: Number(row.unit_price),
      label: row.label
    });
    result.set(row.product_id, list);
  }
  return result;
}

/**
 * Detalle público (precio, stock disponible, categoría, marca, imagen y tiers) de los ids
 * pedidos, en el mismo orden. Omite productos borrados o inactivos; NO filtra por stock (el
 * llamador decide). 3 queries en total (detalle, tiers, atributos), sin N+1. Lo usan el listado del catálogo y el bot.
 */
export async function findPublicProductsByIds(
  productIds: string[],
  options: PublicProductOptions = {}
): Promise<PublicProduct[]> {
  if (productIds.length === 0) return [];

  // Detalle, tiers y atributos solo dependen de los ids: se piden en paralelo (3 queries)
  const [detailResult, tiersByProduct, attributesByProduct] = await Promise.all([
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
        img.url AS image_url,
        p.unit_label,
        p.unit_content_quantity,
        p.unit_content_label,
        p.tags
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
      WHERE p.id = ANY($1) AND p.deleted_at IS NULL AND p.is_active = true`,
      [productIds]
    ),
    getActiveTiersByProductIds(productIds),
    findValuesByProductIds(productIds)
  ]);

  // Tags de las categorías (y ancestros) de la página en UNA query, solo si se piden
  const categoryTags = options.includeTags
    ? await getCategoryChainTags([...new Set(detailResult.rows.map((row) => row.category_id))])
    : null;

  // El detalle viene sin orden: se restituye el de la página de ids
  const detailById = new Map(detailResult.rows.map((row) => [row.id, row]));
  const products: PublicProduct[] = [];
  for (const id of productIds) {
    const row = detailById.get(id);
    if (!row) continue;
    const salesUnit = {
      label: row.unit_label,
      contentQuantity:
        row.unit_content_quantity !== null ? Number(row.unit_content_quantity) : null,
      contentLabel: row.unit_content_label
    };
    const tiers: PriceTier[] = describePresentations(
      salesUnit,
      tiersByProduct.get(row.id) ?? []
    ).map((view) => ({
      price_list_id: view.priceListId,
      min_quantity: view.bundleSize,
      unit_price: view.unitPrice,
      bundle_price: view.bundlePrice,
      label: view.label,
      contains: view.contains,
      savings_percent: view.savingsPercent,
      description: view.description
    }));
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
      unit: toPublicUnit(salesUnit),
      tiers,
      attributes: attributesByProduct.get(row.id) ?? [],
      ...(categoryTags
        ? { tags: mergeTags(row.tags ?? [], categoryTags.get(row.category_id) ?? []) }
        : {})
    });
  }

  return products;
}
