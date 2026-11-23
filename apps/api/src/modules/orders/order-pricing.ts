// apps/api/src/modules/orders/order-pricing.ts
//
// Precio y stock de los ítems de un pedido, calculados SIEMPRE en el servidor. Lo usan el
// checkout web (createOrder) y la cotización del bot (POST /api/bot/quote), así el bot ve
// exactamente el mismo precio que después se cobra.

import { AppError } from '../../shared/middleware/error.middleware.js';
import { findProductsByIds } from '../products/product.repository.js';
import { getTiersForCartItems } from '../cart/cart.repository.js';
import { describeLineTier, presentationSnapshot } from '../catalog/presentation.js';
import type { CreateOrderItemInput } from './order.types.js';

/**
 * Precio de un bulto: precio unitario de lista × unidades por bulto, truncado a centavos.
 * Misma fórmula que el checkout web y que la cotización del bot.
 */
export function computeBundlePrice(unitPrice: number, bundleSize: number): number {
  return Math.trunc(unitPrice * bundleSize * 100) / 100;
}

/** Línea de pedido con precio y cantidades resueltas (lo que se inserta en order_items). */
export interface PricedOrderLine {
  product_id: string;
  product_name: string;
  product_sku: string;
  /** Bultos */
  quantity: number;
  /** Unidades reales (para stock): quantity × bundle_size_snapshot */
  real_quantity: number;
  bundle_size_snapshot: number;
  /** Precio por bulto (trigger: subtotal = quantity × unit_price) */
  unit_price: number;
  subtotal: number;
  price_list_id?: string;
  /** Unidades disponibles (stock - reserved_stock) al momento de cotizar */
  available_stock: number;
  /** Texto de la presentación al comprar (ej: "Bulto · 10 paquetes"); no cambia si se renombra el tier */
  presentation_label_snapshot: string | null;
  /** Posición en el array de ítems recibido (las líneas con problema se omiten) */
  item_index: number;
}

export type OrderPricingProblem =
  | { code: 'PRODUCT_NOT_FOUND'; product_id: string }
  | { code: 'PRODUCT_UNAVAILABLE'; product_id: string; product_name: string }
  | {
      code: 'PRICE_TIER_NOT_FOUND';
      product_id: string;
      product_name: string;
      price_list_id: string | null;
    }
  | {
      code: 'INSUFFICIENT_STOCK';
      product_id: string;
      product_name: string;
      available: number;
      requested: number;
    }
  | {
      /** Modo units: las líneas cobradas no coinciden con el plan (un tier cambió) */
      code: 'UNITS_PLAN_MISMATCH';
      product_id: string;
      product_name: string;
      requested: number;
    }
  | {
      /** Modo units (bot): no hay combinación exacta de presentaciones para esas unidades */
      code: 'UNITS_NOT_ACHIEVABLE';
      product_id: string;
      product_name: string;
      requested: number;
      nearest_below: number | null;
      nearest_above: number | null;
    };

export interface OrderPricingResult {
  /** Líneas de productos existentes y activos (incluye las que no tienen stock suficiente) */
  lines: PricedOrderLine[];
  /** Suma de subtotales de `lines` */
  subtotal: number;
  /** Problemas en el orden de los ítems recibidos. Vacío = el pedido se puede crear. */
  problems: OrderPricingProblem[];
}

export interface OrderPricingOptions {
  /**
   * Exigir un tier (producto, lista) existente. Sin esto, un ítem sin price_list_id o con una
   * lista que no aplica al producto se vende a costo (comportamiento histórico del checkout
   * web). Los canales externos (bot) lo activan.
   */
  requireTier?: boolean;
}

/**
 * Resuelve producto, bulto, precio y stock de cada ítem con 2 queries en total (productos
 * con WHERE id = ANY y tiers en batch), sin N+1. No tira errores: los devuelve en `problems`
 * para que el checkout los convierta en AppError y la cotización los informe por línea.
 */
export async function priceOrderItems(
  items: CreateOrderItemInput[],
  options: OrderPricingOptions = {}
): Promise<OrderPricingResult> {
  const [products, tierMap] = await Promise.all([
    findProductsByIds(items.map((i) => i.product_id)),
    // Tiers (precio de lista por bulto) para los ítems que traen price_list_id.
    getTiersForCartItems(
      items
        .filter((i) => i.price_list_id)
        .map((i) => ({ productId: i.product_id, priceListId: i.price_list_id as string }))
    )
  ]);
  const productMap = new Map(products.map((p) => [p.id, p]));

  const lines: PricedOrderLine[] = [];
  const problems: OrderPricingProblem[] = [];
  let subtotal = 0;
  // Unidades pedidas por producto acumuladas entre líneas: el mismo producto puede venir en
  // varias presentaciones (una línea por tier) y entre todas comparten el stock.
  const requestedUnitsByProduct = new Map<string, number>();

  for (const [itemIndex, item] of items.entries()) {
    const product = productMap.get(item.product_id);

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

    // Semántica de bultos: quantity = bultos; bundleSize = unidades por bulto.
    const tier = item.price_list_id
      ? tierMap.get(`${item.product_id}:${item.price_list_id}`)
      : undefined;

    if (options.requireTier && !tier) {
      problems.push({
        code: 'PRICE_TIER_NOT_FOUND',
        product_id: item.product_id,
        product_name: product.name,
        price_list_id: item.price_list_id ?? null
      });
      continue;
    }

    const bundleSize = tier?.minQuantity ?? 1;
    // Sin lista asignada se vende a costo (placeholder hasta asignar lista)
    const unitPrice = tier?.unitPrice ?? product.costPrice;
    const realQuantity = item.quantity * bundleSize; // unidades reales (para stock)
    const pricePerBundle = computeBundlePrice(unitPrice, bundleSize);
    const itemSubtotal = Math.trunc(pricePerBundle * item.quantity * 100) / 100;

    // El stock se controla en unidades reales (no bultos), sumando las líneas del producto.
    const availableStock = product.stock - product.reservedStock;
    const requestedUnits = (requestedUnitsByProduct.get(item.product_id) ?? 0) + realQuantity;
    requestedUnitsByProduct.set(item.product_id, requestedUnits);
    if (availableStock < requestedUnits) {
      problems.push({
        code: 'INSUFFICIENT_STOCK',
        product_id: item.product_id,
        product_name: product.name,
        available: availableStock,
        requested: requestedUnits
      });
    }

    subtotal += itemSubtotal;

    lines.push({
      product_id: item.product_id,
      product_name: product.name,
      product_sku: product.sku,
      quantity: item.quantity,
      real_quantity: realQuantity,
      bundle_size_snapshot: bundleSize,
      unit_price: pricePerBundle,
      subtotal: itemSubtotal,
      price_list_id: item.price_list_id,
      available_stock: availableStock,
      presentation_label_snapshot: presentationSnapshot(
        describeLineTier(
          {
            label: product.unitLabel ?? null,
            contentQuantity: product.unitContentQuantity ?? null,
            contentLabel: product.unitContentLabel ?? null
          },
          {
            priceListId: item.price_list_id ?? '',
            minQuantity: bundleSize,
            unitPrice,
            label: tier?.label ?? null
          }
        )
      ),
      item_index: itemIndex
    });
  }

  return { lines, subtotal: Math.round(subtotal * 100) / 100, problems };
}

/** Convierte un problema de pricing en el AppError que devuelve el checkout. */
export function pricingProblemToError(problem: OrderPricingProblem): AppError {
  switch (problem.code) {
    case 'PRODUCT_NOT_FOUND':
      return new AppError('PRODUCT_NOT_FOUND', `Producto ${problem.product_id} no encontrado`, 400);
    case 'PRODUCT_UNAVAILABLE':
      return new AppError(
        'PRODUCT_UNAVAILABLE',
        `Producto ${problem.product_name} no está disponible`,
        400
      );
    case 'PRICE_TIER_NOT_FOUND':
      return new AppError(
        'PRICE_TIER_NOT_FOUND',
        `El producto ${problem.product_name} no tiene precio en la lista indicada`,
        400,
        { product_id: problem.product_id, price_list_id: problem.price_list_id }
      );
    case 'INSUFFICIENT_STOCK':
      return new AppError(
        'INSUFFICIENT_STOCK',
        `Stock insuficiente para ${problem.product_name}. Disponible: ${problem.available}, solicitado: ${problem.requested}`,
        409
      );
    case 'UNITS_PLAN_MISMATCH':
      return new AppError(
        'UNITS_PLAN_MISMATCH',
        'Las presentaciones del producto cambiaron, volvé a cotizar',
        409,
        { product_id: problem.product_id }
      );
    case 'UNITS_NOT_ACHIEVABLE':
      return new AppError(
        'UNITS_NOT_ACHIEVABLE',
        `No se puede armar exactamente ${problem.requested} unidades de ${problem.product_name} con sus presentaciones`,
        422,
        {
          product_id: problem.product_id,
          requested: problem.requested,
          nearest_below: problem.nearest_below,
          nearest_above: problem.nearest_above
        }
      );
  }
}
