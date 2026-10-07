import type { Request, Response, NextFunction } from 'express';
import * as authService from './auth.service.js';
import { ApiResponseBuilder as ApiResponse } from '../../shared/utils/api-response.js';
import { AppError } from '../../shared/middleware/error.middleware.js';
import { REFRESH_TOKEN_COOKIE_NAME, clearAuthCookies, setAuthCookies } from './auth.cookies.js';

/**
 * POST /api/auth/register
 * Registrar nuevo usuario
 */
export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.register(req.body);

    // Establecer tokens en cookies HttpOnly
    setAuthCookies(res, result.accessToken, result.refreshToken);

    // Retornar solo usuario (accessToken va en cookie)
    return res.status(201).json(ApiResponse.success({ user: result.user }));
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

    // Establecer tokens en cookies HttpOnly
    setAuthCookies(res, result.accessToken, result.refreshToken);

    // Retornar solo usuario (accessToken va en cookie)
    return res.json(ApiResponse.success({ user: result.user }));
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
    // Revocar refresh token en DB (falla silenciosamente si no hay token)
    const refreshTokenValue = req.cookies[REFRESH_TOKEN_COOKIE_NAME];
    if (refreshTokenValue) {
      await authService.revokeRefreshToken(refreshTokenValue);
    }

    // Limpiar ambas cookies
    clearAuthCookies(res);

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
    if (!req.user || !req.user.userId) {
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

    // Rotar tokens: revocar el viejo y emitir nuevos
    const { accessToken: newAccessToken, newRefreshToken } =
      await authService.refreshAccessToken(refreshToken);
    setAuthCookies(res, newAccessToken, newRefreshToken);

    return res.json(ApiResponse.success({ message: 'Token renovado' }));
  } catch (error) {
    next(error);
  }
}
