import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env') });

if (!process.env.SOURCE_DB_URL) throw new Error('SOURCE_DB_URL not set in tools/migration/.env');
if (!process.env.TARGET_DB_URL) throw new Error('TARGET_DB_URL not set in tools/migration/.env');

export const SOURCE_DB_URL = process.env.SOURCE_DB_URL;
export const TARGET_DB_URL = process.env.TARGET_DB_URL;
