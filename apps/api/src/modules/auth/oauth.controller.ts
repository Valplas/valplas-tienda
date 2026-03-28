import type { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import ms, { type StringValue } from 'ms';
import { env } from '../../env.js';
import * as authRepository from './auth.repository.js';
import * as refreshTokenRepository from './refresh-token.repository.js';
import { generateAccessToken, generateRefreshToken } from './auth.service.js';

const COOKIE_OPTIONS_BASE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
  path: '/'
};

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Configurar estrategia de Google
passport.use(
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: env.GOOGLE_CALLBACK_URL
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;

        if (!email) {
          return done(new Error('No se pudo obtener el email de Google'));
        }

        // Buscar por Google ID primero
        let user = await authRepository.findUserByGoogleId(profile.id);

        if (!user) {
          // Buscar por email (cuenta local existente)
          user = await authRepository.findUserByEmail(email);

          if (user) {
            // Vincular Google ID a cuenta existente
            await authRepository.linkGoogleId(user.id, profile.id);
          } else {
            // Crear nueva cuenta
            user = await authRepository.createOAuthUser({
              email,
              firstName: profile.name?.givenName ?? '',
              lastName: profile.name?.familyName ?? '',
              googleId: profile.id
            });
          }
        }

        if (!user.isActive) {
          return done(null, false);
        }

        done(null, user);
      } catch (error) {
        done(error as Error);
      }
    }
  )
);

/**
 * GET /api/auth/google
 * Redirige a la pantalla de consent de Google
 */
export function googleAuth(req: Request, res: Response, next: NextFunction): void {
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false
  })(req, res, next);
}

/**
 * GET /api/auth/google/callback
 * Google redirige aquí con el code. Setea cookies y redirige al frontend.
 */
export function googleCallback(req: Request, res: Response, next: NextFunction): void {
  passport.authenticate(
    'google',
    { session: false },
    async (err: Error | null, user: { id: string; email: string | null; role: string } | false) => {
      if (err || !user) {
        res.redirect(`${env.FRONTEND_URL}/login?error=oauth_failed`);
        return;
      }

      try {
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user.id);

        // Guardar refresh token en DB
        const tokenHash = hashToken(refreshToken);
        const expiresAt = new Date(Date.now() + ms(env.JWT_REFRESH_EXPIRES_IN as StringValue));
        await refreshTokenRepository.saveRefreshToken(user.id, tokenHash, expiresAt);

        const REFRESH_MAX_AGE = 30 * 60 * 1000;
        const ACCESS_MAX_AGE = 15 * 60 * 1000;

        res.cookie('accessToken', accessToken, { ...COOKIE_OPTIONS_BASE, maxAge: ACCESS_MAX_AGE });
        res.cookie('refreshToken', refreshToken, {
          ...COOKIE_OPTIONS_BASE,
          maxAge: REFRESH_MAX_AGE
        });

        res.redirect(`${env.FRONTEND_URL}/cuenta`);
      } catch (callbackError) {
        next(callbackError);
      }
    }
  )(req, res, next);
}
