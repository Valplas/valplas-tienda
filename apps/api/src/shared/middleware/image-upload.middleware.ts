import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { AppError } from './error.middleware.js';

// Referenciar el namespace ambiental `Express.Multer.File` directo dispara
// no-undef (la regla no entiende namespaces de tipos globales) — este alias
// vía indexed access lo evita.
export type MulterFile = NonNullable<Request['file']>;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB — generoso para foto de celular, acotado para no reventar memoria/CPU en una sola instancia Railway

const ACCEPTED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

function createMulter(maxFiles: number) {
  return multer({
    storage: multer.memoryStorage(), // sin disco: filesystem efímero en Railway, se procesa directo desde el buffer
    limits: { fileSize: MAX_UPLOAD_BYTES, files: maxFiles },
    fileFilter: (_req, file, cb) => {
      if (!ACCEPTED_MIME.has(file.mimetype)) {
        cb(
          new AppError(
            'INVALID_FILE_TYPE',
            'Formato no soportado (usar JPEG, PNG, WebP o AVIF)',
            400
          )
        );
        return;
      }
      cb(null, true);
    }
  });
}

const singleUpload = createMulter(1);

/**
 * Traduce los errores de multer (MulterError, no es AppError/ZodError) a
 * AppError antes de que lleguen al error handler global — si no, caen al
 * branch de 500 genérico.
 */
function translateMulterError(err: unknown): unknown {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return new AppError('FILE_TOO_LARGE', 'El archivo supera el límite de 10MB', 400);
    }
    return new AppError('UPLOAD_ERROR', err.message, 400);
  }
  return err; // ya es AppError (rechazo de fileFilter) u otro error real
}

/**
 * Middleware que envuelve multer.single('file').
 */
export function uploadSingleImage(req: Request, _res: Response, next: NextFunction): void {
  singleUpload.single('file')(req, _res, (err: unknown) => {
    if (err) {
      next(translateMulterError(err));
      return;
    }
    if (!req.file) {
      next(new AppError('FILE_REQUIRED', 'Debe adjuntar un archivo', 400));
      return;
    }
    next();
  });
}

export type UploadedImageFields = Record<string, MulterFile[] | undefined>;

/**
 * Middleware que envuelve multer.fields() para formularios con varias
 * imágenes nombradas (ej: banner PC + celular). Cada campo acepta un solo
 * archivo; los `required` que falten responden FILE_REQUIRED.
 */
export function uploadImageFields(fields: Array<{ name: string; required?: boolean }>) {
  const upload = createMulter(fields.length).fields(
    fields.map(({ name }) => ({ name, maxCount: 1 }))
  );

  return (req: Request, res: Response, next: NextFunction): void => {
    upload(req, res, (err: unknown) => {
      if (err) {
        next(translateMulterError(err));
        return;
      }
      const files = (req.files ?? {}) as UploadedImageFields;
      const missing = fields.find(({ name, required }) => required && !files[name]?.[0]);
      if (missing) {
        next(new AppError('FILE_REQUIRED', `Debe adjuntar el archivo "${missing.name}"`, 400));
        return;
      }
      next();
    });
  };
}

export interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
  sizeBytes: number;
}

export interface ProcessImageOptions {
  maxWidth?: number;
  maxHeight?: number;
}

/**
 * Pipeline de procesamiento: auto-orient (EXIF) → resize cap (sin upscale) →
 * re-encode a WebP (el EXIF se descarta como efecto colateral del re-encode;
 * el canal alfa se conserva, necesario para logos con transparencia).
 * next/image ya negocia formato/tamaño responsive en runtime — acá solo
 * normalizamos la imagen fuente para no guardar archivos gigantes.
 */
export async function processImage(
  buffer: Buffer,
  { maxWidth = 2000, maxHeight = 2000 }: ProcessImageOptions = {}
): Promise<ProcessedImage> {
  try {
    const processed = await sharp(buffer)
      .rotate()
      .resize({ width: maxWidth, height: maxHeight, fit: 'inside', withoutEnlargement: true })
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
