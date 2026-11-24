// apps/api/src/modules/bot/bot-units.ts
//
// Expansión de los ítems del bot antes del pricing. El bot puede pedir por presentación
// ({ product_id, price_list_id, quantity }, formato histórico) o por unidades
// ({ product_id, units }): en ese caso el servidor elige la combinación exacta más barata de
// presentaciones. /quote y /orders pasan por esta misma función, así cobran lo mismo.

import { getActiveTiersByProductIds } from '../catalog/catalog.repository.js';
import { findProductsByIds } from '../products/product.repository.js';
import {
  computeBundlePrice,
  type OrderPricingProblem,
  type PricedOrderLine
} from '../orders/order-pricing.js';
import type { CreateOrderItemInput } from '../orders/order.types.js';
import type { TierForDisplay } from '../catalog/presentation.js';
import { MAX_PLAN_UNITS, planUnits, type PlannablePresentation } from '../orders/plan-units.js';

export type BotItemInput =
  | { product_id: string; price_list_id: string; quantity: number }
  | { product_id: string; units: number };

export interface RequestedGroup {
  product_id: string;
  /** 'legacy': ítem por presentación; 'units': ítem por unidades */
  kind: 'legacy' | 'units';
  /**
   * Solo kind 'units': unidades pedidas. En 'legacy' queda en 0 y quote() las calcula sumando el
   * `real_quantity` de las líneas ya cotizadas (las que no se cotizan no suman).
   */
  units: number;
  /** Índices en `pricingItems` de las líneas de este ítem recibido */
  lineIndexes: number[];
  /**
   * Solo ítems `units`: si otro ítem anterior del mismo producto se planificó junto con este,
   * índice (en los ítems recibidos) del primero; las líneas viven en ese grupo.
   */
  merged_into?: number;
}

/** Plan de un producto en modo units: lo que pricing debe devolver para que no haya cobro erróneo. */
export interface UnitsPlanRecord {
  product_id: string;
  product_name: string;
  /** Suma de unidades de todos los ítems units del producto */
  units: number;
  /** Índices en `pricingItems` y bulto planificado de cada uno (paralelos) */
  lineIndexes: number[];
  bundleSizes: number[];
}

export interface ExpandedBotItems {
  /** Un plan por producto con ítems units que se pudo planificar */
  unitsPlans: UnitsPlanRecord[];
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

  // Dos queries en batch (sin N+1): tiers activos y datos de producto (nombre y estado), solo de
  // los productos con ítems `units`. Sin ítems `units` no se hace ninguna de las dos consultas.
  const unitsProductIds = [...unitsByProduct.keys()];
  const [tiersByProduct, products] =
    unitsProductIds.length > 0
      ? await Promise.all([
          getActiveTiersByProductIds(unitsProductIds),
          findProductsByIds(unitsProductIds)
        ])
      : [new Map<string, TierForDisplay[]>(), []];
  const productById = new Map(products.map((product) => [product.id, product]));

  const pricingItems: CreateOrderItemInput[] = [];
  const requestedGroups: RequestedGroup[] = [];
  const problems: OrderPricingProblem[] = [];
  const unitsPlans: UnitsPlanRecord[] = [];
  // Producto → posición (en ítems recibidos) del primer ítem `units` que lo planifica
  const firstUnitsEntry = new Map<string, number>();

  for (const [index, item] of items.entries()) {
    if (!isUnitsItem(item)) {
      requestedGroups.push({
        product_id: item.product_id,
        kind: 'legacy',
        units: 0,
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
        kind: 'units',
        units: item.units,
        lineIndexes: [],
        merged_into: firstIndex
      });
      continue;
    }
    firstUnitsEntry.set(item.product_id, index);

    const group: RequestedGroup = {
      product_id: item.product_id,
      kind: 'units',
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
    // Tampoco se usan listas repetidas en varias presentaciones del producto: pricing busca el
    // tier por (producto, lista) y la línea podría resolverse a otro bulto (cobro erróneo).
    const productTiers = tiersByProduct.get(item.product_id) ?? [];
    const listCounts = new Map<string, number>();
    for (const tier of productTiers) {
      listCounts.set(tier.priceListId, (listCounts.get(tier.priceListId) ?? 0) + 1);
    }
    const presentations: PlannablePresentation[] = productTiers
      .filter(
        (tier) => tier.minQuantity <= MAX_PLAN_UNITS && listCounts.get(tier.priceListId) === 1
      )
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

    const record: UnitsPlanRecord = {
      product_id: item.product_id,
      product_name: product.name,
      units: totalUnits,
      lineIndexes: [],
      bundleSizes: []
    };
    unitsPlans.push(record);
    for (const line of plan.lines) {
      group.lineIndexes.push(pricingItems.length);
      record.lineIndexes.push(pricingItems.length);
      record.bundleSizes.push(line.bundleSize);
      pricingItems.push({
        product_id: item.product_id,
        price_list_id: line.priceListId,
        quantity: line.quantity
      });
    }
  }

  return { pricingItems, requestedGroups, problems, unitsPlans };
}

/**
 * Red de seguridad tras el pricing: las líneas cobradas deben ser las planificadas (mismo
 * bulto) y sumar exactamente las unidades pedidas. Si un tier cambió entre la lectura del plan
 * y la del pricing, el cliente pagaría otra cantidad. Función pura.
 */
export function findUnitsPlanMismatches(
  plans: UnitsPlanRecord[],
  pricedLines: Pick<PricedOrderLine, 'item_index' | 'bundle_size_snapshot' | 'real_quantity'>[]
): OrderPricingProblem[] {
  const lineByIndex = new Map(pricedLines.map((line) => [line.item_index, line]));
  const problems: OrderPricingProblem[] = [];
  for (const plan of plans) {
    const priced = plan.lineIndexes.map((index) => lineByIndex.get(index));
    // Líneas ausentes ya tienen su propio problema de pricing
    if (priced.some((line) => line === undefined)) continue;
    const lines = priced as Array<(typeof pricedLines)[number]>;
    const sizesMatch = lines.every((line, i) => line.bundle_size_snapshot === plan.bundleSizes[i]);
    const total = lines.reduce((sum, line) => sum + line.real_quantity, 0);
    if (!sizesMatch || total !== plan.units) {
      problems.push({
        code: 'UNITS_PLAN_MISMATCH',
        product_id: plan.product_id,
        product_name: plan.product_name,
        requested: plan.units
      });
    }
  }
  return problems;
}
