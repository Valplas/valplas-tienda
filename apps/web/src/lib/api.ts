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
}

// Flag de módulo para evitar múltiples refreshes simultáneos
let isRefreshing = false;

/**
 * Cliente HTTP para llamadas a la API
 */
async function fetchApi<T>(endpoint: string, options?: FetchOptions): Promise<ApiResponse<T>> {
  const url = `${API_URL}${endpoint}`;
  const { silentErrors, ...fetchOptions } = options || {};

  const res = await fetch(url, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions?.headers
    },
    credentials: 'include'
  });

  if (!res.ok) {
    // 401: intentar refresh, pero no si ya estamos refreshing o si el endpoint ES refresh
    if (res.status === 401 && !isRefreshing && !endpoint.includes('/auth/refresh')) {
      isRefreshing = true;

      try {
        const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include'
        });

        isRefreshing = false;

        if (refreshRes.ok) {
          // Token renovado — reintentar el request original
          return fetchApi<T>(endpoint, options);
        }
      } catch {
        isRefreshing = false;
      }

      // Refresh falló — redirigir a login
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }

    const errorData = await res.json().catch(() => ({}));
    if (!silentErrors) console.error('API Error:', errorData);
    throw new Error((errorData as ApiResponse<unknown>).error?.message || 'Error de conexión');
  }

  return res.json();
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
