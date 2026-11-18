/**
 * Copia los datos de producción a la base de dev (catálogo con medidas y stock, precios,
 * clientes, pedidos), para probar con datos reales: por ejemplo el bot de WhatsApp.
 *
 * Uso (desde apps/api, con PROD_DATABASE_URL en .env o en el entorno):
 *   bun run db:copy-prod-to-dev                                    # dry-run (default)
 *   bun run db:copy-prod-to-dev --rehearse                         # copia todo y hace ROLLBACK
 *   bun run db:copy-prod-to-dev --apply --confirm-target=<ref>     # escribe en dev
 *
 * - Origen: PROD_DATABASE_URL, leído en una transacción REPEATABLE READ READ ONLY: foto
 *   consistente de prod y ninguna escritura posible.
 * - Destino: DATABASE_URL (dev). REEMPLAZA los datos: TRUNCATE de todas las tablas públicas salvo
 *   schema_migrations y copia tabla por tabla. Lo que exista solo en dev se pierde (pedidos y
 *   usuarios de prueba, config de envíos de dev). Las contraseñas pasan a ser las de prod.
 * - No copia refresh_tokens (sesiones) ni schema_migrations (cada base conserva su esquema).
 * - Todo en una transacción con session_replication_role = replica: no disparan triggers
 *   (reserva de stock, outbox de webhooks del bot, updated_at). Antes del COMMIT verifica conteos
 *   y FKs; si algo no cierra hace ROLLBACK y dev queda como estaba.
 * - Columnas que dev tiene y prod no (migraciones pendientes en prod) toman su DEFAULT. Si prod
 *   tiene tablas o columnas que dev no, aborta: correr las migraciones en dev primero.
 * - Las imágenes no se copian: las URLs siguen apuntando al Storage (público) de prod.
 *
 * TLS: Supabase firma con su propia CA (Settings → Database → SSL → Download certificate).
 * Se exige validar el certificado: DATABASE_CA_CERT_FILE (ruta al .crt) o DATABASE_CA_CERT (PEM).
 * Sin CA el script aborta, salvo --insecure-tls (cifrado sin validar, expuesto a MITM).
 */
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
import pg from 'pg';
import {
  buildCopyPlan,
  dbIdentity,
  type CopyPlan,
  type SchemaSnapshot,
  type TableCopy
} from './prod-to-dev-plan.js';

dotenv.config();

const APPLY = process.argv.includes('--apply');
/** Ensayo: corre la copia completa con sus verificaciones y termina en ROLLBACK. */
const REHEARSE = process.argv.includes('--rehearse');
const CONFIRM_TARGET = process.argv
  .find((arg) => arg.startsWith('--confirm-target='))
  ?.slice('--confirm-target='.length);
const INSECURE_TLS = process.argv.includes('--insecure-tls');
const CHUNK_SIZE = 2000;

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** Falla cerrado: sin CA no se conecta, salvo opt-in explícito con --insecure-tls. */
function sslConfig(): pg.ClientConfig['ssl'] {
  const caFile = process.env.DATABASE_CA_CERT_FILE;
  // El PEM puede venir en una sola línea con \n literales (igual que en client.ts)
  const ca = caFile
    ? readFileSync(caFile, 'utf8')
    : process.env.DATABASE_CA_CERT?.replace(/\\n/g, '\n');
  if (ca) return { ca, rejectUnauthorized: true };
  if (INSECURE_TLS) {
    console.warn(
      '⚠️  --insecure-tls: TLS cifrado pero SIN validar el certificado (expuesto a MITM).'
    );
    return { rejectUnauthorized: false };
  }
  throw new Error(
    'Falta la CA de Supabase para validar TLS: definí DATABASE_CA_CERT_FILE=<ruta al .crt> ' +
      '(Settings → Database → SSL → Download certificate) o DATABASE_CA_CERT. ' +
      'Solo si aceptás el riesgo de MITM: --insecure-tls.'
  );
}

/** El pooler de Supabase suele tardar más de 2s en la primera conexión de un proceso nuevo. */
async function connect(url: string, ssl: pg.ClientConfig['ssl']): Promise<pg.Client> {
  for (let attempt = 1; ; attempt++) {
    const client = new pg.Client({ connectionString: url, ssl, connectionTimeoutMillis: 15000 });
    try {
      await client.connect();
      return client;
    } catch (error) {
      await client.end().catch(() => undefined);
      if (attempt >= 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

async function loadSchema(client: pg.Client): Promise<SchemaSnapshot> {
  const { rows: columns } = await client.query<{
    table_name: string;
    column_name: string;
    generated: boolean;
    required: boolean;
  }>(
    `SELECT c.table_name, c.column_name,
            c.is_generated = 'ALWAYS' AS generated,
            c.is_nullable = 'NO' AND c.column_default IS NULL AND c.is_identity = 'NO' AS required
     FROM information_schema.columns c
     JOIN information_schema.tables t
       ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
     ORDER BY c.table_name, c.ordinal_position`
  );
  const { rows: keys } = await client.query<{ table_name: string; column_name: string }>(
    `SELECT tc.table_name, kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
     WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
     ORDER BY tc.table_name, kcu.ordinal_position`
  );

  const snapshot: SchemaSnapshot = new Map();
  for (const col of columns) {
    let table = snapshot.get(col.table_name);
    if (!table) {
      table = { name: col.table_name, columns: [], primaryKey: [] };
      snapshot.set(col.table_name, table);
    }
    table.columns.push({
      name: col.column_name,
      generated: col.generated,
      required: col.required
    });
  }
  for (const key of keys) snapshot.get(key.table_name)?.primaryKey.push(key.column_name);
  return snapshot;
}

async function countRows(client: pg.Client, table: string): Promise<number> {
  const { rows } = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${ident(table)}`
  );
  return rows[0].n;
}

/**
 * Lee de prod como JSON en texto (sin parsear en JS: no se pierde precisión de NUMERIC ni zona
 * horaria) y lo inserta en dev con json_populate_recordset, que castea al tipo de cada columna.
 */
async function copyTable(source: pg.Client, target: pg.Client, plan: TableCopy): Promise<number> {
  const columnList = plan.columns.map(ident).join(', ');
  const table = ident(plan.table);
  // Sin PK no hay orden estable para paginar: se lee entera en un solo chunk
  const paginate = plan.primaryKey.length > 0;
  const orderBy = plan.primaryKey.map(ident).join(', ');
  let inserted = 0;

  for (let offset = 0; ; offset += CHUNK_SIZE) {
    const { rows } = await source.query<{ data: string | null }>(
      paginate
        ? `SELECT json_agg(t)::text AS data FROM (
             SELECT ${columnList} FROM ${table} ORDER BY ${orderBy} LIMIT $1 OFFSET $2
           ) t`
        : `SELECT json_agg(t)::text AS data FROM (SELECT ${columnList} FROM ${table}) t`,
      paginate ? [CHUNK_SIZE, offset] : []
    );
    const data = rows[0].data;
    if (!data) break;

    const result = await target.query(
      `INSERT INTO ${table} (${columnList})
       SELECT ${columnList} FROM json_populate_recordset(NULL::${table}, $1::json)`,
      [data]
    );
    inserted += result.rowCount ?? 0;
    if (!paginate || (result.rowCount ?? 0) < CHUNK_SIZE) break;
  }
  return inserted;
}

/** Con replica no se chequean FKs al insertar: se verifican todas antes del COMMIT. */
async function findDanglingForeignKeys(client: pg.Client): Promise<string[]> {
  const { rows: fks } = await client.query<{
    name: string;
    child: string;
    child_col: string;
    parent: string;
    parent_col: string;
  }>(
    `SELECT c.conname AS name, c.conrelid::regclass::text AS child, a.attname AS child_col,
            c.confrelid::regclass::text AS parent, af.attname AS parent_col
     FROM pg_constraint c
     JOIN pg_namespace n ON n.oid = c.connamespace
     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = c.confkey[1]
     WHERE c.contype = 'f' AND n.nspname = 'public' AND cardinality(c.conkey) = 1`
  );

  const dangling: string[] = [];
  for (const fk of fks) {
    // regclass::text ya viene con las comillas que haga falta
    const { rows } = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${fk.child} ch
       WHERE ch.${ident(fk.child_col)} IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM ${fk.parent} p WHERE p.${ident(fk.parent_col)} = ch.${ident(fk.child_col)}
         )`
    );
    if (rows[0].n > 0) {
      dangling.push(
        `${fk.name}: ${rows[0].n} filas de ${fk.child}.${fk.child_col} sin ${fk.parent}`
      );
    }
  }
  return dangling;
}

function printPlan(
  plan: CopyPlan,
  sourceCounts: Map<string, number>,
  targetCounts: Map<string, number>
) {
  console.log(`\n${'tabla'.padEnd(28)}${'dev hoy'.padStart(10)}  →  prod`);
  for (const table of plan.truncate) {
    const now = String(targetCounts.get(table) ?? 0).padStart(10);
    const copy = plan.copy.find((c) => c.table === table);
    const after = copy
      ? String(sourceCounts.get(table) ?? 0)
      : plan.targetOnly.includes(table)
        ? '0 (solo existe en dev: se vacía)'
        : '0 (se vacía, no se copia)';
    console.log(`${table.padEnd(28)}${now}  →  ${after}`);
  }
  const defaulted = plan.copy.flatMap((c) => c.defaulted.map((col) => `${c.table}.${col}`));
  if (defaulted.length > 0) {
    console.log(`\nColumnas solo de dev (toman su DEFAULT): ${defaulted.join(', ')}`);
  }
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Este script no corre con NODE_ENV=production.');
  }
  const sourceUrl = process.env.PROD_DATABASE_URL;
  const targetUrl = process.env.DATABASE_URL;
  if (!sourceUrl) throw new Error('Falta PROD_DATABASE_URL (la base de prod a copiar).');
  if (!targetUrl) throw new Error('Falta DATABASE_URL (la base de dev a reemplazar).');

  const sourceId = dbIdentity(sourceUrl);
  const targetId = dbIdentity(targetUrl);
  if (sourceId.key === targetId.key || sourceId.ref === targetId.ref) {
    throw new Error(
      'PROD_DATABASE_URL y DATABASE_URL apuntan a la misma base. ¿Quedó la URL de prod activa en .env?'
    );
  }

  if (APPLY && REHEARSE) throw new Error('Usar --apply o --rehearse, no los dos.');

  console.log(
    APPLY
      ? '✍️  Modo APPLY: se reemplazan los datos de dev'
      : REHEARSE
        ? '🧪 Ensayo: copia completa y ROLLBACK al final, dev no cambia'
        : '🔍 Dry-run: no se escribe nada'
  );
  console.log(`Origen  (prod, solo lectura): ${sourceId.ref} @ ${sourceId.host}`);
  console.log(`Destino (dev, se reemplaza):  ${targetId.ref} @ ${targetId.host}`);

  if (APPLY && CONFIRM_TARGET !== targetId.ref) {
    throw new Error(`Para escribir hay que confirmar el destino: --confirm-target=${targetId.ref}`);
  }

  const ssl = sslConfig();
  const source = await connect(sourceUrl, ssl);
  const target = await connect(targetUrl, ssl);
  let targetInTransaction = false;

  try {
    // Una sola foto de prod para todas las lecturas; READ ONLY: prod no se puede modificar
    await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');

    const [sourceSchema, targetSchema] = await Promise.all([
      loadSchema(source),
      loadSchema(target)
    ]);
    const plan = buildCopyPlan(sourceSchema, targetSchema);
    if (plan.errors.length > 0) {
      throw new Error(
        `El esquema de dev no es compatible con prod:\n  ${plan.errors.join('\n  ')}`
      );
    }

    const sourceCounts = new Map<string, number>();
    for (const { table } of plan.copy) sourceCounts.set(table, await countRows(source, table));
    const targetCounts = new Map<string, number>();
    for (const table of plan.truncate) targetCounts.set(table, await countRows(target, table));

    printPlan(plan, sourceCounts, targetCounts);

    if (!APPLY && !REHEARSE) {
      console.log('\nDry-run terminado. Para aplicar (borra los datos actuales de dev):');
      console.log(`  bun run db:copy-prod-to-dev --apply --confirm-target=${targetId.ref}`);
      return;
    }

    await target.query('BEGIN');
    targetInTransaction = true;
    // Si la API de dev tiene un lock tomado, fallar rápido en vez de colgarse
    await target.query("SET LOCAL lock_timeout = '15s'");
    await target.query("SET LOCAL statement_timeout = '5min'");
    // Sin triggers ni chequeo de FKs durante la carga (se verifican al final)
    await target.query('SET LOCAL session_replication_role = replica');
    await target.query(`TRUNCATE ${plan.truncate.map(ident).join(', ')}`);

    console.log('');
    for (const tableCopy of plan.copy) {
      const inserted = await copyTable(source, target, tableCopy);
      const expected = sourceCounts.get(tableCopy.table) ?? 0;
      if (inserted !== expected) {
        throw new Error(`${tableCopy.table}: se insertaron ${inserted} filas de ${expected}.`);
      }
      console.log(`  ✓ ${tableCopy.table}: ${inserted}`);
    }

    const dangling = await findDanglingForeignKeys(target);
    if (dangling.length > 0) {
      throw new Error(`Quedaron FKs rotas:\n  ${dangling.join('\n  ')}`);
    }

    if (REHEARSE) {
      await target.query('ROLLBACK');
      targetInTransaction = false;
      console.log('\n✅ Ensayo OK (conteos y FKs verificados). ROLLBACK: dev no cambió.');
      console.log(
        `Para aplicar: bun run db:copy-prod-to-dev --apply --confirm-target=${targetId.ref}`
      );
      return;
    }

    await target.query('COMMIT');
    targetInTransaction = false;
    console.log(
      '\n✅ Dev quedó con los datos de prod. Los logins de dev ahora usan las contraseñas de prod.'
    );
  } finally {
    if (targetInTransaction) {
      await target.query('ROLLBACK').catch(() => undefined);
      console.error('↩️  ROLLBACK: dev quedó como estaba.');
    }
    await source.query('ROLLBACK').catch(() => undefined);
    await Promise.all([source.end(), target.end()]);
  }
}

main().catch((error: unknown) => {
  console.error('❌ Error copiando prod → dev:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
