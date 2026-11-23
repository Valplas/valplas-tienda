import type { PoolClient } from 'pg';
import { query } from '../../infrastructure/database/client.js';
import {
  decodeCursor,
  encodeCursor,
  keysetPredicate,
  sliceKeysetPage,
  tsKey,
  type SortDirection
} from '../../shared/utils/keyset.js';
import type { Product } from '@valplas/shared/types';
import type {
  ProductFilters,
  ProductWithDetails,
  CreateProductData,
  UpdateProductData
} from './product.types.js';

/** '' (input en blanco) equivale a "sin valor": se guarda como null; undefined se conserva. */
export function emptyToNull(value: string | null | undefined): string | null | undefined {
  return value === '' ? null : value;
}

// Tiers activos del producto con precio de venta derivado (costo × margen de lista).
// Lo usan listado y detalle para que el front calcule el precio efectivo.
const PRICE_TIERS_SQL = `COALESCE(
        (SELECT json_agg(
          json_build_object(
            'priceListId', ppt.price_list_id,
            'priceListName', pl.name,
            'minQuantity', ppt.min_quantity,
            'label', ppt.label,
            'unitPrice', TRUNC(p.cost_price * (1 + pl.margin / 100) * 100) / 100
          ) ORDER BY pl.name ASC
        )
        FROM product_price_tiers ppt
        JOIN price_lists pl ON pl.id = ppt.price_list_id
        WHERE ppt.product_id = p.id
          AND ppt.is_active = true
          AND pl.is_active = true
          AND pl.deleted_at IS NULL),
        '[]'
      ) as price_tiers`;

interface ProductSortSpec {
  expr: string;
  dir: SortDirection;
  /** Cast SQL del valor en el predicado del cursor */
  type: string;
  /** Expresión (texto) con el valor de orden que viaja en el cursor */
  value: string;
}

const AVAILABLE_STOCK = '(p.stock - p.reserved_stock)';

const PRODUCT_SORTS: Record<string, ProductSortSpec> = {
  name_asc: { expr: 'p.name', dir: 'ASC', type: 'text', value: 'p.name' },
  name_desc: { expr: 'p.name', dir: 'DESC', type: 'text', value: 'p.name' },
  price_asc: { expr: 'p.cost_price', dir: 'ASC', type: 'numeric', value: 'p.cost_price::text' },
  price_desc: { expr: 'p.cost_price', dir: 'DESC', type: 'numeric', value: 'p.cost_price::text' },
  newest: { expr: 'p.created_at', dir: 'DESC', type: 'timestamptz', value: tsKey('p.created_at') },
  oldest: { expr: 'p.created_at', dir: 'ASC', type: 'timestamptz', value: tsKey('p.created_at') },
  updated_desc: {
    expr: 'p.updated_at',
    dir: 'DESC',
    type: 'timestamptz',
    value: tsKey('p.updated_at')
  },
  updated_asc: {
    expr: 'p.updated_at',
    dir: 'ASC',
    type: 'timestamptz',
    value: tsKey('p.updated_at')
  },
  stock_asc: {
    expr: AVAILABLE_STOCK,
    dir: 'ASC',
    type: 'integer',
    value: `${AVAILABLE_STOCK}::text`
  },
  stock_desc: {
    expr: AVAILABLE_STOCK,
    dir: 'DESC',
    type: 'integer',
    value: `${AVAILABLE_STOCK}::text`
  }
};

/**
 * Elige el orden por comparación con las claves conocidas: el SQL sale siempre de las constantes
 * de PRODUCT_SORTS y nunca del texto recibido (un valor desconocido cae en name_asc).
 */
function resolveProductSort(sort: string): ProductSortSpec {
  const match = Object.entries(PRODUCT_SORTS).find(([key]) => key === sort);
  return match ? match[1] : PRODUCT_SORTS.name_asc;
}

export interface FindProductsResult {
  products: ProductWithDetails[];
  /** null en páginas con cursor: el total solo se calcula en la primera página. */
  total: number | null;
  /** La respuesta se pagina por cursor (si no, OFFSET con total). */
  keyset: boolean;
  hasMore: boolean;
  nextCursor: string | null;
}

/**
 * Buscar productos con filtros y paginación.
 * Sin `page` se pagina por cursor (keyset); con `page`, OFFSET clásico.
 */
export async function findProducts(filters: ProductFilters): Promise<FindProductsResult> {
  const {
    search,
    categoryId,
    brandId,
    minPrice,
    maxPrice,
    inStock,
    featured,
    isActive,
    requireActiveTier,
    page,
    cursor,
    limit = 24,
    sort = 'newest'
  } = filters;

  const useKeyset = page === undefined;
  const offset = useKeyset ? 0 : (page - 1) * limit;
  // isActive undefined = sin filtro de visibilidad (solo llega así para
  // admin/owner: el controller lo fuerza a true para el resto).
  const conditions: string[] = ['p.deleted_at IS NULL'];
  if (isActive !== undefined) {
    conditions.push(`p.is_active = ${isActive ? 'true' : 'false'}`);
  }

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

  // Filtro por rango de precio (sobre el costo)
  if (minPrice !== undefined) {
    conditions.push(`p.cost_price >= $${paramIndex}`);
    params.push(minPrice);
    paramIndex++;
  }

  if (maxPrice !== undefined) {
    conditions.push(`p.cost_price <= $${paramIndex}`);
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

  // Orden: una sola expresión + p.id con la MISMA dirección (requisito del cursor: el predicado es
  // un único row value). `name_asc` es el orden alfabético por defecto.
  const sortSpec = resolveProductSort(sort);

  const whereClause = conditions.join(' AND ');

  // El JOIN con brands solo hace falta cuando se busca por marca (el filtro referencia b.name)
  const brandJoin = search ? 'LEFT JOIN brands b ON p.brand_id = b.id' : '';

  // Total: con cursor solo en la primera página (el predicado del cursor no entra en el count)
  let total: number | null = null;
  if (!useKeyset || !cursor) {
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM products p
       ${brandJoin}
       WHERE ${whereClause}`,
      params
    );
    total = parseInt(countResult.rows[0].count, 10);
  }

  let pageWhere = whereClause;
  const pageParams = [...params];
  let pageParamIndex = paramIndex;
  const sortTag = `products_${sort}`;
  if (useKeyset && cursor) {
    const values = decodeCursor(cursor, sortTag, 2);
    pageWhere = `${whereClause} AND ${keysetPredicate(
      [sortSpec.expr, 'p.id'],
      sortSpec.dir,
      [sortSpec.type, 'uuid'],
      pageParamIndex
    )}`;
    pageParams.push(...values);
    pageParamIndex += 2;
  }
  const pageLimit = useKeyset ? limit + 1 : limit;

  // Paginar primero (solo ids) y recién después traer categoría, marca, imágenes y tiers:
  // antes el GROUP BY + json_agg de imágenes corría sobre TODOS los productos filtrados y
  // luego se descartaba con LIMIT/OFFSET. `p.id` desempata para que las páginas no se repitan.
  const stableOrder = `${sortSpec.expr} ${sortSpec.dir}, p.id ${sortSpec.dir}`;
  const productsResult = await query(
    `WITH page AS (
       SELECT p.id, ${sortSpec.value} AS k0
       FROM products p
       ${brandJoin}
       WHERE ${pageWhere}
       ORDER BY ${stableOrder}
       LIMIT $${pageParamIndex} OFFSET $${pageParamIndex + 1}
     )
     SELECT
      p.*,
      page.k0 AS _k0,
      c.name as category_name,
      b.name as brand_name,
      (p.stock - p.reserved_stock) as available_stock,
      img.images as images,
      ${PRICE_TIERS_SQL}
    FROM page
    JOIN products p ON p.id = page.id
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN brands b ON p.brand_id = b.id
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        json_agg(
          json_build_object(
            'id', pi.id,
            'url', pi.url,
            'altText', pi.alt_text,
            'displayOrder', pi.display_order,
            'isPrimary', pi.is_primary,
            'width', pi.width,
            'height', pi.height
          ) ORDER BY pi.display_order
        ),
        '[]'
      ) AS images
      FROM product_images pi
      WHERE pi.product_id = p.id
    ) img ON true
    ORDER BY ${stableOrder}`,
    [...pageParams, pageLimit, offset]
  );

  const { rows, hasMore } = useKeyset
    ? sliceKeysetPage(productsResult.rows as Record<string, unknown>[], limit)
    : { rows: productsResult.rows as Record<string, unknown>[], hasMore: false };

  const last = rows[rows.length - 1];
  const nextCursor =
    useKeyset && hasMore && last
      ? encodeCursor(sortTag, [String(last._k0), String(last.id)])
      : null;

  // transformProductRow arma el objeto campo a campo: _k0 (solo para el cursor) no se expone
  const products = rows.map(transformProductRow);

  return { products, total, keyset: useKeyset, hasMore, nextCursor };
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
            'isPrimary', pi.is_primary,
            'width', pi.width,
            'height', pi.height
          ) ORDER BY pi.display_order
        ) FILTER (WHERE pi.id IS NOT NULL),
        '[]'
      ) as images,
      ${PRICE_TIERS_SQL}
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
 * Buscar varios productos por IDs en un solo query (batch, evita N+1)
 */
export async function findProductsByIds(ids: string[]): Promise<ProductWithDetails[]> {
  if (ids.length === 0) return [];

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
            'isPrimary', pi.is_primary,
            'width', pi.width,
            'height', pi.height
          ) ORDER BY pi.display_order
        ) FILTER (WHERE pi.id IS NOT NULL),
        '[]'
      ) as images,
      ${PRICE_TIERS_SQL}
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN brands b ON p.brand_id = b.id
    LEFT JOIN product_images pi ON p.id = pi.product_id
    WHERE p.id = ANY($1) AND p.deleted_at IS NULL
    GROUP BY p.id, c.id, b.id`,
    [ids]
  );

  return result.rows.map(transformProductRow);
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
            'isPrimary', pi.is_primary,
            'width', pi.width,
            'height', pi.height
          ) ORDER BY pi.display_order
        ) FILTER (WHERE pi.id IS NOT NULL),
        '[]'
      ) as images,
      ${PRICE_TIERS_SQL}
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
 * Crear producto. Recibe siempre un client explícito (llamado dentro de una
 * transaction() en el service) porque la creación puede ir acompañada de la
 * finalización de imágenes en staging — ver product.service.ts#createProduct.
 */
export async function createProduct(data: CreateProductData, client: PoolClient): Promise<Product> {
  const result = await client.query<Product>(
    `INSERT INTO products (
      sku, name, slug, description, category_id, brand_id,
      cost_price, stock,
      weight, width, length, height, origin,
      is_featured, is_active,
      unit_label, unit_content_quantity, unit_content_label, tags
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    RETURNING *`,
    [
      data.sku,
      data.name,
      data.slug,
      data.description || null,
      data.categoryId,
      data.brandId || null,
      data.costPrice,
      data.stock || 0,
      data.weight ?? null,
      data.width ?? null,
      data.length ?? null,
      data.height ?? null,
      data.origin || null,
      data.isFeatured || false,
      true,
      emptyToNull(data.unitLabel) ?? null,
      data.unitContentQuantity ?? null,
      emptyToNull(data.unitContentLabel) ?? null,
      data.tags ?? []
    ]
  );

  return result.rows[0];
}

/**
 * Actualizar producto
 */
export async function updateProduct(
  id: string,
  data: UpdateProductData,
  client?: PoolClient
): Promise<Product | null> {
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

  if (data.unitLabel !== undefined) {
    updates.push(`unit_label = $${paramIndex}`);
    params.push(emptyToNull(data.unitLabel));
    paramIndex++;
  }

  if (data.unitContentQuantity !== undefined) {
    updates.push(`unit_content_quantity = $${paramIndex}`);
    params.push(data.unitContentQuantity);
    paramIndex++;
  }

  if (data.unitContentLabel !== undefined) {
    updates.push(`unit_content_label = $${paramIndex}`);
    params.push(emptyToNull(data.unitContentLabel));
    paramIndex++;
  }

  if (data.tags !== undefined) {
    updates.push(`tags = $${paramIndex}`);
    params.push(data.tags);
    paramIndex++;
  }

  if (updates.length === 0) return null;

  params.push(id);

  const sql = `UPDATE products
     SET ${updates.join(', ')}
     WHERE id = $${paramIndex} AND deleted_at IS NULL
     RETURNING *`;
  const result = client
    ? await client.query<Product>(sql, params)
    : await query<Product>(sql, params);

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
    costPrice: row.cost_price,
    stock: row.stock,
    reservedStock: row.reserved_stock,
    availableStock: row.available_stock,
    weight: row.weight ?? null,
    width: row.width ?? null,
    length: row.length ?? null,
    height: row.height ?? null,
    origin: row.origin ?? null,
    unitLabel: row.unit_label ?? null,
    unitContentQuantity:
      row.unit_content_quantity == null ? null : Number(row.unit_content_quantity),
    unitContentLabel: row.unit_content_label ?? null,
    isFeatured: row.is_featured,
    isActive: row.is_active,
    tags: (row.tags as string[] | null) ?? [],
    images: (row.images as ProductWithDetails['images']) || [],
    priceTiers: (row.price_tiers as ProductWithDetails['priceTiers']) || [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    deletedAt: (row.deleted_at as string | null) ?? null
  } as ProductWithDetails;
}
