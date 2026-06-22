import type { Request, Response, NextFunction } from 'express';
import ms, { type StringValue } from 'ms';
import * as authService from './auth.service.js';
import { ApiResponseBuilder as ApiResponse } from '../../shared/utils/api-response.js';
import { AppError } from '../../shared/middleware/error.middleware.js';
import { env } from '../../env.js';

const REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';
const ACCESS_TOKEN_COOKIE_NAME = 'accessToken';
// maxAge derivado de la config de JWT para que la cookie no expire antes que el token.
// Antes estaba hardcodeado a 30 min, lo que cerraba la sesión a los 30 min sin importar
// JWT_REFRESH_EXPIRES_IN (p.ej. 7d) y disparaba el flujo de "sesión expirada".
const REFRESH_TOKEN_MAX_AGE = ms(env.JWT_REFRESH_EXPIRES_IN as StringValue);
const ACCESS_TOKEN_MAX_AGE = ms(env.JWT_EXPIRES_IN as StringValue);

// Cookie options para refresh token
const getCookieOptions = () => ({
  httpOnly: true,
  secure: env.IS_PRODUCTION, // HTTPS en producción
  sameSite: (env.IS_PRODUCTION ? 'none' : 'lax') as 'none' | 'lax',
  maxAge: REFRESH_TOKEN_MAX_AGE,
  path: '/'
});

// Cookie options para access token
const getAccessTokenCookieOptions = () => ({
  httpOnly: true,
  secure: env.IS_PRODUCTION,
  sameSite: (env.IS_PRODUCTION ? 'none' : 'lax') as 'none' | 'lax',
  maxAge: ACCESS_TOKEN_MAX_AGE,
  path: '/'
});

/**
 * POST /api/auth/register
 * Registrar nuevo usuario
 */
export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.register(req.body);

    // Establecer tokens en cookies HttpOnly
    res.cookie(ACCESS_TOKEN_COOKIE_NAME, result.accessToken, getAccessTokenCookieOptions());
    res.cookie(REFRESH_TOKEN_COOKIE_NAME, result.refreshToken, getCookieOptions());

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
    res.cookie(ACCESS_TOKEN_COOKIE_NAME, result.accessToken, getAccessTokenCookieOptions());
    res.cookie(REFRESH_TOKEN_COOKIE_NAME, result.refreshToken, getCookieOptions());

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

    // Limpiar ambas cookies (clearCookie no acepta maxAge, lo removemos)
    const cookieOptions = getCookieOptions();
    const { maxAge: _r, ...clearRefreshOptions } = cookieOptions;
    const { maxAge: _a, ...clearAccessOptions } = getAccessTokenCookieOptions();
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, clearRefreshOptions);
    res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, clearAccessOptions);

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
    res.cookie(ACCESS_TOKEN_COOKIE_NAME, newAccessToken, getAccessTokenCookieOptions());
    res.cookie(REFRESH_TOKEN_COOKIE_NAME, newRefreshToken, getCookieOptions());

    return res.json(ApiResponse.success({ message: 'Token renovado' }));
  } catch (error) {
    next(error);
  }
}
