// apps/api/src/infrastructure/database/check-tables.ts

import { query, pool } from './client.js';

async function checkTables() {
  try {
    const result = await query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
       ORDER BY table_name`
    );

    console.log('📊 Tablas en la base de datos:');
    console.log('================================');
    result.rows.forEach((row: Record<string, unknown>) => {
      console.log(`  ✓ ${row.table_name}`);
    });
    console.log('================================');
    console.log(`Total: ${result.rows.length} tablas`);
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

checkTables();
