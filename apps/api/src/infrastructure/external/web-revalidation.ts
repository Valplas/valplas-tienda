import { env } from '../../env.js';
import { logger } from '../logger/index.js';

/**
 * Tags de cache de la web (apps/web). Deben coincidir con los usados en los
 * fetch de `apps/web/src/lib/services` y con el allowlist de
 * `apps/web/src/app/api/revalidate/route.ts`.
 */
export const WEB_CACHE_TAGS = {
  BANNERS: 'banners',
  STORE_SETTINGS: 'store-settings'
} as const;

export type WebCacheTag = (typeof WEB_CACHE_TAGS)[keyof typeof WEB_CACHE_TAGS];

const REVALIDATE_TIMEOUT_MS = 3000;

let warnedMissingSecret = false;

/**
 * Pide a la web que invalide sus tags de cache (invalidate-only: la web
 * recarga en el próximo request). Best-effort: un fallo solo se loguea, el
 * TTL del fetch en la web actúa como red de seguridad. Nunca lanza.
 */
export async function revalidateWebTags(tags: WebCacheTag[]): Promise<void> {
  if (!env.REVALIDATE_SECRET) {
    if (!warnedMissingSecret) {
      logger.warn('REVALIDATE_SECRET no configurado: se omite la revalidación de la web');
      warnedMissingSecret = true;
    }
    return;
  }

  try {
    const response = await fetch(`${env.FRONTEND_URL}/api/revalidate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-revalidate-secret': env.REVALIDATE_SECRET
      },
      body: JSON.stringify({ tags }),
      signal: AbortSignal.timeout(REVALIDATE_TIMEOUT_MS)
    });

    if (!response.ok) {
      logger.error('La web rechazó la revalidación', { status: response.status, tags });
    }
  } catch (error) {
    logger.error('No se pudo revalidar la web', {
      tags,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
