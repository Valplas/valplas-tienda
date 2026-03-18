import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ApiResponseBuilder as ApiResponse } from '../utils/api-response.js';
import { verifyAccessToken } from '../../modules/auth/auth.service.js';
import type { AuthenticatedUser } from '../../modules/auth/auth.types.js';

/**
 * Middleware de autenticación
 * Lee el accessToken de cookie HttpOnly primero, con fallback a header Authorization (Bearer)
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Leer token de cookie primero (browsers), luego Authorization header (Postman/tests)
    const token =
      req.cookies?.['accessToken'] ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.split(' ')[1]
        : undefined);

    if (!token) {
      res.status(401).json(ApiResponse.error('UNAUTHORIZED', 'No autenticado'));
      return;
    }

    // Verificar y decodificar token usando el servicio de auth
    const payload = verifyAccessToken(token);

    // Agregar usuario al request
    req.user = {
      userId: payload.userId,
      email: payload.email,
      role: payload.role
    } as AuthenticatedUser;

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json(ApiResponse.error('INVALID_TOKEN', 'Token inválido o expirado'));
      return;
    }
    next(error);
  }
}

/**
 * Middleware para requerir roles específicos
 * Debe usarse después de authMiddleware
 */
export function requireRole(roles: Array<'owner' | 'admin' | 'driver' | 'customer'>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json(ApiResponse.error('UNAUTHORIZED', 'No autenticado'));
      return;
    }

    if (!req.user.role || !roles.includes(req.user.role)) {
      res.status(403).json(ApiResponse.error('FORBIDDEN', 'Sin permisos suficientes'));
      return;
    }

    next();
  };
}
