// apps/api/src/modules/users/user-merge.identity.ts
//
// Decide la identidad de la cuenta que sobrevive a un merge. Función pura: el repositorio
// aplica el resultado en SQL (password_hash incluido, sin pasar por JS).

import { AppError } from '../../shared/middleware/error.middleware.js';
import {
  PLACEHOLDER_EMAIL_DOMAIN,
  type DiscardedField,
  type MergeCandidate,
  type MergeResolution
} from './user-merge.types.js';

export function isPlaceholderEmail(email: string | null): boolean {
  return !!email && email.endsWith(PLACEHOLDER_EMAIL_DOMAIN);
}

function latest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * - Target legacy sin uso (is_legacy y nunca inició sesión): su username autogenerado y su
 *   password placeholder no son del cliente → se toman de la source.
 * - Source legacy sin uso: su username autogenerado y su password placeholder nunca se
 *   heredan, ni siquiera para rellenar nulos del target.
 * - Email: si el del target es placeholder se usa el de la source; si el admin ya cargó uno
 *   real, gana el del target y el de la source se informa como descartado.
 * - Resto de los campos: gana el target y los nulos se rellenan con la source.
 */
export function resolveMergedIdentity(
  target: MergeCandidate,
  source: MergeCandidate
): MergeResolution {
  if (target.google_id && source.google_id && target.google_id !== source.google_id) {
    throw new AppError(
      'GOOGLE_ID_CONFLICT',
      'Las dos cuentas tienen Google vinculado con cuentas distintas',
      409
    );
  }

  const unusedLegacy = target.is_legacy && target.last_login_at === null;
  const sourceUnusedLegacy = source.is_legacy && source.last_login_at === null;
  const passwordStrategy: MergeResolution['password_strategy'] = sourceUnusedLegacy
    ? 'target'
    : unusedLegacy
      ? 'source'
      : 'target_or_source';
  const hasPassword =
    passwordStrategy === 'source'
      ? source.has_password
      : passwordStrategy === 'target'
        ? target.has_password
        : target.has_password || source.has_password;
  const discarded: DiscardedField[] = [];

  const keepTarget = (
    field: DiscardedField['field'],
    targetValue: string | null,
    sourceValue: string | null
  ): string | null => {
    if (targetValue) {
      if (sourceValue && sourceValue !== targetValue) {
        discarded.push({ field, value: sourceValue });
      }
      return targetValue;
    }
    return sourceValue;
  };

  const sourceEmail = source.email && !isPlaceholderEmail(source.email) ? source.email : null;
  const email =
    !target.email || isPlaceholderEmail(target.email)
      ? (sourceEmail ?? target.email)
      : keepTarget('email', target.email, sourceEmail);
  const emailFromSource = email !== null && email === source.email && email !== target.email;

  return {
    password_strategy: passwordStrategy,
    identity: {
      email,
      username: sourceUnusedLegacy
        ? target.username
        : unusedLegacy
          ? source.username
          : keepTarget('username', target.username, source.username),
      phone: keepTarget('phone', target.phone, source.phone),
      google_id: target.google_id ?? source.google_id,
      email_verified: emailFromSource ? source.email_verified : target.email_verified,
      last_login_at: latest(target.last_login_at, source.last_login_at),
      has_password: hasPassword
    },
    discarded
  };
}
