import { AppError } from '../../shared/middleware/error.middleware.js';
import * as repository from './price-list.repository.js';
import { query } from '../../infrastructure/database/client.js';
import type {
  CreatePriceListData,
  UpdatePriceListData,
  PriceListFilters,
  PriceListCalculation
} from './price-list.types.js';

export async function listPriceLists(filters: PriceListFilters) {
  return repository.findPriceLists(filters);
}

export async function getPriceListById(id: string) {
  const priceList = await repository.findPriceListById(id);
  if (!priceList) {
    throw new AppError('PRICE_LIST_NOT_FOUND', 'Lista de precios no encontrada', 404);
  }
  return priceList;
}

export async function createPriceList(data: CreatePriceListData) {
  return repository.createPriceList(data);
}

export async function updatePriceList(id: string, data: UpdatePriceListData) {
  await getPriceListById(id);

  const updated = await repository.updatePriceList(id, data);
  if (!updated) {
    throw new AppError(
      'PRICE_LIST_UPDATE_FAILED',
      'No se pudo actualizar la lista de precios',
      500
    );
  }
  return updated;
}

export async function deletePriceList(id: string): Promise<void> {
  await getPriceListById(id);

  const inUse = await repository.isUsedInOrders(id);
  if (inUse) {
    throw new AppError(
      'PRICE_LIST_IN_USE',
      'No se puede eliminar una lista de precios que está en uso en pedidos',
      400
    );
  }

  await repository.deletePriceList(id);
}

export async function calculatePrice(
  priceListId: string,
  productId: string
): Promise<PriceListCalculation> {
  const priceList = await getPriceListById(priceListId);

  const result = await query<{ cost_price: number }>(
    'SELECT cost_price FROM products WHERE id = $1 AND deleted_at IS NULL',
    [productId]
  );

  if (!result.rows[0]) {
    throw new AppError('PRODUCT_NOT_FOUND', 'Producto no encontrado', 404);
  }

  const costPrice = Number(result.rows[0].cost_price);
  const margin = Number(priceList.margin);
  // Formula from CRM: unit_price = cost_price * (1 + margin / 100), truncated to 2 decimals
  const unitPrice = Math.trunc(costPrice * (1 + margin / 100) * 100) / 100;

  return { costPrice, margin, unitPrice };
}
