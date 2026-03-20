import { query } from '../../infrastructure/database/client.js';
import type { PriceList } from '@valplas/shared/types';
import type {
  CreatePriceListData,
  UpdatePriceListData,
  PriceListFilters
} from './price-list.types.js';

export async function findPriceLists(filters: PriceListFilters = {}) {
  const { search, isActive, page = 1, limit = 50 } = filters;
  const offset = (page - 1) * limit;

  const conditions: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  let i = 1;

  if (search) {
    conditions.push(`name ILIKE $${i}`);
    params.push(`%${search}%`);
    i++;
  }

  if (isActive !== undefined) {
    conditions.push(`is_active = $${i}`);
    params.push(isActive);
    i++;
  }

  const where = conditions.join(' AND ');

  const [listResult, countResult] = await Promise.all([
    query<PriceList>(
      `SELECT * FROM price_lists WHERE ${where} ORDER BY margin ASC LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limit, offset]
    ),
    query<{ count: string }>(`SELECT COUNT(*) as count FROM price_lists WHERE ${where}`, params)
  ]);

  return {
    data: listResult.rows,
    total: parseInt(countResult.rows[0].count, 10)
  };
}

export async function findPriceListById(id: string): Promise<PriceList | null> {
  const result = await query<PriceList>(
    'SELECT * FROM price_lists WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  return result.rows[0] || null;
}

export async function createPriceList(data: CreatePriceListData): Promise<PriceList> {
  const result = await query<PriceList>(
    `INSERT INTO price_lists (name, margin, discount, is_active)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [data.name, data.margin, data.discount, data.isActive]
  );
  return result.rows[0];
}

export async function updatePriceList(
  id: string,
  data: UpdatePriceListData
): Promise<PriceList | null> {
  const updates: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (data.name !== undefined) {
    updates.push(`name = $${i}`);
    params.push(data.name);
    i++;
  }
  if (data.margin !== undefined) {
    updates.push(`margin = $${i}`);
    params.push(data.margin);
    i++;
  }
  if (data.discount !== undefined) {
    updates.push(`discount = $${i}`);
    params.push(data.discount);
    i++;
  }
  if (data.isActive !== undefined) {
    updates.push(`is_active = $${i}`);
    params.push(data.isActive);
    i++;
  }

  if (updates.length === 0) throw new Error('NO_FIELDS_TO_UPDATE');

  params.push(id);
  const result = await query<PriceList>(
    `UPDATE price_lists SET ${updates.join(', ')} WHERE id = $${i} AND deleted_at IS NULL RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

export async function deletePriceList(id: string): Promise<boolean> {
  const result = await query(
    'UPDATE price_lists SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  return (result.rowCount || 0) > 0;
}

export async function isUsedInOrders(id: string): Promise<boolean> {
  const result = await query<{ count: string }>(
    'SELECT COUNT(*) as count FROM order_items WHERE price_list_id = $1',
    [id]
  );
  return parseInt(result.rows[0].count, 10) > 0;
}
