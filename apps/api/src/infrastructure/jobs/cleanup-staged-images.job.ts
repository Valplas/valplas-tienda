import cron from 'node-cron';
import dayjs from 'dayjs';
import {
  listStagingTempIds,
  listObjectsUnderPrefix,
  deleteImageObjects,
  STAGING_TTL_HOURS
} from '../external/supabase-storage.js';

/**
 * Barre imágenes en staging (temp/{tempId}/...) abandonadas: el usuario subió
 * fotos pero nunca terminó de crear el producto (cerró la pestaña, etc). No
 * hay fila en DB para estos objetos — ver decisión de "sin tabla de staging"
 * en el plan — así que la única forma de detectarlos es listar el bucket.
 */
export async function sweepAbandonedStagedImages(
  ttlHours: number = STAGING_TTL_HOURS
): Promise<number> {
  const tempIds = await listStagingTempIds();
  let deleted = 0;

  for (const tempId of tempIds) {
    const objects = await listObjectsUnderPrefix(`temp/${tempId}`);
    const expired = objects.filter(
      (obj) => !obj.createdAt || dayjs().diff(dayjs(obj.createdAt), 'hour') >= ttlHours
    );
    if (expired.length === 0) continue;

    await deleteImageObjects(expired.map((obj) => `temp/${tempId}/${obj.name}`));
    deleted += expired.length;
  }

  return deleted;
}

/**
 * Corre diariamente a las 06:30 UTC (03:30 ART) — 30min después de
 * cleanup-tokens (06:00 UTC) para no competir por logs/DB en el mismo tick.
 */
export function scheduleStagedImageCleanup(): void {
  cron.schedule('30 6 * * *', async () => {
    try {
      const deletedCount = await sweepAbandonedStagedImages();
      console.log(`[cleanup-staged-images] ${deletedCount} objetos eliminados`);
    } catch (error) {
      console.error('[cleanup-staged-images] Error durante limpieza:', error);
    }
  });
}
