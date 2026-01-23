export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiPaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: {
    page?: number;
    limit: number;
    total: number;
    totalPages?: number;
    cursor?: string;
    hasMore: boolean;
  };
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

/**
 * Helper para construir respuestas API estandarizadas
 */
export class ApiResponseBuilder {
  /**
   * Respuesta exitosa simple
   */
  static success<T>(data: T): ApiSuccessResponse<T> {
    return {
      success: true,
      data
    };
  }

  /**
   * Respuesta paginada
   */
  static paginated<T>(
    data: T[],
    pagination: {
      page?: number;
      limit: number;
      total: number;
      totalPages?: number;
      cursor?: string;
      hasMore: boolean;
    }
  ): ApiPaginatedResponse<T> {
    return {
      success: true,
      data,
      pagination
    };
  }

  /**
   * Respuesta de error
   */
  static error(code: string, message: string, details?: unknown): ApiErrorResponse {
    return {
      success: false,
      error: {
        code,
        message,
        details
      }
    };
  }
}
