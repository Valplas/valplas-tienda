// Filtros por fecha sargables (rango semiabierto [inicio, fin)) en hora de Argentina.
//
// Reglas (rendimiento-sql-conceptos §2.11): no aplicar funciones a la columna
// (`DATE(created_at ...) = $1`) y no usar `<=` en el límite superior de un día.
// Se compara la columna cruda contra límites calculados del lado del parámetro, así
// `idx_orders_created_at` se usa como predicado de acceso.

export const AR_TIMEZONE = 'America/Argentina/Buenos_Aires';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` sin hora: representa el día calendario completo en hora de Argentina. */
export function isDateOnly(value: string): boolean {
  return DATE_ONLY.test(value);
}

/** Acepta `YYYY-MM-DD` real (no 2026-02-31) o un timestamp ISO parseable. */
export function isValidDateInput(value: string): boolean {
  if (isDateOnly(value)) {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
  }
  return !Number.isNaN(Date.parse(value));
}

/** Inicio (inclusive) del día `placeholder` ($n con un `YYYY-MM-DD`) en hora de Argentina. */
export function dayStartSql(placeholder: string): string {
  return `(${placeholder}::date)::timestamp AT TIME ZONE '${AR_TIMEZONE}'`;
}

/** Fin (exclusivo) del día `placeholder`: el inicio del día siguiente en hora de Argentina. */
export function dayEndExclusiveSql(placeholder: string): string {
  return `((${placeholder}::date) + 1)::timestamp AT TIME ZONE '${AR_TIMEZONE}'`;
}

/**
 * Condición sobre `column` para un límite inferior. `YYYY-MM-DD` → desde el inicio de ese día
 * (hora de Argentina); un timestamp se usa tal cual.
 */
export function fromBoundSql(column: string, value: string, placeholder: string): string {
  return isDateOnly(value)
    ? `${column} >= ${dayStartSql(placeholder)}`
    : `${column} >= ${placeholder}::timestamptz`;
}

/**
 * Condición sobre `column` para un límite superior. `YYYY-MM-DD` → hasta el fin de ese día
 * inclusive (rango abierto al inicio del día siguiente); un timestamp se usa tal cual.
 */
export function toBoundSql(column: string, value: string, placeholder: string): string {
  return isDateOnly(value)
    ? `${column} < ${dayEndExclusiveSql(placeholder)}`
    : `${column} <= ${placeholder}::timestamptz`;
}
