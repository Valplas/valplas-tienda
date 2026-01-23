import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ApiResponseBuilder } from '@/shared/utils/api-response.js';
import { logger } from '@/infrastructure/logger/index.js';
import { env } from '@/env.js';

/**
 * Error personalizado de la aplicacion
 */
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Middleware global de manejo de errores
 */
export function errorHandler(error: Error, req: Request, res: Response, _next: NextFunction): void {
  // Log estructurado del error
  logger.error('Request error', {
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    },
    request: {
      method: req.method,
      url: req.url,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('user-agent')
    }
  });

  // Error de validacion Zod
  if (error instanceof ZodError) {
    res.status(400).json(
      ApiResponseBuilder.error('VALIDATION_ERROR', 'Datos invalidos', {
        issues: error.issues.map((err) => ({
          path: err.path.join('.'),
          message: err.message
        }))
      })
    );
    return;
  }

  // Error personalizado de la app
  if (error instanceof AppError) {
    res
      .status(error.statusCode)
      .json(ApiResponseBuilder.error(error.code, error.message, error.details));
    return;
  }

  // Error no manejado
  res
    .status(500)
    .json(
      ApiResponseBuilder.error(
        'INTERNAL_ERROR',
        env.IS_DEVELOPMENT ? error.message : 'Error interno del servidor',
        env.IS_DEVELOPMENT ? { stack: error.stack } : undefined
      )
    );
}

/**
 * Wrapper para async route handlers
 * Captura errores automaticamente y los pasa al error handler
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void> | void
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
