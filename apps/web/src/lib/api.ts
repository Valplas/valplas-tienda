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

// eslint-disable-next-line no-undef
export interface FetchOptions extends RequestInit {
  silentErrors?: boolean; // No loggear errores en consola
  skipAuthRedirect?: boolean; // No redirigir en caso de 401 (ej: initialize al cargar la app)
  /** Interno: marca un reintento post-refresh para no reintentar en bucle */
  _isRetry?: boolean;
}

// Dedup de refreshes concurrentes: todas las requests que reciben 401 esperan el
// MISMO refresh en lugar de disparar uno cada una (evita rotaciones de token en carrera).
let refreshPromise: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include'
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
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
  const { silentErrors, skipAuthRedirect, _isRetry, ...fetchOptions } = options || {};

  const res = await fetch(url, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions?.headers
    },
    credentials: 'include'
  });

  if (res.ok) {
    return res.json();
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

  const errorData = await res.json().catch(() => ({}));
  if (!silentErrors) console.error('API Error:', errorData);
  throw new Error((errorData as ApiResponse<unknown>).error?.message || 'Error de conexión');
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
