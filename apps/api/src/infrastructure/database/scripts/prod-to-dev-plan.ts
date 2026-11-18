/**
 * Lógica pura de copy-prod-to-dev.ts: decide qué tablas y columnas se copian comparando el
 * esquema de prod (origen) con el de dev (destino). Sin I/O para poder testearla.
 */

export interface ColumnMeta {
  name: string;
  /** GENERATED ALWAYS: Postgres lo calcula, no se puede insertar. */
  generated: boolean;
  /** NOT NULL sin DEFAULT: si falta en el origen, el INSERT falla. */
  required: boolean;
}

export interface TableMeta {
  name: string;
  columns: ColumnMeta[];
  primaryKey: string[];
}

export type SchemaSnapshot = Map<string, TableMeta>;

export interface TableCopy {
  table: string;
  /** Columnas que se leen de prod y se insertan en dev. */
  columns: string[];
  /** Columnas que solo existen en dev (migraciones no aplicadas en prod): toman su DEFAULT. */
  defaulted: string[];
  primaryKey: string[];
}

export interface CopyPlan {
  copy: TableCopy[];
  /** Tablas de dev que se vacían antes de copiar. */
  truncate: string[];
  /** Tablas que solo existen en dev: se vacían y quedan vacías. */
  targetOnly: string[];
  errors: string[];
}

/** Cada base conserva su propio historial de migraciones. */
const KEEP_IN_TARGET = new Set(['schema_migrations']);
/** Sesiones: no sirven fuera de su entorno. Se vacían en dev pero no se copian. */
const NEVER_COPY = new Set(['schema_migrations', 'refresh_tokens']);

export function buildCopyPlan(source: SchemaSnapshot, target: SchemaSnapshot): CopyPlan {
  const errors: string[] = [];
  const copy: TableCopy[] = [];

  for (const name of [...source.keys()].sort()) {
    if (NEVER_COPY.has(name)) continue;
    if (!target.has(name)) {
      errors.push(`La tabla ${name} existe en prod pero no en dev: correr las migraciones en dev.`);
    }
  }

  for (const [name, targetTable] of [...target.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const sourceTable = source.get(name);
    if (!sourceTable || NEVER_COPY.has(name)) continue;

    const targetColumns = new Map(targetTable.columns.map((col) => [col.name, col]));
    const sourceColumns = new Set(sourceTable.columns.map((col) => col.name));

    for (const col of sourceTable.columns) {
      if (!targetColumns.has(col.name)) {
        errors.push(
          `La columna ${name}.${col.name} existe en prod pero no en dev: correr las migraciones en dev.`
        );
      }
    }

    const columns: string[] = [];
    const defaulted: string[] = [];
    for (const col of targetTable.columns) {
      if (col.generated) continue;
      if (sourceColumns.has(col.name)) {
        columns.push(col.name);
      } else if (col.required) {
        errors.push(`La columna ${name}.${col.name} es NOT NULL sin DEFAULT y prod no la tiene.`);
      } else {
        defaulted.push(col.name);
      }
    }

    copy.push({ table: name, columns, defaulted, primaryKey: targetTable.primaryKey });
  }

  const truncate = [...target.keys()].filter((name) => !KEEP_IN_TARGET.has(name)).sort();
  const targetOnly = truncate.filter((name) => !source.has(name));

  return { copy, truncate, targetOnly, errors };
}

export interface DbIdentity {
  /** host:puerto/base usuario — dos URLs con la misma key apuntan a la misma base. */
  key: string;
  /** Project ref de Supabase (o host/base si no es Supabase). Se usa para confirmar el destino. */
  ref: string;
  host: string;
}

export function dbIdentity(url: string): DbIdentity {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  const user = decodeURIComponent(parsed.username);
  const database = parsed.pathname.replace(/^\//, '') || 'postgres';
  const port = parsed.port || '5432';

  // Pooler: usuario postgres.<ref>. Conexión directa: host db.<ref>.supabase.co
  const ref =
    user.match(/^[^.]+\.(.+)$/)?.[1] ??
    host.match(/^db\.([^.]+)\.supabase\.co$/)?.[1] ??
    `${host}/${database}`;

  return { key: `${host}:${port}/${database} ${user}`, ref, host };
}
