// Mismos límites que el backend (shared/middleware/image-upload.middleware.ts)
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Mensaje de error para mostrar al usuario, o null si el archivo sirve. */
export function getImageFileError(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return 'Formato no soportado (usar JPEG, PNG, WebP o AVIF)';
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return 'El archivo supera el límite de 10MB';
  }
  return null;
}
