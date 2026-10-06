// apps/api/src/modules/auth/oauth.service.ts

import type { User } from '@valplas/shared/types';
import { env } from '../../env.js';
import { logger } from '../../infrastructure/logger/index.js';
import * as authRepository from './auth.repository.js';

const OAUTH_ERROR_CODES = [
  'oauth_failed',
  'oauth_state',
  'email_unverified',
  'account_inactive',
  'oauth_unavailable'
] as const;

export type OAuthErrorCode = (typeof OAUTH_ERROR_CODES)[number];

export function toOAuthErrorCode(value: unknown): OAuthErrorCode {
  return OAUTH_ERROR_CODES.includes(value as OAuthErrorCode)
    ? (value as OAuthErrorCode)
    : 'oauth_failed';
}

/** Subconjunto del Profile de passport-google-oauth20 que usamos. */
export interface GoogleProfileInput {
  id: string;
  displayName?: string;
  emails?: { value: string }[];
  name?: { givenName?: string; familyName?: string };
  _json: { email_verified?: boolean };
}

/**
 * Busca o crea el usuario de un login con Google:
 * 0. Whitelist OWNER_GOOGLE_EMAILS (email verificado): entra a LA cuenta owner existente.
 * 1. Por google_id (cuenta ya vinculada).
 * 2. Por email, solo si Google lo verificó: vincula la cuenta existente.
 * 3. Si no existe, crea una cuenta customer sin password ni username.
 * Las cuentas legacy con email placeholder no matchean acá: las une el admin con el merge.
 */
export async function resolveGoogleUser(
  profile: GoogleProfileInput,
  ownerEmails: readonly string[] = env.OWNER_GOOGLE_EMAILS
): Promise<{ user: User } | { error: OAuthErrorCode }> {
  const email = profile.emails?.[0]?.value?.trim().toLowerCase();
  if (!email) return { error: 'oauth_failed' };

  // Antes del lookup por google_id: ningún vínculo previo puede desviar estos emails a otra
  // cuenta. No se vincula google_id (una sola columna; la lista puede tener varios emails).
  if (ownerEmails.includes(email)) {
    if (profile._json.email_verified !== true) return { error: 'email_unverified' };

    const owners = await authRepository.findOwnerAccounts();
    if (owners.length !== 1) {
      logger.error(
        `Google OAuth: whitelist de owner con ${owners.length} cuentas owner (se espera 1)`
      );
      return { error: 'oauth_failed' };
    }
    if (!owners[0].isActive) return { error: 'account_inactive' };

    // La cuenta owner es compartida: este log es la única traza de quién entró
    logger.info(`Owner login via Google: ${email}`);
    return { user: owners[0] };
  }

  let user = await authRepository.findUserByGoogleId(profile.id);

  if (!user) {
    if (profile._json.email_verified !== true) return { error: 'email_unverified' };

    const existing = await authRepository.findUserByEmail(email);
    if (existing) {
      await authRepository.linkGoogleId(existing.id, profile.id);
      user = existing;
    } else {
      user = await authRepository.createOAuthUser({
        email,
        firstName: profile.name?.givenName || profile.displayName || 'Cliente',
        lastName: profile.name?.familyName ?? '',
        googleId: profile.id
      });
    }
  }

  if (!user.isActive) return { error: 'account_inactive' };
  return { user };
}
