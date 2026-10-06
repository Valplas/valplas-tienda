// apps/api/src/tests/helpers.ts
//
// Fábricas de datos de test. Convenciones de aislamiento:
// - Usuarios de test: email `*@vitest.local` (el cleanup de setup.ts borra por ese dominio;
//   los usuarios seed usan @test.com/@valplas.net y NO se tocan).
// - Carriers/zonas de test: code/name con prefijo `vitest-`.

import { query } from '../infrastructure/database/client.js';
import * as authService from '../modules/auth/auth.service.js';

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
