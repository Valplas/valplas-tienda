/**
 * Tipos compartidos para respuestas API
 */

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiPaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: PaginationMeta;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiPaginatedResponse<T> | ApiErrorResponse;

export interface PaginationMeta {
  page?: number;
  limit: number;
  total: number;
  totalPages?: number;
  cursor?: string;
  hasMore: boolean;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  cursor?: string;
}
