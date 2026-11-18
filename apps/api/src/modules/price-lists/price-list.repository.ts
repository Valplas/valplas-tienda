import { query } from '../../infrastructure/database/client.js';
import {
  decodeCursor,
  encodeCursor,
  keysetPredicate,
  sliceKeysetPage
} from '../../shared/utils/keyset.js';
import type { PriceList } from '@valplas/shared/types';
import type {
  CreatePriceListData,
  UpdatePriceListData,
  PriceListFilters
} from './price-list.types.js';

const PRICE_LISTS_SORT_TAG = 'margin_asc';

export interface FindPriceListsResult {
  data: PriceList[];
  /** null en páginas con cursor: el total solo se calcula en la primera página. */
  total: number | null;
  /** La respuesta se pagina por cursor (si no, OFFSET con total). */
  keyset: boolean;
  hasMore: boolean;
  nextCursor: string | null;
}

/**
 * Listas de precio por margen. Sin `page` se pagina por cursor (margin, id); con `page`, OFFSET.
 * `id` desempata: dos listas con el mismo margen son comunes y sin él el orden no es determinista.
 */
export async function findPriceLists(
  filters: PriceListFilters = {}
): Promise<FindPriceListsResult> {
  const { search, isActive, page, cursor, limit = 50 } = filters;
  const useKeyset = page === undefined;
  const offset = useKeyset ? 0 : (page - 1) * limit;

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

  let pageWhere = where;
  const pageParams = [...params];
  let pageParamIndex = i;
  if (useKeyset && cursor) {
    const values = decodeCursor(cursor, PRICE_LISTS_SORT_TAG, 2);
    pageWhere = `${where} AND ${keysetPredicate(
      ['margin', 'id'],
      'ASC',
      ['numeric', 'uuid'],
      pageParamIndex
    )}`;
    pageParams.push(...values);
    pageParamIndex += values.length;
  }
  const pageLimit = useKeyset ? limit + 1 : limit;

  // Total: con cursor solo en la primera página (el predicado del cursor no entra en el count)
  const needsTotal = !useKeyset || !cursor;
  const [listResult, countResult] = await Promise.all([
    query<PriceList & { _k0: string }>(
      `SELECT *, margin::text AS _k0 FROM price_lists
       WHERE ${pageWhere}
       ORDER BY margin ASC, id ASC
       LIMIT $${pageParamIndex} OFFSET $${pageParamIndex + 1}`,
      [...pageParams, pageLimit, offset]
    ),
    needsTotal
      ? query<{ count: string }>(`SELECT COUNT(*) as count FROM price_lists WHERE ${where}`, params)
      : Promise.resolve(null)
  ]);

  const { rows, hasMore } = useKeyset
    ? sliceKeysetPage(listResult.rows, limit)
    : { rows: listResult.rows, hasMore: false };

  const last = rows[rows.length - 1];
  const nextCursor =
    useKeyset && hasMore && last ? encodeCursor(PRICE_LISTS_SORT_TAG, [last._k0, last.id]) : null;

  // _k0 es solo para armar el cursor: no se expone en la respuesta
  const data = rows.map(({ _k0, ...priceList }) => {
    void _k0;
    return priceList as PriceList;
  });

  return {
    data,
    total: countResult ? parseInt(countResult.rows[0].count, 10) : null,
    keyset: useKeyset,
    hasMore,
    nextCursor
  };
}

export async function findPriceListById(id: string): Promise<PriceList | null> {
  const result = await query<PriceList>(
    'SELECT * FROM price_lists WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  return result.rows[0] || null;
}

/** Listas por lote (un solo query en vez de uno por ítem). Ignora las borradas. */
export async function findPriceListsByIds(ids: string[]): Promise<PriceList[]> {
  if (ids.length === 0) return [];

  const result = await query<PriceList>(
    'SELECT * FROM price_lists WHERE id = ANY($1) AND deleted_at IS NULL',
    [ids]
  );
  return result.rows;
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
