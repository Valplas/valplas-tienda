import type { Request, Response, NextFunction } from 'express';
import type { ZodObject, ZodError } from 'zod';
import type { z } from 'zod';
import { ApiResponseBuilder as ApiResponse } from '../utils/api-response.js';

/**
 * Middleware de validación con Zod
 * Valida el body, query o params de la request según el schema provisto
 */
export function validate(schema: z.ZodObject<any>, source: 'body' | 'query' | 'params' = 'body') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validar la fuente especificada
      const dataToValidate = source === 'body' ? req.body : source === 'query' ? req.query : req.params;
      await schema.parseAsync(dataToValidate);
      next();
    } catch (error) {
      if (isZodError(error)) {
        // Formatear errores de Zod de forma legible
        const formattedErrors = error.issues.map((err) => ({
          field: err.path.join('.'),
          message: err.message
        }));

        return res.status(400).json(
          ApiResponse.error('VALIDATION_ERROR', 'Errores de validación', formattedErrors)
        );
      }
      next(error);
    }
  };
}

/**
 * Type guard para verificar si el error es de Zod
 */
function isZodError(error: unknown): error is ZodError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'issues' in error &&
    Array.isArray((error as any).issues)
  );
}
