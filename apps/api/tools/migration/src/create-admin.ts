/**
 * Create a single owner/admin user. Run once after truncating `users`, before or
 * after the migration scripts (no dependency either way).
 *
 * Required env (tools/migration/.env or inline):
 *   ADMIN_EMAIL, ADMIN_PASSWORD (>=12 chars), ADMIN_USERNAME, ADMIN_FIRST_NAME, ADMIN_LAST_NAME
 * No hardcoded default password — matches NC-03 (ISO 27001 audit).
 */
import { target, closeAll } from './db.ts';
import bcrypt from 'bcryptjs';

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const username = process.env.ADMIN_USERNAME || 'admin';
const firstName = process.env.ADMIN_FIRST_NAME || 'Admin';
const lastName = process.env.ADMIN_LAST_NAME || 'Valplas';

if (!email) throw new Error('ADMIN_EMAIL not set');
if (!password || password.length < 12) {
  throw new Error('ADMIN_PASSWORD not set or too short (min 12 chars)');
}

const passwordHash = await bcrypt.hash(password, 12);

const res = await target.query(
  `INSERT INTO users (email, username, password_hash, first_name, last_name, role, is_active, email_verified)
   VALUES ($1, $2, $3, $4, $5, 'owner', true, true)
   ON CONFLICT (email) DO UPDATE SET
     password_hash = EXCLUDED.password_hash,
     role = 'owner',
     is_active = true
   RETURNING id`,
  [email.toLowerCase(), username, passwordHash, firstName, lastName]
);

console.log(`✅ Admin (owner) creado/actualizado: ${email} → ${res.rows[0].id}`);
await closeAll();
