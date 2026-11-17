/**
 * Normaliza a E.164 los teléfonos de users que quedaron crudos (import del CRM, registro web y
 * alta admin anteriores a la migración 050). El bot de WhatsApp y las sugerencias de merge
 * comparan por phone_match_key(), que espera E.164.
 *
 * Uso (desde apps/api):
 *   npx tsx src/infrastructure/database/scripts/normalize-phones.ts            # dry-run (default)
 *   npx tsx src/infrastructure/database/scripts/normalize-phones.ts --apply    # escribe
 *
 * - Teléfonos inválidos: se dejan como están y se reportan (el admin los corrige a mano).
 * - Colisiones (el normalizado ya existe en otra cuenta, o dos crudos normalizan igual): se
 *   saltean y se reportan. Son duplicados reales: resolverlos con el merge del admin.
 * - Cada UPDATE es independiente: correrlo dos veces no cambia nada.
 */
import { pool, query } from '../client.js';
import { normalizePhone } from '../../../shared/utils/phone.js';

const APPLY = process.argv.includes('--apply');

interface PhoneRow {
  id: string;
  phone: string;
  first_name: string;
  last_name: string | null;
  deleted_at: Date | null;
}

/** El pooler de Supabase suele tardar más de 2s en la primera conexión de un proceso nuevo. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * i));
    }
  }
}

async function main(): Promise<void> {
  console.log(APPLY ? '✍️  Modo APPLY: se escriben cambios' : '🔍 Dry-run: no se escribe nada');

  const { rows } = await withRetry(() =>
    query<PhoneRow>(
      `SELECT id, phone, first_name, last_name, deleted_at
       FROM users
       WHERE phone IS NOT NULL
       ORDER BY created_at`
    )
  );

  // Teléfonos tal cual están hoy: el UNIQUE es sobre el valor exacto (incluye borrados)
  const owners = new Map(rows.map((row) => [row.phone, row.id]));

  const invalid: PhoneRow[] = [];
  const collisions: Array<{ row: PhoneRow; normalized: string; ownerId: string }> = [];
  const updates: Array<{ row: PhoneRow; normalized: string }> = [];

  for (const row of rows) {
    const normalized = normalizePhone(row.phone);
    if (!normalized) {
      invalid.push(row);
      continue;
    }
    if (normalized === row.phone) continue;

    const ownerId = owners.get(normalized);
    if (ownerId && ownerId !== row.id) {
      collisions.push({ row, normalized, ownerId });
      continue;
    }

    owners.delete(row.phone);
    owners.set(normalized, row.id);
    updates.push({ row, normalized });
  }

  const label = (row: PhoneRow) =>
    `${row.id} ${row.first_name} ${row.last_name ?? ''}`.trim() +
    (row.deleted_at ? ' [borrado]' : '');

  console.log(`\nTeléfonos: ${rows.length} | a normalizar: ${updates.length}`);
  for (const { row, normalized } of updates) {
    console.log(`  ${label(row)}: "${row.phone}" → ${normalized}`);
  }

  console.log(`\nColisiones (resolver con merge): ${collisions.length}`);
  for (const { row, normalized, ownerId } of collisions) {
    console.log(`  ${label(row)}: "${row.phone}" → ${normalized} ya es de ${ownerId}`);
  }

  console.log(`\nInválidos (corregir a mano): ${invalid.length}`);
  for (const row of invalid) {
    console.log(`  ${label(row)}: "${row.phone}"`);
  }

  if (!APPLY) {
    console.log('\nDry-run terminado. Revisar el reporte y correr con --apply.');
    return;
  }

  let applied = 0;
  for (const { row, normalized } of updates) {
    // Guard por valor actual: si alguien lo editó mientras corría el script, no se pisa
    const result = await withRetry(() =>
      query('UPDATE users SET phone = $1, updated_at = NOW() WHERE id = $2 AND phone = $3', [
        normalized,
        row.id,
        row.phone
      ])
    );
    applied += result.rowCount ?? 0;
  }
  console.log(`\n✅ Normalizados: ${applied}/${updates.length}`);
}

main()
  .catch((error) => {
    console.error('❌ Error normalizando teléfonos:', error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
