/**
 * Migrate: Clients → users (role = 'customer') + user_addresses
 * - Preserves ClientID as UUID
 * - Generates username from name
 * - Placeholder password hash (account inactive until reset)
 * - IsDeleted → deleted_at
 * - ClientAddress + ClientLocality → user_addresses (is_default = true)
 * Idempotent: ON CONFLICT (id) DO UPDATE for users;
 *             delete-then-insert for addresses (no CRM address ID to reuse)
 */
import { source, target, closeAll } from './db.ts';
import bcrypt from 'bcryptjs';
import slugifyLib from 'slugify';

const slugify = (s: string) => slugifyLib(s, { lower: true, strict: true, locale: 'es' });

/**
 * Parse a free-form Argentine address string into structured fields.
 * E.g. "Av. Corrientes 1234 piso 3" → { street: "Av. Corrientes", street_number: "1234", notes: "piso 3" }
 */
function parseAddress(raw: string): { street: string; street_number: string; notes?: string } {
  const trimmed = raw.trim();
  // Match: text before the first standalone number, then optional remainder
  const match = trimmed.match(/^(.+?)\s+(\d+[\w/]*)(.*)$/);
  if (match) {
    const notes = match[3].trim() || undefined;
    return { street: match[1].trim(), street_number: match[2].trim(), notes };
  }
  // No number found (e.g. "s/n" or just a name) — store whole as street
  return { street: trimmed, street_number: 's/n' };
}

// Single placeholder hash — clients must reset password on first login
const PLACEHOLDER_HASH = await bcrypt.hash('ValplasCambiar2026!', 10);

const rows = await source.query(`
  SELECT "ClientID", "ClientName", "ClientSurname",
         "ClientEmail", "ClientPhone", "ClientAddress",
         "ClientLocality", "IsDeleted", "ClientDate"
  FROM "Clients"
  ORDER BY "ClientDate" NULLS LAST
`);

console.log(`👥 Migrating ${rows.rows.length} clients...`);

// Track usernames, emails, and phones for uniqueness
const usedUsernames = new Set<string>();
const usedEmails = new Set<string>();
const usedPhones = new Set<string>();

// Pre-load existing from target
const existing = await target.query<{ username: string; email: string; phone: string | null }>(
  'SELECT username, email, phone FROM users'
);
existing.rows.forEach((r) => {
  usedUsernames.add(r.username);
  usedEmails.add(r.email);
  if (r.phone) usedPhones.add(r.phone);
});

let inserted = 0;
let updated = 0;
let addressesInserted = 0;
let errors = 0;

for (const row of rows.rows) {
  try {
    const firstName = (row.ClientName?.trim() || 'Sin').substring(0, 100);
    const lastName = (row.ClientSurname?.trim() || 'Nombre').substring(0, 100);

    // Username: firstname.lastname, unique-ified
    const baseUsername = slugify(`${firstName}.${lastName}`).substring(0, 40) || 'cliente';
    let username = baseUsername;
    let i = 2;
    while (usedUsernames.has(username)) username = `${baseUsername}${i++}`;
    usedUsernames.add(username);

    // Email: use CRM email or generate placeholder
    let email = row.ClientEmail?.trim().toLowerCase() || null;
    if (!email || usedEmails.has(email)) {
      email = `migrado.${row.ClientID.substring(0, 8)}@sinmail.local`;
    }
    usedEmails.add(email);

    // Phone: normalize, nullify if already used by another client
    let phone = row.ClientPhone?.trim().substring(0, 20) || null;
    if (phone && usedPhones.has(phone)) phone = null;
    if (phone) usedPhones.add(phone);

    const deletedAt = row.IsDeleted ? new Date().toISOString() : null;
    const createdAt = row.ClientDate
      ? new Date(row.ClientDate).toISOString()
      : new Date().toISOString();

    const res = await target.query(
      `INSERT INTO users (
        id, email, username, first_name, last_name,
        phone, password_hash, role,
        is_active, email_verified, created_at, deleted_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,'customer',$8,false,$9,$10)
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        username = EXCLUDED.username,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        phone = EXCLUDED.phone,
        is_active = EXCLUDED.is_active,
        deleted_at = EXCLUDED.deleted_at
      RETURNING (xmax = 0) as inserted`,
      [
        row.ClientID,
        email,
        username,
        firstName,
        lastName,
        phone,
        PLACEHOLDER_HASH,
        !row.IsDeleted,
        createdAt,
        deletedAt
      ]
    );
    if (res.rows[0].inserted) inserted++;
    else updated++;

    // --- Migrate address ---
    const rawAddress = row.ClientAddress?.trim() || '';
    if (rawAddress) {
      const { street, street_number, notes } = parseAddress(rawAddress);
      const city = (row.ClientLocality?.trim() || 'Sin especificar').substring(0, 100);

      // Idempotent: remove any previously migrated address for this user, then re-insert
      await target.query(`DELETE FROM user_addresses WHERE user_id = $1`, [row.ClientID]);

      await target.query(
        `INSERT INTO user_addresses (
          user_id, street, street_number, city, province, postcode,
          notes, is_default, is_active, created_at
        )
        VALUES ($1, $2, $3, $4, 'Buenos Aires', '0000', $5, true, true, $6)`,
        [row.ClientID, street, street_number, city, notes ?? null, createdAt]
      );
      addressesInserted++;
    }
  } catch (e) {
    console.error(`  ❌ ${row.ClientID} "${row.ClientName}": ${(e as Error).message}`);
    errors++;
  }
}

console.log(
  `\n✅ Clients: ${inserted} inserted, ${updated} updated, ${errors} errors` +
    `\n✅ Addresses: ${addressesInserted} inserted`
);
await closeAll();
