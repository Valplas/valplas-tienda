import { query } from '../../infrastructure/database/client.js';
import {
  decodeCursor,
  encodeCursor,
  keysetPredicate,
  sliceKeysetPage
} from '../../shared/utils/keyset.js';
import type { Brand } from '@valplas/shared/types';
import type { CreateBrandData, UpdateBrandData, BrandFilters } from './brand.types.js';

const BRANDS_SORT_TAG = 'name_asc';

export interface FindBrandsResult {
  data: (Brand & { productCount: number })[];
  /** null en páginas con cursor: el total solo se calcula en la primera página. */
  total: number | null;
  /** La respuesta se pagina por cursor (si no, OFFSET con total). */
  keyset: boolean;
  hasMore: boolean;
  nextCursor: string | null;
}

/**
 * Buscar marcas con filtros y paginación.
 * Sin `page` se pagina por cursor (name, id); con `page`, OFFSET clásico.
 */
export async function findBrands(filters: BrandFilters = {}): Promise<FindBrandsResult> {
  const { search, isActive, page, cursor, limit = 24 } = filters;
  const useKeyset = page === undefined;
  const offset = useKeyset ? 0 : (page - 1) * limit;

  const conditions: string[] = ['b.deleted_at IS NULL'];
  const params: unknown[] = [];
  let paramIndex = 1;

  // Búsqueda fuzzy por nombre
  if (search) {
    conditions.push(`b.name % $${paramIndex}`);
    params.push(search);
    paramIndex++;
  }

  // Filtro por activo
  if (isActive !== undefined) {
    conditions.push(`b.is_active = $${paramIndex}`);
    params.push(isActive);
    paramIndex++;
  }

  const whereClause = conditions.join(' AND ');

  // Total: con cursor solo en la primera página (el predicado del cursor no entra en el count)
  let total: number | null = null;
  if (!useKeyset || !cursor) {
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM brands b WHERE ${whereClause}`,
      params
    );
    total = parseInt(countResult.rows[0].count, 10);
  }

  let pageWhere = whereClause;
  const pageParams = [...params];
  let pageParamIndex = paramIndex;
  if (useKeyset && cursor) {
    const values = decodeCursor(cursor, BRANDS_SORT_TAG, 2);
    pageWhere = `${whereClause} AND ${keysetPredicate(
      ['b.name', 'b.id'],
      'ASC',
      ['text', 'uuid'],
      pageParamIndex
    )}`;
    pageParams.push(...values);
    pageParamIndex += values.length;
  }
  const pageLimit = useKeyset ? limit + 1 : limit;

  // Paginar primero y contar productos solo de las marcas de la página (antes el JOIN + GROUP BY
  // contaba los productos de TODAS las marcas y luego descartaba con LIMIT/OFFSET).
  const brandsResult = await query<Brand & { product_count: string }>(
    `WITH page AS (
       SELECT b.id
       FROM brands b
       WHERE ${pageWhere}
       ORDER BY b.name ASC, b.id ASC
       LIMIT $${pageParamIndex} OFFSET $${pageParamIndex + 1}
     )
     SELECT b.*, pc.product_count
     FROM page
     JOIN brands b ON b.id = page.id
     LEFT JOIN LATERAL (
       SELECT COUNT(*) AS product_count
       FROM products p
       WHERE p.brand_id = b.id AND p.deleted_at IS NULL AND p.is_active = true
     ) pc ON true
     ORDER BY b.name ASC, b.id ASC`,
    [...pageParams, pageLimit, offset]
  );

  const { rows, hasMore } = useKeyset
    ? sliceKeysetPage(brandsResult.rows, limit)
    : { rows: brandsResult.rows, hasMore: false };

  const last = rows[rows.length - 1];
  const nextCursor =
    useKeyset && hasMore && last ? encodeCursor(BRANDS_SORT_TAG, [last.name, last.id]) : null;

  const data = rows.map((row) => ({
    ...row,
    productCount: parseInt(row.product_count, 10)
  }));

  return { data, total, keyset: useKeyset, hasMore, nextCursor };
}

/**
 * Buscar marca por ID
 */
export async function findBrandById(id: string): Promise<Brand | null> {
  const result = await query<Brand>('SELECT * FROM brands WHERE id = $1 AND deleted_at IS NULL', [
    id
  ]);

  return result.rows[0] || null;
}

/**
 * Buscar marca por slug
 */
export async function findBrandBySlug(slug: string): Promise<Brand | null> {
  const result = await query<Brand>('SELECT * FROM brands WHERE slug = $1 AND deleted_at IS NULL', [
    slug
  ]);

  return result.rows[0] || null;
}

/**
 * Verificar si slug existe
 */
export async function slugExists(slug: string, excludeId?: string): Promise<boolean> {
  const conditions = ['slug = $1', 'deleted_at IS NULL'];
  const params: unknown[] = [slug];

  if (excludeId) {
    conditions.push('id != $2');
    params.push(excludeId);
  }

  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM brands WHERE ${conditions.join(' AND ')}`,
    params
  );

  return parseInt(result.rows[0].count, 10) > 0;
}

/**
 * Verificar si tiene productos
 */
export async function hasProducts(id: string): Promise<boolean> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM products
     WHERE brand_id = $1 AND deleted_at IS NULL`,
    [id]
  );

  return parseInt(result.rows[0].count, 10) > 0;
}

/**
 * Obtener conteo de productos por marca
 */
export async function getProductCount(id: string): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM products
     WHERE brand_id = $1 AND deleted_at IS NULL AND is_active = true`,
    [id]
  );

  return parseInt(result.rows[0].count, 10);
}

/**
 * Crear marca
 */
export async function createBrand(data: CreateBrandData): Promise<Brand> {
  const result = await query<Brand>(
    `INSERT INTO brands (name, slug, description, logo_url, is_active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [data.name, data.slug, data.description || null, data.logoUrl || null, true]
  );

  return result.rows[0];
}

/**
 * Actualizar marca
 */
export async function updateBrand(id: string, data: UpdateBrandData): Promise<Brand | null> {
  const updates: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    updates.push(`name = $${paramIndex}`);
    params.push(data.name);
    paramIndex++;
  }

  if (data.slug !== undefined) {
    updates.push(`slug = $${paramIndex}`);
    params.push(data.slug);
    paramIndex++;
  }

  if (data.description !== undefined) {
    updates.push(`description = $${paramIndex}`);
    params.push(data.description);
    paramIndex++;
  }

  if (data.logoUrl !== undefined) {
    updates.push(`logo_url = $${paramIndex}`);
    params.push(data.logoUrl);
    paramIndex++;
  }

  if (data.isActive !== undefined) {
    updates.push(`is_active = $${paramIndex}`);
    params.push(data.isActive);
    paramIndex++;
  }

  if (updates.length === 0) return null;

  params.push(id);

  const result = await query<Brand>(
    `UPDATE brands
     SET ${updates.join(', ')}
     WHERE id = $${paramIndex} AND deleted_at IS NULL
     RETURNING *`,
    params
  );

  return result.rows[0] || null;
}

/**
 * Soft delete marca
 */
export async function deleteBrand(id: string): Promise<boolean> {
  const result = await query(
    'UPDATE brands SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );

  return (result.rowCount || 0) > 0;
}
