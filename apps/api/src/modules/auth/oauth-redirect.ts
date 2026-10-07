// apps/api/src/modules/auth/oauth-redirect.ts

const MAX_REDIRECT_LENGTH = 512;

/**
 * Path relativo seguro para redirigir después del login con Google, o null.
 * Rechaza URLs absolutas, protocol-relative (//host) y cualquier espacio o backslash:
 * los browsers normalizan "/\t/host" y "/\host" a "//host" (open redirect).
 */
export function sanitizeRedirect(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (raw.length === 0 || raw.length > MAX_REDIRECT_LENGTH) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  if (/[\s\\]/.test(raw)) return null;
  return raw;
}

export function defaultRedirectForRole(role: string): string {
  return role === 'admin' || role === 'owner' ? '/admin' : '/cuenta';
}
