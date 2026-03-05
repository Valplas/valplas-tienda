/**
 * Inspect source CRM schema and data counts.
 * Run: bun run inspect
 */
import { source, closeAll } from './db.ts';

async function inspect() {
  console.log('🔍 Inspecting source CRM schema...\n');

  // List all tables
  const tables = await source.query<{ tablename: string }>(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);
  console.log('📋 Tables:', tables.rows.map((r) => r.tablename).join(', '), '\n');

  // For each relevant table, show columns and row count
  const targets = ['PriceLists', 'Brands', 'Products', 'Clients', 'Orders', 'OrderItems', 'Users'];

  for (const table of targets) {
    try {
      const cols = await source.query<{
        column_name: string;
        data_type: string;
        is_nullable: string;
      }>(
        `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = 'public'
        ORDER BY ordinal_position
      `,
        [table]
      );

      const count = await source.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM "${table}"`
      );

      if (cols.rows.length === 0) {
        console.log(`⚠️  ${table}: table not found or no columns`);
        continue;
      }

      console.log(`📦 ${table} (${count.rows[0].count} rows):`);
      cols.rows.forEach((c) => {
        console.log(
          `   ${c.column_name.padEnd(30)} ${c.data_type} ${c.is_nullable === 'NO' ? 'NOT NULL' : ''}`
        );
      });

      // Sample row
      const sample = await source.query(`SELECT * FROM "${table}" LIMIT 1`);
      if (sample.rows.length > 0) {
        console.log(
          '   Sample:',
          JSON.stringify(sample.rows[0], null, 2).split('\n').slice(0, 10).join('\n')
        );
      }
      console.log();
    } catch (e) {
      console.log(`❌ ${table}: ${(e as Error).message}\n`);
    }
  }

  await closeAll();
}

inspect().catch((e) => {
  console.error(e);
  process.exit(1);
});
