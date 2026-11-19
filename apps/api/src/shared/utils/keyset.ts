// Paginación por cursor (keyset / método de búsqueda).
//
// En vez de OFFSET (que lee y descarta todas las filas anteriores y se degrada con cada página),
// se filtra por los valores de la última fila de la página previa con row values:
//   WHERE (created_at, id) < ($1::timestamptz, $2::uuid) ORDER BY created_at DESC, id DESC
// Requisitos: orden determinista (la última columna es única, p.ej. id) y todas las columnas del
// orden con la MISMA dirección, así el predicado es un único row value y un índice con ese orden
// lo usa como predicado de acceso (rendimiento-sql-conceptos §7).
//
// Los valores del cursor viajan como TEXTO tal cual los devuelve la DB: un timestamptz que pasa por
// Date de JS pierde los microsegundos y haría repetir o saltear filas en el borde de la página.

import { AppError } from '../middleware/error.middleware.js';

export type SortDirection = 'ASC' | 'DESC';

/** Timestamp como texto ISO con microsegundos en UTC (round-trip exacto con ::timestamptz). */
export function tsKey(column: string): string {
  return `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
}

interface CursorPayload {
  /** Identifica el orden al que pertenece: un cursor de otro orden se rechaza. */
  s: string;
  v: string[];
}

export function encodeCursor(sortTag: string, values: string[]): string {
  const payload: CursorPayload = { s: sortTag, v: values };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function invalidCursor(): AppError {
  return new AppError('INVALID_CURSOR', 'Cursor de paginación inválido', 400);
}

export function decodeCursor(cursor: string, sortTag: string, length: number): string[] {
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }

  const candidate = payload as Partial<CursorPayload> | null;
  if (
    !candidate ||
    candidate.s !== sortTag ||
    !Array.isArray(candidate.v) ||
    candidate.v.length !== length ||
    !candidate.v.every((value) => typeof value === 'string')
  ) {
    throw invalidCursor();
  }

  return candidate.v;
}

/**
 * Predicado "después del cursor" para columnas con la misma dirección.
 * `types` son los casts SQL de cada valor (timestamptz, uuid, text, numeric...).
 */
export function keysetPredicate(
  columns: string[],
  direction: SortDirection,
  types: string[],
  firstParam: number
): string {
  if (columns.length !== types.length) {
    throw new Error('keysetPredicate: columns y types deben tener la misma longitud');
  }
  const placeholders = types.map((type, i) => `$${firstParam + i}::${type}`);
  const operator = direction === 'ASC' ? '>' : '<';
  return `(${columns.join(', ')}) ${operator} (${placeholders.join(', ')})`;
}

export interface KeysetPage<T> {
  rows: T[];
  hasMore: boolean;
}

/**
 * Se piden limit + 1 filas: la extra solo indica que hay otra página y se descarta.
 */
export function sliceKeysetPage<T>(rows: T[], limit: number): KeysetPage<T> {
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}
