import cron from 'node-cron';
import { deleteExpiredAndRevoked } from '../../modules/auth/refresh-token.repository.js';

/**
 * Limpieza diaria de refresh tokens expirados y revocados.
 * Se ejecuta todos los días a las 3:00 AM hora Buenos Aires (UTC-3).
 * Cron: 0 6 * * * (= 06:00 UTC = 03:00 ART)
 */
export function scheduleTokenCleanup(): void {
  cron.schedule('0 6 * * *', async () => {
    try {
      const deleted = await deleteExpiredAndRevoked();
      console.log(`[cleanup-tokens] ${deleted} tokens eliminados`);
    } catch (error) {
      console.error('[cleanup-tokens] Error durante limpieza:', error);
    }
  });
}
