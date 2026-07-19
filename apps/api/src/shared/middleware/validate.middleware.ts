import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

// Extendemos Request para guardar los datos validados
declare module 'express-serve-static-core' {
  interface Request {
    validated?: {
      body?: unknown;
      query?: unknown;
      params?: unknown;
    };
  }
}

/**
 * Helper type para requests con datos validados
 *
 * @example
 * type CreateProductBody = { name: string; price: number };
 *
 * function createProduct(
 *   req: ValidatedRequest<CreateProductBody>,
 *   res: Response
 * ) {
 *   const { name, price } = req.validated.body!; // Type-safe!
 * }
 */
export type ValidatedRequest<Body = unknown, Query = unknown, Params = unknown> = Request & {
  validated: {
    body?: Body;
    query?: Query;
    params?: Params;
  };
};

/**
 * Middleware para validar body con Zod
 */
export function validateBody<S extends z.ZodSchema>(schema: S) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = await schema.parseAsync(req.body);
      req.body = parsed as unknown as Request['body'];

      req.validated ??= {};
      req.validated.body = parsed as z.output<S>;

      next();
    } catch (e) {
      next(e);
    }
  };
}

/**
 * Middleware para validar query params con Zod
 */
export function validateQuery<S extends z.ZodSchema>(schema: S) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = await schema.parseAsync(req.query);

      req.validated ??= {};
      req.validated.query = parsed as z.output<S>;

      next();
    } catch (e) {
      next(e);
    }
  };
}

/**
 * Middleware para validar params con Zod
 */
export function validateParams<S extends z.ZodSchema>(schema: S) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = await schema.parseAsync(req.params);

      req.validated ??= {};
      req.validated.params = parsed as z.output<S>;

      next();
    } catch (e) {
      next(e);
    }
  };
}
