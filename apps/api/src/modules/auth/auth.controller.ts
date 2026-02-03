import type { Request, Response, NextFunction } from 'express';
import * as authService from './auth.service.js';
import { ApiResponseBuilder as ApiResponse } from '../../shared/utils/api-response.js';
import { AppError } from '../../shared/middleware/error.middleware.js';

const REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 días en milisegundos

/**
 * POST /api/auth/register
 * Registrar nuevo usuario
 */
export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.register(req.body);

    // Establecer refresh token en cookie HttpOnly
    res.cookie(REFRESH_TOKEN_COOKIE_NAME, result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS en producción
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/'
    });

    // Retornar usuario y access token
    return res.status(201).json(
      ApiResponse.success({
        user: result.user,
        accessToken: result.accessToken
      })
    );
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/login
 * Iniciar sesión
 */
export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.login(req.body);

    // Establecer refresh token en cookie HttpOnly
    res.cookie(REFRESH_TOKEN_COOKIE_NAME, result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/'
    });

    // Retornar usuario y access token
    return res.json(
      ApiResponse.success({
        user: result.user,
        accessToken: result.accessToken
      })
    );
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/logout
 * Cerrar sesión
 */
export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    // Limpiar cookie de refresh token
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    });

    return res.json(
      ApiResponse.success({
        message: 'Sesión cerrada exitosamente'
      })
    );
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/auth/me
 * Obtener usuario actual (requiere autenticación)
 */
export async function getCurrentUser(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED', 'No autenticado', 401);
    }

    const user = await authService.getCurrentUser(req.user.userId);

    return res.json(ApiResponse.success({ user }));
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/refresh
 * Renovar access token usando refresh token
 */
export async function refreshToken(req: Request, res: Response, next: NextFunction) {
  try {
    // Leer refresh token de cookie
    const refreshToken = req.cookies[REFRESH_TOKEN_COOKIE_NAME];

    if (!refreshToken) {
      throw new AppError('NO_REFRESH_TOKEN', 'Refresh token no encontrado', 401);
    }

    // Generar nuevo access token
    const newAccessToken = await authService.refreshAccessToken(refreshToken);

    return res.json(
      ApiResponse.success({
        accessToken: newAccessToken
      })
    );
  } catch (error) {
    next(error);
  }
}
