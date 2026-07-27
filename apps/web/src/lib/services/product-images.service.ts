// apps/web/src/lib/services/product-images.service.ts

import { postFormData, put, del } from '../api';
import type { ProductImage } from '@/types';

export interface StagedImage {
  tempPath: string;
  url: string;
  width: number;
  height: number;
  sizeBytes: number;
}

/**
 * Sube una imagen a staging (create-flow, antes de que exista el producto).
 */
export async function stageProductImage(tempId: string, file: File): Promise<StagedImage> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await postFormData<{ image: StagedImage }>(
    `/products/images/staging/${tempId}`,
    formData
  );
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? 'Error al subir la imagen');
  }
  return res.data.image;
}

/**
 * Sube una imagen directo a un producto existente (edit-flow, sin staging).
 */
export async function uploadProductImage(
  productId: string,
  file: File,
  altText?: string
): Promise<ProductImage> {
  const formData = new FormData();
  formData.append('file', file);
  if (altText) formData.append('altText', altText);

  const res = await postFormData<{ image: ProductImage }>(
    `/products/${productId}/images`,
    formData
  );
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? 'Error al subir la imagen');
  }
  return res.data.image;
}

export async function deleteProductImage(productId: string, imageId: string): Promise<void> {
  const res = await del(`/products/${productId}/images/${imageId}`);
  if (!res.success) {
    throw new Error(res.error?.message ?? 'Error al eliminar la imagen');
  }
}

/**
 * Reordena/cambia principal (la primera de la lista pasa a ser is_primary).
 */
export async function reorderProductImages(
  productId: string,
  imageIds: string[]
): Promise<ProductImage[]> {
  const res = await put<{ images: ProductImage[] }>(`/products/${productId}/images/order`, {
    imageIds
  });
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? 'Error al reordenar las imágenes');
  }
  return res.data.images;
}
