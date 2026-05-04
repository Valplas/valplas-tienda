import { query } from '../../infrastructure/database/client.js';
import type { Product } from '@valplas/shared/types';
import type {
  ProductFilters,
  ProductWithDetails,
  CreateProductData,
  UpdateProductData
} from './product.types.js';

/**
 * Buscar productos con filtros y paginación
 */
export async function findProducts(
  filters: ProductFilters
): Promise<{ products: ProductWithDetails[]; total: number }> {
  const {
    search,
    categoryId,
    brandId,
    minPrice,
    maxPrice,
    inStock,
    featured,
    requireActiveTier,
    page = 1,
    limit = 24,
    sort = 'newest'
  } = filters;

  const offset = (page - 1) * limit;
  const conditions: string[] = ['p.deleted_at IS NULL', 'p.is_active = true'];

  if (requireActiveTier) {
    conditions.push(
      'EXISTS (SELECT 1 FROM product_price_tiers ppt WHERE ppt.product_id = p.id AND ppt.is_active = true)'
    );
  }
  const params: unknown[] = [];
  let paramIndex = 1;

  // Filtro de búsqueda (nombre, SKU, marca) — accent-insensitive via unaccent extension
  if (search) {
    conditions.push(
      `(unaccent(p.name) ILIKE unaccent($${paramIndex}) OR p.sku ILIKE $${paramIndex} OR unaccent(b.name) ILIKE unaccent($${paramIndex}))`
    );
    params.push(`%${search}%`);
    paramIndex++;
  }

  // Filtro por categoría
  if (categoryId) {
    conditions.push(`p.category_id = $${paramIndex}`);
    params.push(categoryId);
    paramIndex++;
  }

  // Filtro por marca
  if (brandId) {
    conditions.push(`p.brand_id = $${paramIndex}`);
    params.push(brandId);
    paramIndex++;
  }

  // Filtro por rango de precio (en centavos)
  if (minPrice !== undefined) {
    conditions.push(`p.base_price >= $${paramIndex}`);
    params.push(minPrice);
    paramIndex++;
  }

  if (maxPrice !== undefined) {
    conditions.push(`p.base_price <= $${paramIndex}`);
    params.push(maxPrice);
    paramIndex++;
  }

  // Filtro por stock disponible
  if (inStock) {
    conditions.push('(p.stock - p.reserved_stock) > 0');
  }

  // Filtro por destacados
  if (featured) {
    conditions.push('p.is_featured = true');
  }

  // Determinar ordenamiento
  let orderBy = 'p.name ASC'; // alfabético por defecto
  switch (sort) {
    case 'price_asc':
      orderBy = 'p.base_price ASC';
      break;
    case 'price_desc':
      orderBy = 'p.base_price DESC';
      break;
    case 'name_desc':
      orderBy = 'p.name DESC';
      break;
    case 'newest':
      orderBy = 'p.created_at DESC';
      break;
    case 'oldest':
      orderBy = 'p.created_at ASC';
      break;
    case 'stock_asc':
      orderBy = '(p.stock - p.reserved_stock) ASC';
      break;
    case 'stock_desc':
      orderBy = '(p.stock - p.reserved_stock) DESC';
      break;
    case 'updated_desc':
      orderBy = 'p.updated_at DESC';
      break;
    case 'updated_asc':
      orderBy = 'p.updated_at ASC';
      break;
  }

  const whereClause = conditions.join(' AND ');

  // Query para contar total (necesita el JOIN con brands cuando se busca por marca)
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM products p
     LEFT JOIN brands b ON p.brand_id = b.id
     WHERE ${whereClause}`,
    params
  );

  const total = parseInt(countResult.rows[0].count, 10);

  // Query principal con joins
  const productsResult = await query(
    `SELECT
      p.*,
      c.name as category_name,
      b.name as brand_name,
      (p.stock - p.reserved_stock) as available_stock,
      COALESCE(
        json_agg(
          json_build_object(
            'id', pi.id,
            'url', pi.url,
            'altText', pi.alt_text,
            'displayOrder', pi.display_order,
            'isPrimary', pi.is_primary
          ) ORDER BY pi.display_order
        ) FILTER (WHERE pi.id IS NOT NULL),
        '[]'
      ) as images,
      COALESCE(
        (SELECT json_agg(
          json_build_object(
            'priceListId', ppt.price_list_id,
            'priceListName', pl.name,
            'minQuantity', ppt.min_quantity,
            'unitPrice', TRUNC(
              (CASE WHEN p.cost_price > 0 THEN p.cost_price ELSE p.base_price END)
              * (1 + pl.margin / 100)
              * 100
            ) / 100
          ) ORDER BY pl.name ASC
        )
        FROM product_price_tiers ppt
        JOIN price_lists pl ON pl.id = ppt.price_list_id
        WHERE ppt.product_id = p.id
          AND ppt.is_active = true
          AND pl.is_active = true
          AND pl.deleted_at IS NULL),
        '[]'
      ) as price_tiers
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN brands b ON p.brand_id = b.id
    LEFT JOIN product_images pi ON p.id = pi.product_id
    WHERE ${whereClause}
    GROUP BY p.id, c.id, b.id
    ORDER BY ${orderBy}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  const products = productsResult.rows.map(transformProductRow);

  return { products, total };
}

/**
 * Buscar producto por ID
 */
export async function findProductById(id: string): Promise<ProductWithDetails | null> {
  const result = await query(
    `SELECT
      p.*,
      c.name as category_name,
      b.name as brand_name,
      (p.stock - p.reserved_stock) as available_stock,
      COALESCE(
        json_agg(
          json_build_object(
            'id', pi.id,
            'url', pi.url,
            'altText', pi.alt_text,
            'displayOrder', pi.display_order,
            'isPrimary', pi.is_primary
          ) ORDER BY pi.display_order
        ) FILTER (WHERE pi.id IS NOT NULL),
        '[]'
      ) as images
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN brands b ON p.brand_id = b.id
    LEFT JOIN product_images pi ON p.id = pi.product_id
    WHERE p.id = $1 AND p.deleted_at IS NULL
    GROUP BY p.id, c.id, b.id`,
    [id]
  );

  if (result.rows.length === 0) return null;

  return transformProductRow(result.rows[0]);
}

/**
 * Buscar producto por slug
 */
export async function findProductBySlug(slug: string): Promise<ProductWithDetails | null> {
  const result = await query(
    `SELECT
      p.*,
      c.name as category_name,
      b.name as brand_name,
      (p.stock - p.reserved_stock) as available_stock,
      COALESCE(
        json_agg(
          json_build_object(
            'id', pi.id,
            'url', pi.url,
            'altText', pi.alt_text,
            'displayOrder', pi.display_order,
            'isPrimary', pi.is_primary
          ) ORDER BY pi.display_order
        ) FILTER (WHERE pi.id IS NOT NULL),
        '[]'
      ) as images
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN brands b ON p.brand_id = b.id
    LEFT JOIN product_images pi ON p.id = pi.product_id
    WHERE p.slug = $1 AND p.deleted_at IS NULL
    GROUP BY p.id, c.id, b.id`,
    [slug]
  );

  if (result.rows.length === 0) return null;

  return transformProductRow(result.rows[0]);
}

/**
 * Verificar si SKU existe
 */
export async function skuExists(sku: string, excludeId?: string): Promise<boolean> {
  const conditions = ['sku = $1', 'deleted_at IS NULL'];
  const params: unknown[] = [sku];

  if (excludeId) {
    conditions.push('id != $2');
    params.push(excludeId);
  }

  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM products WHERE ${conditions.join(' AND ')}`,
    params
  );

  return parseInt(result.rows[0].count, 10) > 0;
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
    `SELECT COUNT(*) as count FROM products WHERE ${conditions.join(' AND ')}`,
    params
  );

  return parseInt(result.rows[0].count, 10) > 0;
}

/**
 * Crear producto
 */
export async function createProduct(data: CreateProductData): Promise<Product> {
  const result = await query<Product>(
    `INSERT INTO products (
      sku, name, slug, description, category_id, brand_id,
      base_price, cost_price, stock,
      weight, width, length, height, origin,
      is_featured, is_active
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING *`,
    [
      data.sku,
      data.name,
      data.slug,
      data.description || null,
      data.categoryId,
      data.brandId || null,
      data.basePrice,
      data.costPrice || 0,
      data.stock || 0,
      data.weight ?? null,
      data.width ?? null,
      data.length ?? null,
      data.height ?? null,
      data.origin || null,
      data.isFeatured || false,
      true
    ]
  );

  return result.rows[0];
}

/**
 * Actualizar producto
 */
export async function updateProduct(id: string, data: UpdateProductData): Promise<Product | null> {
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

  if (data.categoryId !== undefined) {
    updates.push(`category_id = $${paramIndex}`);
    params.push(data.categoryId);
    paramIndex++;
  }

  if (data.brandId !== undefined) {
    updates.push(`brand_id = $${paramIndex}`);
    params.push(data.brandId);
    paramIndex++;
  }

  if (data.basePrice !== undefined) {
    updates.push(`base_price = $${paramIndex}`);
    params.push(data.basePrice);
    paramIndex++;
  }

  if (data.costPrice !== undefined) {
    updates.push(`cost_price = $${paramIndex}`);
    params.push(data.costPrice);
    paramIndex++;
  }

  if (data.stock !== undefined) {
    updates.push(`stock = $${paramIndex}`);
    params.push(data.stock);
    paramIndex++;
  }

  if (data.isFeatured !== undefined) {
    updates.push(`is_featured = $${paramIndex}`);
    params.push(data.isFeatured);
    paramIndex++;
  }

  if (data.weight !== undefined) {
    updates.push(`weight = $${paramIndex}`);
    params.push(data.weight);
    paramIndex++;
  }

  if (data.width !== undefined) {
    updates.push(`width = $${paramIndex}`);
    params.push(data.width);
    paramIndex++;
  }

  if (data.length !== undefined) {
    updates.push(`length = $${paramIndex}`);
    params.push(data.length);
    paramIndex++;
  }

  if (data.height !== undefined) {
    updates.push(`height = $${paramIndex}`);
    params.push(data.height);
    paramIndex++;
  }

  if (data.origin !== undefined) {
    updates.push(`origin = $${paramIndex}`);
    params.push(data.origin);
    paramIndex++;
  }

  if (data.isActive !== undefined) {
    updates.push(`is_active = $${paramIndex}`);
    params.push(data.isActive);
    paramIndex++;
  }

  if (updates.length === 0) return null;

  params.push(id);

  const result = await query<Product>(
    `UPDATE products
     SET ${updates.join(', ')}
     WHERE id = $${paramIndex} AND deleted_at IS NULL
     RETURNING *`,
    params
  );

  return result.rows[0] || null;
}

/**
 * Soft delete producto
 */
export async function deleteProduct(id: string): Promise<boolean> {
  const result = await query(
    `UPDATE products
     SET deleted_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );

  return (result.rowCount || 0) > 0;
}

/**
 * Transformar row de DB a ProductWithDetails
 */
function transformProductRow(row: Record<string, unknown>): ProductWithDetails {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    slug: row.slug,
    description: row.description,
    categoryId: row.category_id,
    categoryName: row.category_name,
    brandId: row.brand_id,
    brandName: row.brand_name,
    basePrice: row.base_price,
    costPrice: row.cost_price,
    stock: row.stock,
    reservedStock: row.reserved_stock,
    availableStock: row.available_stock,
    weight: row.weight ?? null,
    width: row.width ?? null,
    length: row.length ?? null,
    height: row.height ?? null,
    origin: row.origin ?? null,
    isFeatured: row.is_featured,
    isActive: row.is_active,
    images: (row.images as ProductWithDetails['images']) || [],
    priceTiers: (row.price_tiers as ProductWithDetails['priceTiers']) || [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    deletedAt: (row.deleted_at as string | null) ?? null
  } as ProductWithDetails;
}
