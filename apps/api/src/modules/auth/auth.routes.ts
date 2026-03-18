import { Router } from 'express';
import * as authController from './auth.controller.js';
import { validate } from '../../shared/middleware/validation.middleware.js';
import { authMiddleware } from '../../shared/middleware/auth.middleware.js';
import { authRateLimiter } from '../../shared/middleware/rate-limit.middleware.js';
import { registerSchema, loginSchema } from './auth.validator.js';

const router = Router();

/**
 * POST /api/auth/register
 * Registrar nuevo usuario
 */
router.post('/register', authRateLimiter, validate(registerSchema), authController.register);

/**
 * POST /api/auth/login
 * Iniciar sesión
 */
router.post('/login', authRateLimiter, validate(loginSchema), authController.login);

/**
 * POST /api/auth/logout
 * Cerrar sesión (opcional auth, solo limpia cookie)
 */
router.post('/logout', authController.logout);

/**
 * GET /api/auth/me
 * Obtener usuario actual (requiere autenticación)
 */
router.get('/me', authMiddleware, authController.getCurrentUser);

/**
 * POST /api/auth/refresh
 * Renovar access token
 */
router.post('/refresh', authController.refreshToken);

import * as oauthController from './oauth.controller.js';

/**
 * GET /api/auth/google
 * Redirigir a Google OAuth
 */
router.get('/google', oauthController.googleAuth);

/**
 * GET /api/auth/google/callback
 * Callback de Google OAuth
 */
router.get('/google/callback', oauthController.googleCallback);

export default router;
