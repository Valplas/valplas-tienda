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
   * Respuesta paginada (con objeto)
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
  ): ApiPaginatedResponse<T>;

  /**
   * Respuesta paginada (con argumentos separados)
   */
  static paginated<T>(
    data: T[],
    page: number,
    limit: number,
    total: number
  ): ApiPaginatedResponse<T>;

  /**
   * Implementación
   */
  static paginated<T>(
    data: T[],
    paginationOrPage:
      | {
          page?: number;
          limit: number;
          total: number;
          totalPages?: number;
          cursor?: string;
          hasMore: boolean;
        }
      | number,
    limit?: number,
    total?: number
  ): ApiPaginatedResponse<T> {
    // Si el segundo argumento es un número, usar la firma con argumentos separados
    if (typeof paginationOrPage === 'number') {
      const page = paginationOrPage;
      if (limit === undefined || total === undefined) {
        throw new Error('limit and total are required when using numeric pagination');
      }
      return {
        success: true,
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: page * limit < total
        }
      };
    }

    // Usar la firma con objeto
    return {
      success: true,
      data,
      pagination: paginationOrPage
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
