import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ApiResponse } from '../utils/api-response.js';
import { env } from '../../env.js';
import { verifyAccessToken } from '../../modules/auth/auth.service.js';
import type { AuthenticatedUser } from '../../modules/auth/auth.types.js';

/**
 * Middleware de autenticación
 * Verifica JWT en header Authorization
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Obtener token del header Authorization (Bearer token)
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json(ApiResponse.error('UNAUTHORIZED', 'No autenticado'));
      return;
    }

    const token = authHeader.split(' ')[1];

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

    if (!roles.includes(req.user.role as any)) {
      res.status(403).json(ApiResponse.error('FORBIDDEN', 'Sin permisos suficientes'));
      return;
    }

    next();
  };
}
