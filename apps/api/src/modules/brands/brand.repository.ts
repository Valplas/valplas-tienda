import { query } from '../../infrastructure/database/client.js';
import type { Brand } from '@valplas/shared/types';
import type { CreateBrandData, UpdateBrandData, BrandFilters } from './brand.types.js';

/**
 * Buscar marcas con filtros y paginación
 */
export async function findBrands(filters: BrandFilters = {}) {
  const { search, isActive, page = 1, limit = 24 } = filters;
  const offset = (page - 1) * limit;

  const conditions: string[] = ['b.deleted_at IS NULL'];
  const params: any[] = [];
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

  // Query para obtener marcas con conteo de productos
  const brandsQuery = `
    SELECT
      b.*,
      COUNT(p.id) as product_count
    FROM brands b
    LEFT JOIN products p ON b.id = p.brand_id AND p.deleted_at IS NULL AND p.is_active = true
    WHERE ${whereClause}
    GROUP BY b.id
    ORDER BY b.name ASC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  params.push(limit, offset);

  // Query para contar el total
  const countQuery = `
    SELECT COUNT(*) as count
    FROM brands b
    WHERE ${whereClause}
  `;

  const [brandsResult, countResult] = await Promise.all([
    query<Brand & { product_count: string }>(brandsQuery, params.slice(0, -2).concat([limit, offset])),
    query<{ count: string }>(countQuery, params.slice(0, -2))
  ]);

  const brands = brandsResult.rows.map((row) => ({
    ...row,
    productCount: parseInt(row.product_count, 10)
  }));

  return {
    data: brands,
    total: parseInt(countResult.rows[0].count, 10)
  };
}

/**
 * Buscar marca por ID
 */
export async function findBrandById(id: string): Promise<Brand | null> {
  const result = await query<Brand>(
    `SELECT * FROM brands WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );

  return result.rows[0] || null;
}

/**
 * Buscar marca por slug
 */
export async function findBrandBySlug(slug: string): Promise<Brand | null> {
  const result = await query<Brand>(
    `SELECT * FROM brands WHERE slug = $1 AND deleted_at IS NULL`,
    [slug]
  );

  return result.rows[0] || null;
}

/**
 * Verificar si slug existe
 */
export async function slugExists(slug: string, excludeId?: string): Promise<boolean> {
  const conditions = ['slug = $1', 'deleted_at IS NULL'];
  const params: any[] = [slug];

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
  const params: any[] = [];
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
    `UPDATE brands SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );

  return (result.rowCount || 0) > 0;
}
