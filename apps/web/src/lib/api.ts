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

/**
 * Cliente HTTP para llamadas a la API
 */
async function fetchApi<T>(endpoint: string, options?: FetchOptions): Promise<ApiResponse<T>> {
  const url = `${API_URL}${endpoint}`;
  const { silentErrors, ...fetchOptions } = options || {};

  try {
    const res = await fetch(url, {
      ...fetchOptions,
      headers: {
        'Content-Type': 'application/json',
        ...fetchOptions?.headers
      },
      credentials: 'include'
    });

    const data = await res.json();

    if (!res.ok) {
      if (res.status === 401) {
        // Placeholder — el refresh automático se implementa en Tarea 4
      }
      throw new Error(data.error?.message || 'Error de conexión');
    }

    return data;
  } catch (error) {
    if (!silentErrors) console.error('API Error:', error);
    throw error;
  }
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
