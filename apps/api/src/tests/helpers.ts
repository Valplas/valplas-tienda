// apps/api/src/tests/helpers.ts
//
// Fábricas de datos de test. Convenciones de aislamiento:
// - Usuarios de test: email `*@vitest.local` (el cleanup de setup.ts borra por ese dominio;
//   los usuarios seed usan @test.com/@valplas.net y NO se tocan).
// - Carriers/zonas de test: code/name con prefijo `vitest-`.

import { query } from '../infrastructure/database/client.js';
import * as authService from '../modules/auth/auth.service.js';
import * as userDomain from '../modules/users/user.domain.js';

let seq = 0;

export function uniqueSuffix(): string {
  seq += 1;
  return `${Date.now().toString(36)}${seq}`;
}

export interface TestUser {
  id: string;
  email: string;
  username: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

export async function createTestUser(
  overrides: Partial<{
    email: string;
    username: string;
    password: string;
    firstName: string;
    lastName: string;
    phone: string;
  }> = {}
): Promise<TestUser> {
  const suffix = uniqueSuffix();
  const data = {
    email: `user-${suffix}@vitest.local`,
    username: `vt_${suffix}`,
    password: 'Test1234!',
    firstName: 'Vitest',
    lastName: 'User',
    ...overrides
  };

  const result = await authService.register(data);

  return {
    id: result.user.id,
    email: data.email,
    username: data.username,
    password: data.password,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken
  };
}

export interface TestAddress {
  id: string;
  street: string;
  street_number: string;
  city: string;
  province: string;
  postcode: string;
}

export async function createTestAddress(userId: string, postcode = '1043'): Promise<TestAddress> {
  const result = await query<TestAddress>(
    `INSERT INTO user_addresses (
      user_id, street, street_number, city, province, postcode, is_default
    ) VALUES ($1, 'Av. Vitest', '123', 'Buenos Aires', 'CABA', $2, true)
    RETURNING *`,
    [userId, postcode]
  );

  return result.rows[0];
}

export interface TestShipping {
  carrierId: string;
  zoneId: string;
  price: number;
}

/**
 * Crea carrier + zona + tarifa plana (sin umbral de envío gratis) para que
 * el costo de envío calculado por order.domain sea determinista (= price).
 */
export async function createTestShipping(price = 1500): Promise<TestShipping> {
  const suffix = uniqueSuffix();

  const carrier = await query<{ id: string }>(
    `INSERT INTO shipping_carriers (name, code, is_active)
     VALUES ($1, $2, true) RETURNING id`,
    [`vitest-carrier-${suffix}`, `vitest-${suffix}`]
  );

  const zone = await query<{ id: string }>(
    `INSERT INTO shipping_zones (name, provinces, excluded_postcodes, is_active)
     VALUES ($1, '[]', '[]', true) RETURNING id`,
    [`vitest-zone-${suffix}`]
  );

  await query(
    `INSERT INTO shipping_rates (
      zone_id, carrier_id, min_amount, max_amount, price,
      estimated_days_min, estimated_days_max, is_active
    ) VALUES ($1, $2, 0, NULL, $3, 1, 3, true)`,
    [zone.rows[0].id, carrier.rows[0].id, price]
  );

  return { carrierId: carrier.rows[0].id, zoneId: zone.rows[0].id, price };
}

export interface TestProduct {
  id: string;
  name: string;
  sku: string;
  cost_price: number;
  stock: number;
  reserved_stock: number;
}

/** Toma un producto real del catálogo con stock disponible suficiente. */
export async function getTestProduct(minAvailable = 10): Promise<TestProduct> {
  const result = await query<TestProduct>(
    `SELECT id, name, sku, cost_price, stock, reserved_stock
     FROM products
     WHERE is_active = true AND deleted_at IS NULL
       AND (stock - reserved_stock) >= $1
     ORDER BY created_at
     LIMIT 1`,
    [minAvailable]
  );

  if (!result.rows[0]) {
    throw new Error('No hay productos con stock suficiente en la DB de test — corré `bun db:seed`');
  }

  return result.rows[0];
}

export async function getProductStock(
  productId: string
): Promise<{ stock: number; reserved_stock: number }> {
  const result = await query<{ stock: number; reserved_stock: number }>(
    'SELECT stock, reserved_stock FROM products WHERE id = $1',
    [productId]
  );
  return result.rows[0];
}

/** Sufijo solo con letras: para calles de test (los dígitos romperían el parseo calle/número). */
export function lettersSuffix(): string {
  return Array.from({ length: 10 }, () =>
    String.fromCharCode(97 + Math.floor(Math.random() * 26))
  ).join('');
}

/**
 * Cliente legacy (como lo crea tools/migration/src/migrate-clients.ts): email placeholder,
 * password placeholder, nunca usó la web. El email `vitest.*@sinmail.local` lo limpia setup.ts.
 */
export async function createLegacyUser(
  overrides: Partial<{
    firstName: string;
    lastName: string | null;
    email: string;
    phone: string | null;
  }> = {}
): Promise<{ id: string; email: string; username: string }> {
  const suffix = uniqueSuffix();
  const result = await query<{ id: string; email: string; username: string }>(
    `INSERT INTO users (email, username, first_name, last_name, phone, password_hash,
                        role, is_active, is_legacy)
     VALUES ($1, $2, $3, $4, $5, 'legacy-placeholder-hash', 'customer', true, true)
     RETURNING id, email, username`,
    [
      overrides.email ?? `vitest.${suffix}@sinmail.local`,
      `vt_legacy_${suffix}`,
      overrides.firstName ?? 'Legacy',
      overrides.lastName ?? null,
      overrides.phone ?? null
    ]
  );
  return result.rows[0];
}

/**
 * Cliente cargado por el admin desde el backoffice (userDomain.createUser): username con los
 * dígitos del teléfono, sin email y nunca inició sesión. Email `@vitest.local` para el cleanup.
 */
export async function createAdminCustomer(
  overrides: Partial<{ firstName: string; lastName: string }> = {}
): Promise<{ id: string }> {
  const phone = `+54911${Math.floor(Math.random() * 1e8)
    .toString()
    .padStart(8, '0')}`;
  const user = await userDomain.createUser(
    {
      email: `admin-created-${uniqueSuffix()}@vitest.local`,
      password: 'Test1234!',
      phone,
      first_name: overrides.firstName ?? 'Admin',
      last_name: overrides.lastName ?? 'Created',
      role: 'customer'
    },
    'admin'
  );
  return { id: user.id };
}

/** Cuenta creada por Google OAuth: sin password ni username, con google_id. */
export async function createGoogleUser(
  overrides: Partial<{ firstName: string; lastName: string; email: string }> = {}
): Promise<{ id: string; email: string; googleId: string }> {
  const suffix = uniqueSuffix();
  const email = overrides.email ?? `google-${suffix}@vitest.local`;
  const googleId = `vitest-google-${suffix}`;
  const result = await query<{ id: string }>(
    `INSERT INTO users (email, first_name, last_name, google_id, role, is_active,
                        email_verified, last_login_at)
     VALUES ($1, $2, $3, $4, 'customer', true, true, NOW())
     RETURNING id`,
    [email, overrides.firstName ?? 'Google', overrides.lastName ?? 'User', googleId]
  );
  return { id: result.rows[0].id, email, googleId };
}

export async function createRawAddress(
  userId: string,
  data: { street: string; streetNumber: string; city: string; isDefault?: boolean }
): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO user_addresses (user_id, street, street_number, city, province, postcode, is_default)
     VALUES ($1, $2, $3, $4, 'Buenos Aires', '1744', $5)
     RETURNING id`,
    [userId, data.street, data.streetNumber, data.city, data.isDefault ?? false]
  );
  return result.rows[0].id;
}

/** Orden mínima como las del CRM: dirección en texto libre, ciudad fija. */
export async function createRawOrder(
  userId: string,
  shippingStreet = 'Av. Vitest 123'
): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO orders (user_id, order_number, status, subtotal, shipping_cost, total,
                         shipping_street, shipping_street_number, shipping_city,
                         shipping_province, shipping_postcode, payment_method)
     VALUES ($1, $2, 'delivered', 1000, 0, 1000, $3, 'S/N', 'Buenos Aires',
             'Buenos Aires', '0000', 'cash')
     RETURNING id`,
    [userId, `VT-${uniqueSuffix()}`, shippingStreet]
  );
  return result.rows[0].id;
}

/** Número de abonado AMBA aleatorio de 8 dígitos que libphonenumber considera válido (4XXXXXXX). */
export function randomSubscriber(): string {
  return `4${Math.floor(Math.random() * 1e7)
    .toString()
    .padStart(7, '0')}`;
}

/** Teléfono celular AMBA aleatorio en E.164, con el 9 de móvil (+54911XXXXXXXX). */
export function randomMobilePhone(): string {
  return `+54911${randomSubscriber()}`;
}

export interface TestTier {
  tierId: string;
  productId: string;
  priceListId: string;
  bundleSize: number;
  unitPrice: number;
}

/**
 * Presentación (tier) de test sobre un producto real con stock y una lista activa. La dev DB
 * puede no tener tiers: los tests que los necesitan crean el suyo y lo borran con deleteTestTiers.
 */
export async function createTestTier(minAvailable = 50, bundleSize = 1): Promise<TestTier> {
  const result = await query<TestTier>(
    `WITH product AS (
       SELECT p.id, p.cost_price FROM products p
       WHERE p.is_active = true AND p.deleted_at IS NULL
         AND (p.stock - p.reserved_stock) >= $1
         AND NOT EXISTS (
           SELECT 1 FROM product_price_tiers t
           WHERE t.product_id = p.id AND t.min_quantity = $2
         )
       ORDER BY p.created_at
       LIMIT 1
     ),
     list AS (
       SELECT id, margin FROM price_lists
       WHERE is_active = true AND deleted_at IS NULL
       ORDER BY created_at
       LIMIT 1
     ),
     tier AS (
       INSERT INTO product_price_tiers (product_id, price_list_id, min_quantity, is_active)
       SELECT product.id, list.id, $2, true FROM product, list
       RETURNING id, product_id, price_list_id, min_quantity
     )
     SELECT tier.id AS "tierId", tier.product_id AS "productId",
            tier.price_list_id AS "priceListId", tier.min_quantity AS "bundleSize",
            (TRUNC(product.cost_price * (1 + list.margin / 100) * 100) / 100)::float AS "unitPrice"
     FROM tier, product, list`,
    [minAvailable, bundleSize]
  );

  if (!result.rows[0]) {
    throw new Error('No hay producto con stock o lista de precios activa para crear un tier');
  }
  return result.rows[0];
}

export async function deleteTestTiers(tierIds: string[]): Promise<void> {
  if (tierIds.length === 0) return;
  await query('DELETE FROM product_price_tiers WHERE id = ANY($1)', [tierIds]);
}

export interface TestCatalogProduct {
  id: string;
  sku: string;
  name: string;
  slug: string;
  categoryId: string;
  tierIds: string[];
  priceListIds: string[];
}

/**
 * Producto de catálogo de test: categoría `vitest-<suffix>`, SKU `VITEST-<SUFFIX>` y una
 * presentación (tier) por cada entrada de `tiers`, cada una en una lista de precios activa
 * distinta. El cleanup de setup.ts lo borra por SKU (los tiers caen por CASCADE).
 * `label` (nombre de la presentación) y `unit` (unidad de venta del producto) son opcionales.
 */
export async function createTestProduct(
  opts: {
    stock?: number;
    name?: string;
    costPrice?: number;
    tiers?: Array<{ minQuantity: number; label?: string | null }>;
    unit?: { label?: string | null; contentQuantity?: number | null; contentLabel?: string | null };
    /** Valores de atributos; `key` se resuelve contra attribute_definitions (seed 059 o de test). */
    attributes?: Array<{ key: string; value: string | number }>;
    /** Tags del producto y de su categoría (se guardan tal cual; pasar ya normalizados). */
    tags?: string[];
    categoryTags?: string[];
  } = {}
): Promise<TestCatalogProduct> {
  const suffix = uniqueSuffix();
  const tiers = opts.tiers ?? [{ minQuantity: 1 }];
  const name = opts.name ?? `vitest-product-${suffix}`;
  const slug = `vitest-${suffix}`;

  const category = await query<{ id: string }>(
    'INSERT INTO categories (name, slug, is_active, tags) VALUES ($1, $2, true, $3) RETURNING id',
    [slug, slug, opts.categoryTags ?? []]
  );
  const categoryId = category.rows[0].id;

  const product = await query<{ id: string; sku: string }>(
    `INSERT INTO products (sku, name, slug, category_id, cost_price, stock, reserved_stock, is_active,
                           unit_label, unit_content_quantity, unit_content_label, tags)
     VALUES ($1, $2, $3, $4, $5, $6, 0, true, $7, $8, $9, $10)
     RETURNING id, sku`,
    [
      `VITEST-${suffix.toUpperCase()}`,
      name,
      slug,
      categoryId,
      opts.costPrice ?? 1000,
      opts.stock ?? 100,
      opts.unit?.label ?? null,
      opts.unit?.contentQuantity ?? null,
      opts.unit?.contentLabel ?? null,
      opts.tags ?? []
    ]
  );
  const { id, sku } = product.rows[0];

  const tierIds: string[] = [];
  const priceListIds: string[] = [];
  if (tiers.length > 0) {
    const lists = await query<{ id: string }>(
      `SELECT id FROM price_lists
       WHERE is_active = true AND deleted_at IS NULL
       ORDER BY created_at
       LIMIT $1`,
      [tiers.length]
    );
    if (lists.rows.length < tiers.length) {
      throw new Error(`Se necesitan ${tiers.length} listas de precios activas en la DB de test`);
    }
    for (const [index, tier] of tiers.entries()) {
      const priceListId = lists.rows[index].id;
      const inserted = await query<{ id: string }>(
        `INSERT INTO product_price_tiers (product_id, price_list_id, min_quantity, label, is_active)
         VALUES ($1, $2, $3, $4, true) RETURNING id`,
        [id, priceListId, tier.minQuantity, tier.label ?? null]
      );
      tierIds.push(inserted.rows[0].id);
      priceListIds.push(priceListId);
    }
  }

  for (const attr of opts.attributes ?? []) {
    const isNumber = typeof attr.value === 'number';
    const inserted = await query(
      `INSERT INTO product_attribute_values (product_id, attribute_id, value_number, value_text)
       SELECT $1, d.id, $3, $4 FROM attribute_definitions d WHERE d.key = $2`,
      [id, attr.key, isNumber ? attr.value : null, isNumber ? null : String(attr.value)]
    );
    if (inserted.rowCount !== 1) {
      throw new Error(`Atributo inexistente en la DB de test: ${attr.key}`);
    }
  }

  return { id, sku, name, slug, categoryId, tierIds, priceListIds };
}
