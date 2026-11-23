// apps/api/src/infrastructure/external/andreani/errors.ts
//
// Errores tipados del cliente de Andreani. `code` es lo que consumen domain y job para decidir
// si reintentar (isRetryable) o mostrar un mensaje al usuario.

export type AndreaniErrorCode =
  | 'TIMEOUT'
  | 'AUTH'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'UPSTREAM'
  | 'NETWORK';

export interface AndreaniFieldError {
  field: string;
  message: string;
}

export class AndreaniError extends Error {
  readonly code: AndreaniErrorCode;
  readonly status: number | null;
  readonly fieldErrors: AndreaniFieldError[];

  constructor(
    code: AndreaniErrorCode,
    message: string,
    options: { status?: number | null; fieldErrors?: AndreaniFieldError[] } = {}
  ) {
    super(message);
    this.name = 'AndreaniError';
    this.code = code;
    this.status = options.status ?? null;
    this.fieldErrors = options.fieldErrors ?? [];
  }
}

/** Errores transitorios: vale la pena reintentar más tarde. */
export function isRetryable(e: unknown): boolean {
  return (
    e instanceof AndreaniError &&
    (e.code === 'TIMEOUT' || e.code === 'UPSTREAM' || e.code === 'NETWORK')
  );
}
