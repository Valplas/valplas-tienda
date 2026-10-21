import { query } from '../../infrastructure/database/client.js';
import type { UpdateBannerInput } from './banner.validator.js';
import type {
  AdminBanner,
  BannerImageData,
  BannerLinkTargets,
  BannerPagination,
  BannerStorage,
  NewBanner,
  PublicBanner
} from './banner.types.js';

const VISIBLE_NOW = `
  b.deleted_at IS NULL
  AND b.is_active = true
  AND (b.starts_at IS NULL OR b.starts_at <= NOW())
  AND (b.ends_at IS NULL OR b.ends_at > NOW())
`;

const BANNER_ORDER = 'b.display_order ASC, b.created_at ASC, b.id ASC';

interface RawPublicBanner {
  id: string;
  title: string;
  desktop_image_url: string;
  desktop_width: number;
  desktop_height: number;
  mobile_image_url: string | null;
  mobile_width: number | null;
  mobile_height: number | null;
  link_product_slug: string | null;
  link_category_id: string | null;
  link_brand_id: string | null;
}

function mapPublicBanner(row: RawPublicBanner): PublicBanner {
  return {
    id: row.id,
    title: row.title,
    desktopImageUrl: row.desktop_image_url,
    desktopWidth: row.desktop_width,
    desktopHeight: row.desktop_height,
    mobileImageUrl: row.mobile_image_url,
    mobileWidth: row.mobile_width,
    mobileHeight: row.mobile_height,
    linkProductSlug: row.link_product_slug,
    linkCategoryId: row.link_category_id,
    linkBrandId: row.link_brand_id
  };
}

/**
 * Banners visibles ahora (activos + dentro de vigencia), en orden. Los JOIN
 * filtran destinos inactivos/borrados en la misma query: el link llega ya
 * saneado (null) y el front nunca arma una URL a algo que no existe.
 */
export async function findPublicBanners({ page, limit }: BannerPagination) {
  const offset = (page - 1) * limit;

  const [bannersResult, countResult] = await Promise.all([
    query<RawPublicBanner>(
      `SELECT
         b.id, b.title,
         b.desktop_image_url, b.desktop_width, b.desktop_height,
         b.mobile_image_url, b.mobile_width, b.mobile_height,
         p.slug AS link_product_slug,
         c.id AS link_category_id,
         br.id AS link_brand_id
       FROM banners b
       LEFT JOIN products p
         ON p.id = b.link_product_id AND p.is_active = true AND p.deleted_at IS NULL
       LEFT JOIN categories c
         ON c.id = b.link_category_id AND c.is_active = true AND c.deleted_at IS NULL
       LEFT JOIN brands br
         ON br.id = b.link_brand_id AND br.is_active = true AND br.deleted_at IS NULL
       WHERE ${VISIBLE_NOW}
       ORDER BY ${BANNER_ORDER}
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    query<{ count: string }>(`SELECT COUNT(*) AS count FROM banners b WHERE ${VISIBLE_NOW}`)
  ]);

  return {
    data: bannersResult.rows.map(mapPublicBanner),
    total: parseInt(countResult.rows[0].count, 10)
  };
}

interface RawAdminBanner {
  id: string;
  title: string;
  desktop_image_url: string;
  desktop_width: number;
  desktop_height: number;
  mobile_image_url: string | null;
  mobile_width: number | null;
  mobile_height: number | null;
  link_category_id: string | null;
  link_category_name: string | null;
  link_category_is_active: boolean | null;
  link_brand_id: string | null;
  link_brand_name: string | null;
  link_brand_is_active: boolean | null;
  link_product_id: string | null;
  link_product_name: string | null;
  link_product_slug: string | null;
  link_product_is_active: boolean | null;
  display_order: number;
  is_active: boolean;
  starts_at: Date | null;
  ends_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function mapAdminBanner(row: RawAdminBanner): AdminBanner {
  return {
    id: row.id,
    title: row.title,
    desktopImageUrl: row.desktop_image_url,
    desktopWidth: row.desktop_width,
    desktopHeight: row.desktop_height,
    mobileImageUrl: row.mobile_image_url,
    mobileWidth: row.mobile_width,
    mobileHeight: row.mobile_height,
    linkCategoryId: row.link_category_id,
    linkCategoryName: row.link_category_name,
    linkCategoryIsActive: row.link_category_is_active,
    linkBrandId: row.link_brand_id,
    linkBrandName: row.link_brand_name,
    linkBrandIsActive: row.link_brand_is_active,
    linkProductId: row.link_product_id,
    linkProductName: row.link_product_name,
    linkProductSlug: row.link_product_slug,
    linkProductIsActive: row.link_product_is_active,
    displayOrder: row.display_order,
    isActive: row.is_active,
    startsAt: toIso(row.starts_at),
    endsAt: toIso(row.ends_at),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

// Un destino borrado (soft delete) se muestra como "sin destino": mismo
// criterio que el listado público. Uno inactivo se muestra con su flag para
// que el admin vea por qué el banner no lleva a ningún lado.
const ADMIN_SELECT = `
  SELECT
    b.id, b.title,
    b.desktop_image_url, b.desktop_width, b.desktop_height,
    b.mobile_image_url, b.mobile_width, b.mobile_height,
    c.id AS link_category_id, c.name AS link_category_name, c.is_active AS link_category_is_active,
    br.id AS link_brand_id, br.name AS link_brand_name, br.is_active AS link_brand_is_active,
    p.id AS link_product_id, p.name AS link_product_name, p.slug AS link_product_slug,
    p.is_active AS link_product_is_active,
    b.display_order, b.is_active, b.starts_at, b.ends_at, b.created_at, b.updated_at
  FROM banners b
  LEFT JOIN categories c ON c.id = b.link_category_id AND c.deleted_at IS NULL
  LEFT JOIN brands br ON br.id = b.link_brand_id AND br.deleted_at IS NULL
  LEFT JOIN products p ON p.id = b.link_product_id AND p.deleted_at IS NULL
`;

export async function findAdminBanners({ page, limit }: BannerPagination) {
  const offset = (page - 1) * limit;

  const [bannersResult, countResult] = await Promise.all([
    query<RawAdminBanner>(
      `${ADMIN_SELECT}
       WHERE b.deleted_at IS NULL
       ORDER BY ${BANNER_ORDER}
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    query<{ count: string }>('SELECT COUNT(*) AS count FROM banners WHERE deleted_at IS NULL')
  ]);

  return {
    data: bannersResult.rows.map(mapAdminBanner),
    total: parseInt(countResult.rows[0].count, 10)
  };
}

export async function findAdminBannerById(id: string): Promise<AdminBanner | null> {
  const result = await query<RawAdminBanner>(
    `${ADMIN_SELECT} WHERE b.id = $1 AND b.deleted_at IS NULL`,
    [id]
  );
  return result.rows[0] ? mapAdminBanner(result.rows[0]) : null;
}

export async function findBannerStorage(id: string): Promise<BannerStorage | null> {
  const result = await query<{
    desktop_storage_path: string;
    mobile_storage_path: string | null;
  }>(
    `SELECT desktop_storage_path, mobile_storage_path
     FROM banners
     WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  const row = result.rows[0];
  return row
    ? { desktopStoragePath: row.desktop_storage_path, mobileStoragePath: row.mobile_storage_path }
    : null;
}

export async function findAllBannerIds(): Promise<string[]> {
  const result = await query<{ id: string }>('SELECT id FROM banners WHERE deleted_at IS NULL');
  return result.rows.map((row) => row.id);
}

export async function getNextDisplayOrder(): Promise<number> {
  const result = await query<{ next: number }>(
    'SELECT COALESCE(MAX(display_order) + 1, 0) AS next FROM banners WHERE deleted_at IS NULL'
  );
  return result.rows[0].next;
}

/**
 * Cuenta cuáles de los destinos pedidos existen (no borrados). Un parámetro
 * null cuenta 0 sin tocar la tabla. Una sola query para los tres.
 */
export async function countExistingLinkTargets(targets: Partial<BannerLinkTargets>) {
  const result = await query<{ categories: string; brands: string; products: string }>(
    `SELECT
       (SELECT COUNT(*) FROM categories WHERE id = $1 AND deleted_at IS NULL) AS categories,
       (SELECT COUNT(*) FROM brands WHERE id = $2 AND deleted_at IS NULL) AS brands,
       (SELECT COUNT(*) FROM products WHERE id = $3 AND deleted_at IS NULL) AS products`,
    [targets.linkCategoryId ?? null, targets.linkBrandId ?? null, targets.linkProductId ?? null]
  );
  const row = result.rows[0];
  return {
    categories: parseInt(row.categories, 10),
    brands: parseInt(row.brands, 10),
    products: parseInt(row.products, 10)
  };
}

export async function insertBanner(banner: NewBanner): Promise<void> {
  await query(
    `INSERT INTO banners (
       id, title,
       desktop_image_url, desktop_storage_path, desktop_width, desktop_height,
       mobile_image_url, mobile_storage_path, mobile_width, mobile_height,
       link_category_id, link_brand_id, link_product_id,
       display_order, is_active, starts_at, ends_at, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [
      banner.id,
      banner.title,
      banner.desktop.url,
      banner.desktop.storagePath,
      banner.desktop.width,
      banner.desktop.height,
      banner.mobile?.url ?? null,
      banner.mobile?.storagePath ?? null,
      banner.mobile?.width ?? null,
      banner.mobile?.height ?? null,
      banner.linkCategoryId,
      banner.linkBrandId,
      banner.linkProductId,
      banner.displayOrder,
      banner.isActive,
      banner.startsAt,
      banner.endsAt,
      banner.createdBy
    ]
  );
}

const UPDATE_COLUMNS: Record<keyof UpdateBannerInput, string> = {
  title: 'title',
  linkCategoryId: 'link_category_id',
  linkBrandId: 'link_brand_id',
  linkProductId: 'link_product_id',
  isActive: 'is_active',
  startsAt: 'starts_at',
  endsAt: 'ends_at'
};

export async function updateBanner(id: string, data: UpdateBannerInput): Promise<boolean> {
  const updates: string[] = [];
  const params: unknown[] = [];

  for (const [key, column] of Object.entries(UPDATE_COLUMNS)) {
    const value = data[key as keyof UpdateBannerInput];
    if (value === undefined) continue;
    params.push(value);
    updates.push(`${column} = $${params.length}`);
  }

  if (updates.length === 0) return false;

  params.push(id);
  const result = await query(
    `UPDATE banners SET ${updates.join(', ')} WHERE id = $${params.length} AND deleted_at IS NULL`,
    params
  );
  return (result.rowCount ?? 0) > 0;
}

export async function updateBannerImages(
  id: string,
  desktop: BannerImageData,
  mobile: BannerImageData | null
): Promise<boolean> {
  const result = await query(
    `UPDATE banners SET
       desktop_image_url = $1, desktop_storage_path = $2, desktop_width = $3, desktop_height = $4,
       mobile_image_url = $5, mobile_storage_path = $6, mobile_width = $7, mobile_height = $8
     WHERE id = $9 AND deleted_at IS NULL`,
    [
      desktop.url,
      desktop.storagePath,
      desktop.width,
      desktop.height,
      mobile?.url ?? null,
      mobile?.storagePath ?? null,
      mobile?.width ?? null,
      mobile?.height ?? null,
      id
    ]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function softDeleteBanner(id: string): Promise<boolean> {
  const result = await query(
    'UPDATE banners SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * El índice del array pasa a ser display_order. Un solo UPDATE (atómico por
 * sí mismo, sin loop ni transacción explícita).
 */
export async function reorderBanners(bannerIds: string[]): Promise<void> {
  await query(
    `UPDATE banners b
     SET display_order = ordered.position - 1
     FROM unnest($1::uuid[]) WITH ORDINALITY AS ordered(id, position)
     WHERE b.id = ordered.id AND b.deleted_at IS NULL`,
    [bannerIds]
  );
}
