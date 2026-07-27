import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { env } from '../../env.js';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

export const PRODUCT_IMAGES_BUCKET = 'product-images';

/**
 * TTL de abandono para imágenes en staging (temp/{tempId}/...) sin producto
 * asociado. Mismo criterio que PAYMENT_EXPIRATION_HOURS en mercadopago.ts:
 * ventana razonable ya establecida en este codebase.
 */
export const STAGING_TTL_HOURS = 24;

function bucket() {
  return supabase.storage.from(PRODUCT_IMAGES_BUCKET);
}

export async function uploadImageObject(
  path: string,
  buffer: Buffer,
  contentType: string
): Promise<void> {
  const { error } = await bucket().upload(path, buffer, { contentType, upsert: false });
  if (error) throw error;
}

export async function moveImageObject(fromPath: string, toPath: string): Promise<void> {
  const { error } = await bucket().move(fromPath, toPath);
  if (error) throw error;
}

export async function deleteImageObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await bucket().remove(paths);
  if (error) throw error;
}

export function getPublicUrl(path: string): string {
  return bucket().getPublicUrl(path).data.publicUrl;
}

/**
 * Supabase Storage list() no devuelve la metadata custom pasada en upload()
 * (solo eTag/size/mimetype/etc estándar) — confirmado empíricamente, no es
 * un supuesto. Width/height se codifican en el propio nombre de archivo
 * (buildImageFilename/parseImageFilename) para sobrevivir el ciclo
 * staging → finalize sin tabla intermedia ni re-descargar el archivo.
 */
export function buildImageFilename(width: number, height: number): string {
  return `${randomUUID()}_${width}x${height}.webp`;
}

function parseImageDimensions(name: string): { width: number | null; height: number | null } {
  const match = name.match(/_(\d+)x(\d+)\.webp$/);
  if (!match) return { width: null, height: null };
  return { width: Number(match[1]), height: Number(match[2]) };
}

export interface StorageObjectInfo {
  name: string;
  createdAt: string | null;
  sizeBytes: number | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
}

/**
 * Lista objetos bajo un prefijo (ej: "temp/{tempId}"). Usado para contar
 * imágenes en staging (cap server-side), para finalizar (leer width/height
 * del nombre de archivo, mimeType/size de la metadata estándar) y por el
 * cron de limpieza.
 */
export async function listObjectsUnderPrefix(prefix: string): Promise<StorageObjectInfo[]> {
  const { data, error } = await bucket().list(prefix);
  if (error) throw error;
  return (data ?? [])
    .filter((obj) => obj.id !== null) // excluye subcarpetas
    .map((obj) => {
      const meta = obj.metadata as Record<string, unknown> | null;
      const { width, height } = parseImageDimensions(obj.name);
      return {
        name: obj.name,
        createdAt: obj.created_at ?? null,
        sizeBytes: typeof meta?.size === 'number' ? meta.size : null,
        mimeType: typeof meta?.mimetype === 'string' ? meta.mimetype : null,
        width,
        height
      };
    });
}

/**
 * Lista todas las carpetas tempId bajo temp/ — usado solo por el cron de
 * limpieza para barrer staging abandonado.
 */
export async function listStagingTempIds(): Promise<string[]> {
  const { data, error } = await bucket().list('temp');
  if (error) throw error;
  // Supabase Storage list() de un "directorio" devuelve entradas sin id: null
  // para subcarpetas — filtramos las que sí son carpetas (no archivos sueltos).
  return (data ?? []).filter((obj) => obj.id === null).map((obj) => obj.name);
}
