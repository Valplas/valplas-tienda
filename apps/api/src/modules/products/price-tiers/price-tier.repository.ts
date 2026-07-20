import { query } from '../../../infrastructure/database/client.js';
import type {
  ProductPriceTier,
  ProductPriceTierInput,
  BulkAssignFilter,
  BulkConflict,
  BulkPreviewResult
} from './price-tier.types.js';

interface RawTierRow {
  id: string;
  product_id: string;
  price_list_id: string;
  price_list_name: string;
  min_quantity: number;
  unit_price: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

function mapTier(row: RawTierRow): ProductPriceTier {
  return {
    id: row.id,
    productId: row.product_id,
    priceListId: row.price_list_id,
    priceListName: row.price_list_name,
    minQuantity: Number(row.min_quantity),
    unitPrice: Number(row.unit_price),
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function findTiersByProductId(productId: string): Promise<ProductPriceTier[]> {
  const result = await query<RawTierRow>(
    `SELECT
       ppt.id,
       ppt.product_id,
       ppt.price_list_id,
       pl.name AS price_list_name,
       ppt.min_quantity,
       -- Formula: TRUNC(cost_price * (1 + margin / 100), 2)
       TRUNC(p.cost_price * (1 + pl.margin / 100) * 100) / 100 AS unit_price,
       ppt.is_active,
       ppt.created_at,
       ppt.updated_at
     FROM product_price_tiers ppt
     JOIN price_lists pl ON pl.id = ppt.price_list_id
     JOIN products p ON p.id = ppt.product_id
     WHERE ppt.product_id = $1
       AND ppt.is_active = true
       AND pl.is_active = true
       AND pl.deleted_at IS NULL
     ORDER BY ppt.min_quantity ASC`,
    [productId]
  );

  return result.rows.map(mapTier);
}

export async function findTierByProductAndPriceList(
  productId: string,
  priceListId: string
): Promise<ProductPriceTier | null> {
  const result = await query<RawTierRow>(
    `SELECT
       ppt.id,
       ppt.product_id,
       ppt.price_list_id,
       pl.name AS price_list_name,
       ppt.min_quantity,
       TRUNC(p.cost_price * (1 + pl.margin / 100) * 100) / 100 AS unit_price,
       ppt.is_active,
       ppt.created_at,
       ppt.updated_at
     FROM product_price_tiers ppt
     JOIN price_lists pl ON pl.id = ppt.price_list_id
     JOIN products p ON p.id = ppt.product_id
     WHERE ppt.product_id = $1
       AND ppt.price_list_id = $2
       AND ppt.is_active = true
       AND pl.is_active = true
       AND pl.deleted_at IS NULL`,
    [productId, priceListId]
  );

  return result.rows[0] ? mapTier(result.rows[0]) : null;
}

export async function replaceProductTiers(
  productId: string,
  tiers: ProductPriceTierInput[]
): Promise<ProductPriceTier[]> {
  // Delete all existing tiers for this product then insert the new ones
  await query('DELETE FROM product_price_tiers WHERE product_id = $1', [productId]);

  if (tiers.length === 0) return [];

  const placeholders = tiers.map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`).join(', ');
  const values: (string | number)[] = [productId];
  tiers.forEach((t) => values.push(t.priceListId, t.minQuantity));

  await query(
    `INSERT INTO product_price_tiers (product_id, price_list_id, min_quantity)
     VALUES ${placeholders}`,
    values
  );

  return findTiersByProductId(productId);
}

export async function bulkPreview(
  tiers: ProductPriceTierInput[],
  filter: BulkAssignFilter
): Promise<BulkPreviewResult> {
  const products = await getFilteredProducts(filter);

  const toAssign: BulkPreviewResult['toAssign'] = [];
  const conflicts: BulkConflict[] = [];

  // Fetch all existing tiers for matched products in one query
  const productIds = products.map((p) => p.id);
  if (productIds.length === 0) return { toAssign: [], conflicts: [] };

  const existingResult = await query<{
    product_id: string;
    min_quantity: number;
    price_list_name: string;
  }>(
    `SELECT ppt.product_id, ppt.min_quantity, pl.name AS price_list_name
     FROM product_price_tiers ppt
     JOIN price_lists pl ON pl.id = ppt.price_list_id
     WHERE ppt.product_id = ANY($1)
       AND ppt.is_active = true`,
    [productIds]
  );

  // Build a map: productId -> Set<minQuantity -> priceListName>
  const existingMap = new Map<string, Map<number, string>>();
  for (const row of existingResult.rows) {
    if (!existingMap.has(row.product_id)) {
      existingMap.set(row.product_id, new Map());
    }
    existingMap.get(row.product_id)!.set(Number(row.min_quantity), row.price_list_name);
  }

  // Fetch new price list names
  const priceListIds = [...new Set(tiers.map((t) => t.priceListId))];
  const plResult = await query<{ id: string; name: string }>(
    'SELECT id, name FROM price_lists WHERE id = ANY($1) AND is_active = true AND deleted_at IS NULL',
    [priceListIds]
  );
  const plNameMap = new Map(plResult.rows.map((r) => [r.id, r.name]));

  for (const product of products) {
    const existing = existingMap.get(product.id);
    let hasConflict = false;

    for (const tier of tiers) {
      const newName = plNameMap.get(tier.priceListId) ?? tier.priceListId;
      if (existing?.has(tier.minQuantity)) {
        const existingName = existing.get(tier.minQuantity)!;
        conflicts.push({
          productId: product.id,
          productName: product.name,
          minQuantity: tier.minQuantity,
          existingPriceListName: existingName,
          newPriceListName: newName
        });
        hasConflict = true;
      }
    }

    if (!hasConflict) {
      toAssign.push({ productId: product.id, productName: product.name });
    }
  }

  return { toAssign, conflicts };
}

export async function bulkConfirm(
  tiers: ProductPriceTierInput[],
  filter: BulkAssignFilter,
  conflictResolution: 'skip' | 'overwrite'
): Promise<{ assigned: number; skipped: number }> {
  const products = await getFilteredProducts(filter);
  if (products.length === 0) return { assigned: 0, skipped: 0 };

  const productIds = products.map((p) => p.id);

  // Fetch existing tiers for conflict detection
  const existingResult = await query<{ product_id: string; min_quantity: number }>(
    `SELECT product_id, min_quantity FROM product_price_tiers
     WHERE product_id = ANY($1) AND is_active = true`,
    [productIds]
  );
  const existingSet = new Set(existingResult.rows.map((r) => `${r.product_id}:${r.min_quantity}`));

  let assigned = 0;
  let skipped = 0;

  for (const product of products) {
    const tiersToInsert: ProductPriceTierInput[] = [];
    const tiersToUpdate: ProductPriceTierInput[] = [];

    for (const tier of tiers) {
      const key = `${product.id}:${tier.minQuantity}`;
      if (existingSet.has(key)) {
        if (conflictResolution === 'overwrite') {
          tiersToUpdate.push(tier);
        } else {
          skipped++;
        }
      } else {
        tiersToInsert.push(tier);
      }
    }

    if (tiersToInsert.length > 0) {
      const placeholders = tiersToInsert
        .map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`)
        .join(', ');
      const values: (string | number)[] = [product.id];
      tiersToInsert.forEach((t) => values.push(t.priceListId, t.minQuantity));
      await query(
        `INSERT INTO product_price_tiers (product_id, price_list_id, min_quantity) VALUES ${placeholders}`,
        values
      );
      assigned += tiersToInsert.length;
    }

    for (const tier of tiersToUpdate) {
      await query(
        `UPDATE product_price_tiers
         SET price_list_id = $1, updated_at = NOW()
         WHERE product_id = $2 AND min_quantity = $3`,
        [tier.priceListId, product.id, tier.minQuantity]
      );
      assigned++;
    }
  }

  return { assigned, skipped };
}

async function getFilteredProducts(
  filter: BulkAssignFilter
): Promise<{ id: string; name: string }[]> {
  let whereClause = 'WHERE p.is_active = true AND p.deleted_at IS NULL';
  const params: string[] = [];

  if (filter.categoryId) {
    params.push(filter.categoryId);
    whereClause += ` AND p.category_id = $${params.length}`;
  } else if (filter.brandId) {
    params.push(filter.brandId);
    whereClause += ` AND p.brand_id = $${params.length}`;
  }
  // filter.all = true: no additional WHERE clause

  const result = await query<{ id: string; name: string }>(
    `SELECT p.id, p.name FROM products p ${whereClause} ORDER BY p.name ASC`,
    params
  );

  return result.rows;
}
