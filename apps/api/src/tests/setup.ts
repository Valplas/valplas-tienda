// apps/api/src/tests/setup.ts

import { afterEach } from 'vitest';
import { query } from '../infrastructure/database/client.js';

// Clean up test data after each test
afterEach(async () => {
  // Delete test data created during tests (keep seed data)
  await query(`
    DELETE FROM order_items WHERE order_id IN (
      SELECT id FROM orders WHERE user_id IN (
        SELECT id FROM users WHERE email LIKE '%test.com' OR email LIKE '%example.com'
      )
    )
  `);

  await query(`
    DELETE FROM order_status_history WHERE order_id IN (
      SELECT id FROM orders WHERE user_id IN (
        SELECT id FROM users WHERE email LIKE '%test.com' OR email LIKE '%example.com'
      )
    )
  `);

  await query(`
    DELETE FROM orders WHERE user_id IN (
      SELECT id FROM users WHERE email LIKE '%test.com' OR email LIKE '%example.com'
    )
  `);

  await query(`
    DELETE FROM user_addresses WHERE user_id IN (
      SELECT id FROM users WHERE email LIKE '%test.com' OR email LIKE '%example.com'
    )
  `);

  await query(`
    DELETE FROM users WHERE email LIKE '%test.com' OR email LIKE '%example.com'
  `);
});
