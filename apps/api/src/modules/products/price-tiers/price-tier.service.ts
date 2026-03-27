import { AppError } from '../../../shared/middleware/error.middleware.js';
import { query } from '../../../infrastructure/database/client.js';
import * as repository from './price-tier.repository.js';
import type {
  ProductPriceTier,
  ProductPriceTierInput,
  BulkPreviewRequest,
  BulkPreviewResult,
  BulkConfirmRequest,
  BulkConfirmResult
} from './price-tier.types.js';

export async function getTiersByProduct(productId: string): Promise<ProductPriceTier[]> {
  await assertProductExists(productId);
  return repository.findTiersByProductId(productId);
}

export async function getTierByProductAndPriceList(
  productId: string,
  priceListId: string
): Promise<ProductPriceTier> {
  const tier = await repository.findTierByProductAndPriceList(productId, priceListId);
  if (!tier) {
    throw new AppError(
      'TIER_NOT_FOUND',
      'No existe un tier activo para este producto con la lista de precios indicada',
      404
    );
  }
  return tier;
}

export async function replaceProductTiers(
  productId: string,
  tiers: ProductPriceTierInput[]
): Promise<ProductPriceTier[]> {
  await assertProductExists(productId);
  validateTiersInput(tiers);
  await assertPriceListsExist(tiers.map((t) => t.priceListId));
  return repository.replaceProductTiers(productId, tiers);
}

export async function bulkPreview(req: BulkPreviewRequest): Promise<BulkPreviewResult> {
  validateTiersInput(req.tiers);
  assertFilterValid(req.filter);
  await assertPriceListsExist(req.tiers.map((t) => t.priceListId));
  return repository.bulkPreview(req.tiers, req.filter);
}

export async function bulkConfirm(req: BulkConfirmRequest): Promise<BulkConfirmResult> {
  validateTiersInput(req.tiers);
  assertFilterValid(req.filter);
  await assertPriceListsExist(req.tiers.map((t) => t.priceListId));
  return repository.bulkConfirm(req.tiers, req.filter, req.conflictResolution);
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function assertProductExists(productId: string): Promise<void> {
  const result = await query<{ id: string }>(
    'SELECT id FROM products WHERE id = $1 AND is_active = true AND deleted_at IS NULL',
    [productId]
  );
  if (!result.rows[0]) {
    throw new AppError('PRODUCT_NOT_FOUND', 'Producto no encontrado', 404);
  }
}

async function assertPriceListsExist(priceListIds: string[]): Promise<void> {
  const unique = [...new Set(priceListIds)];
  const result = await query<{ id: string }>(
    'SELECT id FROM price_lists WHERE id = ANY($1) AND is_active = true AND deleted_at IS NULL',
    [unique]
  );
  if (result.rows.length !== unique.length) {
    throw new AppError(
      'PRICE_LIST_NOT_FOUND',
      'Una o más listas de precios no existen o están inactivas',
      400
    );
  }
}

function validateTiersInput(tiers: ProductPriceTierInput[]): void {
  if (tiers.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'Debe especificar al menos un tier', 400);
  }

  const minQuantities = tiers.map((t) => t.minQuantity);
  const hasUnit = minQuantities.includes(1);
  if (!hasUnit) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Debe existir al menos un tier con min_quantity = 1 (unidad)',
      400
    );
  }

  const unique = new Set(minQuantities);
  if (unique.size !== minQuantities.length) {
    throw new AppError(
      'VALIDATION_ERROR',
      'No puede haber dos tiers con la misma cantidad mínima',
      400
    );
  }

  for (const tier of tiers) {
    if (tier.minQuantity < 1) {
      throw new AppError('VALIDATION_ERROR', 'min_quantity debe ser mayor o igual a 1', 400);
    }
  }
}

function assertFilterValid(filter: BulkPreviewRequest['filter']): void {
  const keys = ['all', 'categoryId', 'brandId'].filter(
    (k) => filter[k as keyof typeof filter] !== undefined
  );
  if (keys.length === 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Debe especificar un filtro: all, categoryId o brandId',
      400
    );
  }
}
