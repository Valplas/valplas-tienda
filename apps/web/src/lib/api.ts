const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  pagination?: {
    page?: number;
    limit: number;
    total: number;
    totalPages?: number;
    cursor?: string;
    hasMore: boolean;
  };
}

/** Error HTTP de la API con el código y los detalles que manda el backend. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// eslint-disable-next-line no-undef
export interface FetchOptions extends RequestInit {
  silentErrors?: boolean; // No loggear errores en consola
  skipAuthRedirect?: boolean; // No redirigir en caso de 401 (ej: initialize al cargar la app)
  /** Interno: marca un reintento post-refresh para no reintentar en bucle */
  _isRetry?: boolean;
  /** Interno: marca un reintento con token CSRF nuevo */
  _isCsrfRetry?: boolean;
}

// ─── CSRF ─────────────────────────────────────────────────────────────────────
// La API exige el header x-csrf-token en todo request que modifica algo. El
// token se pide a GET /auth/csrf-token (la API está en otro sitio: no podemos
// leer sus cookies) y se guarda en memoria. Está atado a la sesión: tras
// login/logout/refresh se descarta y se pide uno nuevo en la próxima mutación.
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

let csrfToken: string | null = null;
let csrfPromise: Promise<string | null> | null = null;

function resetCsrfToken() {
  csrfToken = null;
}

/**
 * null = la API todavía no expone el endpoint (404: web desplegada antes que
 * la API); se manda sin header y la API vieja, que no lo exige, responde igual.
 */
function getCsrfToken(): Promise<string | null> {
  if (csrfToken) return Promise.resolve(csrfToken);
  if (!csrfPromise) {
    csrfPromise = fetch(`${API_URL}/auth/csrf-token`, { credentials: 'include', cache: 'no-store' })
      .then(async (res) => {
        if (res.status === 404) return null;
        const body = (await res.json().catch(() => null)) as ApiResponse<{
          csrfToken: string;
        }> | null;
        if (!res.ok || !body?.data?.csrfToken) {
          throw new ApiError('No se pudo conectar de forma segura', res.status, 'CSRF_UNAVAILABLE');
        }
        csrfToken = body.data.csrfToken;
        return csrfToken;
      })
      .finally(() => {
        csrfPromise = null;
      });
  }
  return csrfPromise;
}

async function csrfHeaders(): Promise<Record<string, string>> {
  const token = await getCsrfToken();
  return token ? { [CSRF_HEADER]: token } : {};
}

// Dedup de refreshes concurrentes: todas las requests que reciben 401 esperan el
// MISMO refresh en lugar de disparar uno cada una (evita rotaciones de token en carrera).
let refreshPromise: Promise<boolean> | null = null;

async function postRefresh(): Promise<Response> {
  const send = async () =>
    fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: await csrfHeaders()
    });

  let res = await send();
  // Token CSRF de una sesión anterior (ej: otra pestaña ya rotó el refresh): uno nuevo
  if (res.status === 403) {
    resetCsrfToken();
    res = await send();
  }
  return res;
}

function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = postRefresh()
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        // El refresh rota la sesión: el token CSRF anterior ya no vale
        resetCsrfToken();
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function isCsrfError(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  const body = (await res
    .clone()
    .json()
    .catch(() => null)) as ApiResponse<unknown> | null;
  return body?.error?.code === 'CSRF_INVALID';
}

function handleSessionExpired() {
  if (typeof window === 'undefined') return;
  // Redirigir a login UNA sola vez (el guard de pathname evita loops de recarga)
  if (!window.location.pathname.startsWith('/login')) {
    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?redirect=${redirect}`;
  }
}

/**
 * Cliente HTTP para llamadas a la API
 */
async function fetchApi<T>(endpoint: string, options?: FetchOptions): Promise<ApiResponse<T>> {
  const url = `${API_URL}${endpoint}`;
  const { silentErrors, skipAuthRedirect, _isRetry, _isCsrfRetry, ...fetchOptions } = options || {};

  // FormData: el browser setea su propio Content-Type con el boundary del
  // multipart — forzar 'application/json' acá rompería el parseo en el server.
  const isFormData = fetchOptions.body instanceof FormData;
  const isMutation = !SAFE_METHODS.has((fetchOptions.method ?? 'GET').toUpperCase());

  const res = await fetch(url, {
    ...fetchOptions,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(isMutation ? await csrfHeaders() : {}),
      ...fetchOptions?.headers
    },
    credentials: 'include'
  });

  if (res.ok) {
    // login/registro/logout cambian la sesión: el token CSRF anterior ya no vale
    if (isMutation && endpoint.startsWith('/auth/')) resetCsrfToken();
    return res.json();
  }

  // 403 CSRF: el token quedó de una sesión anterior (otra pestaña, refresh).
  // Se pide uno nuevo y se reintenta UNA vez.
  if (isMutation && !_isCsrfRetry && (await isCsrfError(res))) {
    resetCsrfToken();
    return fetchApi<T>(endpoint, { ...options, _isCsrfRetry: true });
  }

  // 401: intentar refresh UNA sola vez. Si ya es un reintento, o si el endpoint ES
  // /auth/refresh, no se reintenta — esto corta cualquier loop de refresh/retry.
  if (res.status === 401 && !_isRetry && !endpoint.includes('/auth/refresh')) {
    const refreshed = await refreshSession();

    if (refreshed) {
      // Token renovado — reintentar el request original exactamente una vez
      return fetchApi<T>(endpoint, { ...options, _isRetry: true });
    }

    // Refresh falló — la sesión expiró de verdad
    if (!skipAuthRedirect) {
      handleSessionExpired();
      return Promise.reject(new Error('Sesión expirada'));
    }
  }

  const errorData = (await res.json().catch(() => ({}))) as ApiResponse<unknown>;
  if (!silentErrors) console.error('API Error:', errorData);
  throw new ApiError(
    errorData.error?.message || 'Error de conexión',
    res.status,
    errorData.error?.code,
    errorData.error?.details
  );
}

/**
 * GET request
 */
export async function get<T>(endpoint: string, options?: FetchOptions): Promise<ApiResponse<T>> {
  return fetchApi<T>(endpoint, { ...options, method: 'GET' });
}

/**
 * POST request
 */
export async function post<T>(
  endpoint: string,
  body?: unknown,
  options?: FetchOptions
): Promise<ApiResponse<T>> {
  return fetchApi<T>(endpoint, {
    ...options,
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined
  });
}

/**
 * PUT request
 */
export async function put<T>(
  endpoint: string,
  body?: unknown,
  options?: FetchOptions
): Promise<ApiResponse<T>> {
  return fetchApi<T>(endpoint, {
    ...options,
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined
  });
}

/**
 * PATCH request
 */
export async function patch<T>(
  endpoint: string,
  body?: unknown,
  options?: FetchOptions
): Promise<ApiResponse<T>> {
  return fetchApi<T>(endpoint, {
    ...options,
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined
  });
}

/**
 * DELETE request
 */
export async function del<T>(endpoint: string, options?: FetchOptions): Promise<ApiResponse<T>> {
  return fetchApi<T>(endpoint, { ...options, method: 'DELETE' });
}

/**
 * POST multipart/form-data (upload de archivos)
 */
export async function postFormData<T>(
  endpoint: string,
  formData: FormData,
  options?: FetchOptions
): Promise<ApiResponse<T>> {
  return fetchApi<T>(endpoint, { ...options, method: 'POST', body: formData });
}
