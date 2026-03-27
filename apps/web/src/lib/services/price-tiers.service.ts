// apps/web/src/lib/services/price-tiers.service.ts

import { get, post, put } from '../api';
import type { PriceTier } from '@/types';

export interface BulkPreviewFilter {
  all?: boolean;
  categoryId?: string;
  brandId?: string;
}

export interface BulkTierInput {
  priceListId: string;
  minQuantity: number;
}

export interface BulkConflict {
  productId: string;
  productName: string;
  minQuantity: number;
  existingPriceListName: string;
  newPriceListName: string;
}

export interface BulkPreviewResult {
  toAssign: Array<{ productId: string; productName: string }>;
  conflicts: BulkConflict[];
}

export interface BulkConfirmResult {
  assigned: number;
  skipped: number;
  overwritten: number;
}

/**
 * Obtener tiers de un producto
 */
export async function getProductTiers(productId: string): Promise<PriceTier[]> {
  const response = await get<{ tiers: PriceTier[] }>(`/products/${productId}/price-tiers`);

  if (response.success && response.data) {
    return response.data.tiers;
  }

  throw new Error(response.error?.message || 'Error al obtener tiers del producto');
}

/**
 * Reemplazar tiers de un producto (admin)
 */
export async function replaceProductTiers(
  productId: string,
  tiers: BulkTierInput[]
): Promise<PriceTier[]> {
  const response = await put<{ tiers: PriceTier[] }>(`/products/${productId}/price-tiers`, {
    tiers
  });

  if (response.success && response.data) {
    return response.data.tiers;
  }

  throw new Error(response.error?.message || 'Error al guardar tiers del producto');
}

/**
 * Preview de asignación bulk (admin)
 */
export async function bulkPreviewTiers(
  tiers: BulkTierInput[],
  filter: BulkPreviewFilter
): Promise<BulkPreviewResult> {
  const response = await post<BulkPreviewResult>('/products/price-tiers/bulk-preview', {
    tiers,
    filter
  });

  if (response.success && response.data) {
    return response.data;
  }

  throw new Error(response.error?.message || 'Error al obtener preview');
}

/**
 * Confirmar asignación bulk (admin)
 */
export async function bulkConfirmTiers(
  tiers: BulkTierInput[],
  filter: BulkPreviewFilter,
  conflictResolution: 'skip' | 'overwrite'
): Promise<BulkConfirmResult> {
  const response = await post<BulkConfirmResult>('/products/price-tiers/bulk-confirm', {
    tiers,
    filter,
    conflictResolution
  });

  if (response.success && response.data) {
    return response.data;
  }

  throw new Error(response.error?.message || 'Error al confirmar asignación');
}
