import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ApiResponseBuilder } from '../utils/api-response.js';
import ms, { StringValue } from 'ms';

import 'express-serve-static-core';

// Extender Request de Express para incluir user
declare module 'express-serve-static-core' {
  interface Request {
    user?: JwtPayload;
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';

/**
 * Valida y convierte un string a formato de tiempo válido para JWT
 * @param value - String con el tiempo (ej: '15m', '7d', '1h')
 * @returns StringValue válido para JWT
 * @throws Error si el formato no es válido
 */
function validateTimeString(value: string): StringValue {
  // ms() acepta StringValue, así que hacemos la conversión y verificamos
  const timeValue = value as StringValue;
  try {
    // Intenta parsear - si el formato es inválido, ms lanzará error
    const result = ms(timeValue);
    if (typeof result !== 'number' || isNaN(result)) {
      throw new Error('Invalid result');
    }
    return timeValue;
  } catch {
    throw new Error(`Invalid time format: ${value}. Use formats like '15m', '7d', '1h'`);
  }
}

export interface JwtPayload {
  userId: string;
  role: 'owner' | 'admin' | 'driver' | 'customer';
  sessionId: string;
}

/**
 * Middleware de autenticacion
 * Verifica JWT en cookie o header Authorization
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Obtener token de cookie o header
    const token = req.cookies.session || req.headers.authorization?.split(' ')[1];

    if (!token) {
      res.status(401).json(ApiResponseBuilder.error('UNAUTHORIZED', 'No autenticado'));
      return;
    }

    // Verificar token
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = decoded;

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json(ApiResponseBuilder.error('INVALID_TOKEN', 'Token invalido o expirado'));
      return;
    }
    next(error);
  }
}

/**
 * Middleware para requerir roles especificos
 * Debe usarse despues de authMiddleware
 */
export function requireRole(roles: Array<'owner' | 'admin' | 'driver' | 'customer'>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json(ApiResponseBuilder.error('UNAUTHORIZED', 'No autenticado'));
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json(ApiResponseBuilder.error('FORBIDDEN', 'Sin permisos suficientes'));
      return;
    }

    next();
  };
}

/**
 * Crea un JWT
 */
export function createToken(payload: Omit<JwtPayload, 'sessionId'>): string {
  return jwt.sign(
    {
      ...payload,
      sessionId: crypto.randomUUID()
    },
    JWT_SECRET,
    {
      expiresIn: validateTimeString(process.env.JWT_EXPIRES_IN || '15m')
    }
  );
}

/**
 * Crea un refresh token
 */
export function createRefreshToken(payload: Omit<JwtPayload, 'sessionId'>): string {
  return jwt.sign(
    {
      ...payload,
      sessionId: crypto.randomUUID()
    },
    JWT_SECRET,
    {
      expiresIn: validateTimeString(process.env.JWT_REFRESH_EXPIRES_IN || '7d')
    }
  );
}
