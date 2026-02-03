// apps/api/src/infrastructure/database/cleanup-tests.ts

import { query, pool } from './client.js';

async function cleanupTestData() {
  try {
    console.log('🧹 Limpiando datos de test...');

    // Delete test users and related data
    await query(`
      DELETE FROM user_addresses WHERE user_id IN (
        SELECT id FROM users WHERE email LIKE '%test.com' OR email LIKE '%example.com'
      )
    `);

    await query(`
      DELETE FROM users WHERE email LIKE '%test.com' OR email LIKE '%example.com'
    `);

    console.log('✅ Datos de test eliminados');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

cleanupTestData();
