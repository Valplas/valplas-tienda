import pg from 'pg';
import { SOURCE_DB_URL, TARGET_DB_URL } from './config.ts';

const { Pool } = pg;

export const source = new Pool({
  connectionString: SOURCE_DB_URL,
  ssl: { rejectUnauthorized: false }
});
export const target = new Pool({
  connectionString: TARGET_DB_URL,
  ssl: { rejectUnauthorized: false }
});

export async function closeAll() {
  await source.end();
  await target.end();
}
