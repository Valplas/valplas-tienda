import type { PoolClient } from 'pg';
import { AppError } from '../../../shared/middleware/error.middleware.js';
import { transaction } from '../../../infrastructure/database/client.js';
import pool from '../../../infrastructure/database/client.js';
import * as productRepository from '../product.repository.js';
import * as productImageRepository from './product-image.repository.js';
import type { ProductImageRow } from './product-image.repository.js';
import {
  processImage,
  MAX_IMAGES_PER_PRODUCT,
  type MulterFile
} from './image-upload.middleware.js';
import {
  uploadImageObject,
  moveImageObject,
  deleteImageObjects,
  getPublicUrl,
  listObjectsUnderPrefix,
  buildImageFilename
} from '../../../infrastructure/external/supabase-storage.js';
import type { StorageObjectInfo } from '../../../infrastructure/external/supabase-storage.js';

export interface StagedImage {
  tempPath: string;
  url: string;
  width: number;
  height: number;
  sizeBytes: number;
}

/**
 * Sube una imagen a staging (temp/{tempId}/...) — sin producto todavía, sin
 * fila en product_images. Ver decisión de "sin tabla de staging" en el plan:
 * el propio objeto de Storage (con su metadata custom width/height) es el
 * único registro hasta que se finaliza junto con la creación del producto.
 */
export async function stageImageUpload(tempId: string, file: MulterFile): Promise<StagedImage> {
  const existing = await listObjectsUnderPrefix(`temp/${tempId}`);
  if (existing.length >= MAX_IMAGES_PER_PRODUCT) {
    throw new AppError(
      'MAX_IMAGES_EXCEEDED',
      `No se pueden subir más de ${MAX_IMAGES_PER_PRODUCT} imágenes`,
      409
    );
  }

  const processed = await processImage(file.buffer);
  const path = `temp/${tempId}/${buildImageFilename(processed.width, processed.height)}`;
  await uploadImageObject(path, processed.buffer, 'image/webp');

  return {
    tempPath: path,
    url: getPublicUrl(path),
    width: processed.width,
    height: processed.height,
    sizeBytes: processed.sizeBytes
  };
}

/**
 * Mueve las imágenes en staging de un tempId al path final del producto e
 * inserta las filas product_images, dentro de la misma transacción que crea
 * el producto (ver product.service.ts#createProduct). Los moves de Storage
 * no son parte del 2PC de Postgres — si algo falla a mitad de camino, los
 * objetos ya movidos quedan huérfanos bajo products/{id}/ (gap aceptado para
 * MVP, documentado en el plan).
 *
 * `order` (nombres de archivo, sin el prefijo temp/{tempId}/) es el orden que
 * el usuario armó en el form (drag/estrella "principal") ANTES de que el
 * producto existiera. Storage.list() no garantiza ese orden — por eso el
 * cliente lo manda explícito en vez de confiar en el orden de listado.
 */
export async function finalizeStagedImages(
  client: PoolClient,
  tempId: string,
  productId: string,
  order?: string[]
): Promise<void> {
  const staged = await listObjectsUnderPrefix(`temp/${tempId}`);
  const ordered = order
    ? order
        .map((name) => staged.find((obj) => obj.name === name))
        .filter((obj): obj is StorageObjectInfo => obj !== undefined)
    : staged;

  for (const [index, obj] of ordered.entries()) {
    const fromPath = `temp/${tempId}/${obj.name}`;
    const toPath = `products/${productId}/${obj.name}`;

    await moveImageObject(fromPath, toPath);
    await productImageRepository.insertImage(client, {
      productId,
      url: getPublicUrl(toPath),
      storagePath: toPath,
      mimeType: obj.mimeType ?? 'image/webp',
      sizeBytes: obj.sizeBytes ?? 0,
      width: obj.width ?? 0,
      height: obj.height ?? 0,
      displayOrder: index,
      isPrimary: index === 0
    });
  }
}

/**
 * Upload directo para el flujo de edición (el producto ya existe, no hace
 * falta staging).
 */
export async function uploadDirectImage(
  productId: string,
  file: MulterFile,
  altText?: string
): Promise<ProductImageRow> {
  const product = await productRepository.findProductById(productId);
  if (!product) {
    throw new AppError('PRODUCT_NOT_FOUND', 'Producto no encontrado', 404);
  }

  const currentCount = await productImageRepository.countImagesForProduct(productId);
  if (currentCount >= MAX_IMAGES_PER_PRODUCT) {
    throw new AppError(
      'MAX_IMAGES_EXCEEDED',
      `No se pueden subir más de ${MAX_IMAGES_PER_PRODUCT} imágenes`,
      409
    );
  }

  const processed = await processImage(file.buffer);
  const path = `products/${productId}/${buildImageFilename(processed.width, processed.height)}`;
  await uploadImageObject(path, processed.buffer, 'image/webp');

  return productImageRepository.insertImage(pool, {
    productId,
    url: getPublicUrl(path),
    storagePath: path,
    mimeType: 'image/webp',
    sizeBytes: processed.sizeBytes,
    width: processed.width,
    height: processed.height,
    altText: altText ?? null,
    displayOrder: currentCount,
    isPrimary: currentCount === 0
  });
}

export async function deleteImage(productId: string, imageId: string): Promise<void> {
  const image = await productImageRepository.findImageById(imageId);
  if (!image || image.productId !== productId) {
    throw new AppError('IMAGE_NOT_FOUND', 'Imagen no encontrada', 404);
  }

  await transaction(async (client) => {
    await productImageRepository.deleteImage(client, imageId);
    if (image.isPrimary) {
      await productImageRepository.promoteNextPrimary(client, productId);
    }
  });

  try {
    await deleteImageObjects([image.storagePath]);
  } catch (error) {
    // La fila ya fue borrada (lo que ve el usuario) — la limpieza del objeto
    // en Storage es best-effort, un fallo acá no debe romper la respuesta.
    console.error(
      `[product-images] No se pudo borrar objeto de Storage ${image.storagePath}:`,
      error
    );
  }
}

export async function reorderImages(
  productId: string,
  imageIds: string[]
): Promise<ProductImageRow[]> {
  const matched = await productImageRepository.findImagesByIds(productId, imageIds);
  if (matched.length !== imageIds.length) {
    throw new AppError('INVALID_IMAGE_IDS', 'Alguna imagen no pertenece a este producto', 400);
  }

  await transaction(async (client) => {
    await productImageRepository.reorderImages(client, productId, imageIds);
  });

  const reordered = await productImageRepository.findImagesByIds(productId, imageIds);
  return imageIds.map((id) => reordered.find((img) => img.id === id)!);
}
