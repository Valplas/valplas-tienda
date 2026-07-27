import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { AppError } from '../../../shared/middleware/error.middleware.js';

// Referenciar el namespace ambiental `Express.Multer.File` directo dispara
// no-undef (la regla no entiende namespaces de tipos globales) — este alias
// vía indexed access lo evita.
export type MulterFile = NonNullable<Request['file']>;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB — generoso para foto de celular, acotado para no reventar memoria/CPU en una sola instancia Railway
export const MAX_IMAGES_PER_PRODUCT = 5;

const ACCEPTED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

const multerUpload = multer({
  storage: multer.memoryStorage(), // sin disco: filesystem efímero en Railway, se procesa directo desde el buffer
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ACCEPTED_MIME.has(file.mimetype)) {
      cb(
        new AppError('INVALID_FILE_TYPE', 'Formato no soportado (usar JPEG, PNG, WebP o AVIF)', 400)
      );
      return;
    }
    cb(null, true);
  }
});

/**
 * Middleware que envuelve multer.single('file') para traducir sus errores
 * (MulterError, no es AppError/ZodError) a AppError antes de que lleguen al
 * error handler global — si no, caen al branch de 500 genérico.
 */
export function uploadSingleImage(req: Request, _res: Response, next: NextFunction): void {
  multerUpload.single('file')(req, _res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(new AppError('FILE_TOO_LARGE', 'El archivo supera el límite de 10MB', 400));
        return;
      }
      next(new AppError('UPLOAD_ERROR', err.message, 400));
      return;
    }
    if (err) {
      next(err); // ya es AppError (rechazo de fileFilter) u otro error real
      return;
    }
    if (!req.file) {
      next(new AppError('FILE_REQUIRED', 'Debe adjuntar un archivo', 400));
      return;
    }
    next();
  });
}

export interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
  sizeBytes: number;
}

/**
 * Pipeline de procesamiento: auto-orient (EXIF) → resize cap (sin upscale) →
 * re-encode a WebP (el EXIF se descarta como efecto colateral del re-encode).
 * next/image ya negocia formato/tamaño responsive en runtime — acá solo
 * normalizamos la imagen fuente para no guardar archivos gigantes.
 */
export async function processImage(buffer: Buffer): Promise<ProcessedImage> {
  try {
    const processed = await sharp(buffer)
      .rotate()
      .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: processed.data,
      width: processed.info.width,
      height: processed.info.height,
      sizeBytes: processed.data.length
    };
  } catch {
    throw new AppError('INVALID_IMAGE', 'El archivo no es una imagen válida o está corrupto', 400);
  }
}
