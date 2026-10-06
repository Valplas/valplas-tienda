// apps/api/src/modules/auth/oauth.controller.ts

import type { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { env } from '../../env.js';
import { logger } from '../../infrastructure/logger/index.js';
import { issueSession } from './auth.service.js';
import { setAuthCookies } from './auth.cookies.js';
import { CookieStateStore, type OAuthStateInfo } from './oauth-state.store.js';
import { defaultRedirectForRole, sanitizeRedirect } from './oauth-redirect.js';
import { resolveGoogleUser, toOAuthErrorCode, type OAuthErrorCode } from './oauth.service.js';

// Sin credenciales no se registra la strategy: el constructor de passport-oauth2 tira
// TypeError con clientID vacío y voltearía el server al arrancar.
export const isGoogleOAuthConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

if (isGoogleOAuthConfigured) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: env.GOOGLE_CALLBACK_URL,
        store: new CookieStateStore()
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const result = await resolveGoogleUser(profile);
          if ('error' in result) {
            done(null, false, { message: result.error });
            return;
          }
          done(null, result.user);
        } catch (error) {
          done(error as Error);
        }
      }
    )
  );
} else {
  logger.warn('Google OAuth deshabilitado: faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET');
}

function redirectToLogin(res: Response, error: OAuthErrorCode): void {
  res.redirect(`${env.FRONTEND_URL}/login?error=${error}`);
}

/**
 * GET /api/auth/google?redirect=/checkout
 * Redirige a la pantalla de consentimiento de Google
 */
export function googleAuth(req: Request, res: Response, next: NextFunction): void {
  if (!isGoogleOAuthConfigured) {
    redirectToLogin(res, 'oauth_unavailable');
    return;
  }
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })(req, res, next);
}

/**
 * GET /api/auth/google/callback
 * Google redirige acá con el code. Setea cookies y redirige al frontend.
 */
export function googleCallback(req: Request, res: Response, next: NextFunction): void {
  if (!isGoogleOAuthConfigured) {
    redirectToLogin(res, 'oauth_unavailable');
    return;
  }

  passport.authenticate(
    'google',
    { session: false },
    async (
      err: Error | null,
      user: { id: string; email: string | null; role: string } | false,
      info?: { message?: string; state?: OAuthStateInfo }
    ) => {
      if (err) {
        logger.error('Google OAuth callback error', { error: { message: err.message } });
        redirectToLogin(res, 'oauth_failed');
        return;
      }
      if (!user) {
        redirectToLogin(res, toOAuthErrorCode(info?.message));
        return;
      }

      try {
        const { accessToken, refreshToken } = await issueSession(user);
        setAuthCookies(res, accessToken, refreshToken);
        const path = sanitizeRedirect(info?.state?.redirect) ?? defaultRedirectForRole(user.role);
        res.redirect(`${env.FRONTEND_URL}${path}`);
      } catch (callbackError) {
        next(callbackError);
      }
    }
  )(req, res, next);
}
