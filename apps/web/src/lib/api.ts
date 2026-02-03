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

/**
 * Obtener token de acceso del localStorage
 */
function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token');
}

/**
 * Guardar token de acceso en localStorage
 */
export function setAccessToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('access_token', token);
}

/**
 * Eliminar token de acceso del localStorage
 */
export function removeAccessToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('access_token');
}

/**
 * Cliente HTTP para llamadas a la API
 */
async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const url = `${API_URL}${endpoint}`;
  const token = getAccessToken();

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options?.headers
      },
      credentials: 'include' // Para cookies de autenticacion (refresh token)
    });

    const data = await res.json();

    if (!res.ok) {
      // Si es 401, el token expiró
      if (res.status === 401) {
        removeAccessToken();
        // Podríamos intentar refresh aquí en el futuro
      }
      throw new Error(data.error?.message || 'Error de conexión');
    }

    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

/**
 * GET request
 */
export async function get<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
  return fetchApi<T>(endpoint, { ...options, method: 'GET' });
}

/**
 * POST request
 */
export async function post<T>(
  endpoint: string,
  body?: unknown,
  options?: RequestInit
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
  options?: RequestInit
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
  options?: RequestInit
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
export async function del<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
  return fetchApi<T>(endpoint, { ...options, method: 'DELETE' });
}
