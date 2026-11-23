// apps/api/src/modules/bot/bot-units.ts
//
// Expansión de los ítems del bot antes del pricing. El bot puede pedir por presentación
// ({ product_id, price_list_id, quantity }, formato histórico) o por unidades
// ({ product_id, units }): en ese caso el servidor elige la combinación exacta más barata de
// presentaciones. /quote y /orders pasan por esta misma función, así cobran lo mismo.

import { getActiveTiersByProductIds } from '../catalog/catalog.repository.js';
import { findProductsByIds } from '../products/product.repository.js';
import { computeBundlePrice, type OrderPricingProblem } from '../orders/order-pricing.js';
import type { CreateOrderItemInput } from '../orders/order.types.js';
import { MAX_PLAN_UNITS, planUnits, type PlannablePresentation } from '../orders/plan-units.js';

export type BotItemInput =
  | { product_id: string; price_list_id: string; quantity: number }
  | { product_id: string; units: number };

export interface RequestedGroup {
  product_id: string;
  /** Unidades pedidas (legacy: quantity × bundle_size de la presentación; 0 si no se resuelve) */
  units: number;
  /** Índices en `pricingItems` de las líneas de este ítem recibido */
  lineIndexes: number[];
  /**
   * Solo ítems `units`: si otro ítem anterior del mismo producto se planificó junto con este,
   * índice (en los ítems recibidos) del primero; las líneas viven en ese grupo.
   */
  merged_into?: number;
}

export interface ExpandedBotItems {
  /** Lo que va a priceOrderItems / createOrder */
  pricingItems: CreateOrderItemInput[];
  /** Un grupo por ítem recibido, en orden */
  requestedGroups: RequestedGroup[];
  /** UNITS_NOT_ACHIEVABLE / PRICE_TIER_NOT_FOUND / PRODUCT_* (solo ítems `units`) */
  problems: OrderPricingProblem[];
}

function isUnitsItem(item: BotItemInput): item is { product_id: string; units: number } {
  return 'units' in item;
}

export async function expandBotItems(items: BotItemInput[]): Promise<ExpandedBotItems> {
  const unitsByProduct = new Map<string, number>();
  for (const item of items) {
    if (isUnitsItem(item)) {
      unitsByProduct.set(item.product_id, (unitsByProduct.get(item.product_id) ?? 0) + item.units);
    }
  }

  const productIds = [...new Set(items.map((item) => item.product_id))];
  // Dos queries en batch (sin N+1): tiers activos de todos los productos y datos de producto
  // (nombre y estado) solo si hay ítems `units`.
  const [tiersByProduct, products] = await Promise.all([
    getActiveTiersByProductIds(productIds),
    unitsByProduct.size > 0 ? findProductsByIds([...unitsByProduct.keys()]) : Promise.resolve([])
  ]);
  const productById = new Map(products.map((product) => [product.id, product]));

  const pricingItems: CreateOrderItemInput[] = [];
  const requestedGroups: RequestedGroup[] = [];
  const problems: OrderPricingProblem[] = [];
  // Producto → posición (en ítems recibidos) del primer ítem `units` que lo planifica
  const firstUnitsEntry = new Map<string, number>();

  for (const [index, item] of items.entries()) {
    if (!isUnitsItem(item)) {
      const tier = tiersByProduct
        .get(item.product_id)
        ?.find((candidate) => candidate.priceListId === item.price_list_id);
      requestedGroups.push({
        product_id: item.product_id,
        units: item.quantity * (tier?.minQuantity ?? 0),
        lineIndexes: [pricingItems.length]
      });
      pricingItems.push({
        product_id: item.product_id,
        price_list_id: item.price_list_id,
        quantity: item.quantity
      });
      continue;
    }

    const firstIndex = firstUnitsEntry.get(item.product_id);
    if (firstIndex !== undefined) {
      requestedGroups.push({
        product_id: item.product_id,
        units: item.units,
        lineIndexes: [],
        merged_into: firstIndex
      });
      continue;
    }
    firstUnitsEntry.set(item.product_id, index);

    const group: RequestedGroup = {
      product_id: item.product_id,
      units: item.units,
      lineIndexes: []
    };
    requestedGroups.push(group);

    const product = productById.get(item.product_id);
    if (!product) {
      problems.push({ code: 'PRODUCT_NOT_FOUND', product_id: item.product_id });
      continue;
    }
    if (!product.isActive) {
      problems.push({
        code: 'PRODUCT_UNAVAILABLE',
        product_id: item.product_id,
        product_name: product.name
      });
      continue;
    }

    // Se planifica la suma de todos los ítems `units` del producto. Presentaciones con bulto
    // absurdo (> MAX_PLAN_UNITS) se descartan: nunca pueden entrar en un plan válido.
    const presentations: PlannablePresentation[] = (tiersByProduct.get(item.product_id) ?? [])
      .filter((tier) => tier.minQuantity <= MAX_PLAN_UNITS)
      .map((tier) => ({
        priceListId: tier.priceListId,
        bundleSize: tier.minQuantity,
        bundlePrice: computeBundlePrice(tier.unitPrice, tier.minQuantity)
      }));
    if (presentations.length === 0) {
      problems.push({
        code: 'PRICE_TIER_NOT_FOUND',
        product_id: item.product_id,
        product_name: product.name,
        price_list_id: null
      });
      continue;
    }

    const totalUnits = unitsByProduct.get(item.product_id) as number;
    if (totalUnits > MAX_PLAN_UNITS) {
      // La suma de varios ítems puede pasar el tope que valida cada uno por separado
      problems.push({
        code: 'UNITS_NOT_ACHIEVABLE',
        product_id: item.product_id,
        product_name: product.name,
        requested: totalUnits,
        nearest_below: null,
        nearest_above: null
      });
      continue;
    }

    const plan = planUnits(totalUnits, presentations);
    if (!plan.ok) {
      problems.push({
        code: 'UNITS_NOT_ACHIEVABLE',
        product_id: item.product_id,
        product_name: product.name,
        requested: totalUnits,
        nearest_below: plan.nearestBelow,
        nearest_above: plan.nearestAbove
      });
      continue;
    }

    for (const line of plan.lines) {
      group.lineIndexes.push(pricingItems.length);
      pricingItems.push({
        product_id: item.product_id,
        price_list_id: line.priceListId,
        quantity: line.quantity
      });
    }
  }

  return { pricingItems, requestedGroups, problems };
}
