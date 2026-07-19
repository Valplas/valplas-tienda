// apps/api/src/tests/setup.ts
//
// Limpieza post-test SCOPED a datos creados por los tests:
// - usuarios `*@vitest.local` (ver helpers.ts)
// - carriers/zonas de envío con prefijo `vitest-`
//
// IMPORTANTE: no borrar por `%test.com` — los usuarios seed (cliente@test.com,
// maria@test.com) usan ese dominio y el cleanup viejo los destruía, rompiendo
// cualquier suite que dependiera del seed.

import { afterEach } from 'vitest';
import { query } from '../infrastructure/database/client.js';

const TEST_USERS = "SELECT id FROM users WHERE email LIKE '%@vitest.local'";
const TEST_ORDERS = `SELECT id FROM orders WHERE user_id IN (${TEST_USERS})`;

afterEach(async () => {
  // Orden: hijos → padres (FKs sin CASCADE en varios casos)
  await query(`DELETE FROM refresh_tokens WHERE user_id IN (${TEST_USERS})`);
  await query(`DELETE FROM order_items WHERE order_id IN (${TEST_ORDERS})`);
  await query(`DELETE FROM order_status_history WHERE order_id IN (${TEST_ORDERS})`);
  await query(`DELETE FROM orders WHERE user_id IN (${TEST_USERS})`);
  await query(`DELETE FROM user_addresses WHERE user_id IN (${TEST_USERS})`);
  await query("DELETE FROM users WHERE email LIKE '%@vitest.local'");
  // shipping_rates cae por CASCADE al borrar el carrier
  await query("DELETE FROM shipping_carriers WHERE code LIKE 'vitest-%'");
  await query("DELETE FROM shipping_zones WHERE name LIKE 'vitest-%'");
});
