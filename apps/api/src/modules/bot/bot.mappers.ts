// apps/api/src/modules/bot/bot.mappers.ts
//
// Respuestas de la API del bot. Whitelist explícita de campos: nunca sale cost_price, margen,
// password_hash ni datos internos de la orden (admin_notes, payment_id). Se arman en snake_case
// y el middleware camelCaseResponse las convierte.

import { computeBundlePrice, type PricedOrderLine } from '../orders/order-pricing.js';
import { STATUS_LABELS } from '../orders/order.types.js';
import type { Order, OrderWithDetails } from '../orders/order.types.js';
import type { PublicProduct } from '../catalog/catalog.repository.js';
import { productSummary, type PublicUnit } from '../catalog/presentation.js';
import type { ProductAttributeView } from '../attributes/attribute.types.js';
import type { CategoryWithChildren } from '../categories/category.types.js';
import type { User } from '../users/user.types.js';
import type { UserAddressWithDelivery } from '../addresses/address.types.js';
import type { ShippingQuote } from '../shipping/shipping.types.js';

export interface BotCategory {
  id: string;
  name: string;
  slug: string;
  children: BotCategory[];
}

export function toBotCategory(category: CategoryWithChildren): BotCategory {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    children: category.children.map(toBotCategory)
  };
}

/** Presentación vendible de un producto: un tier (lista de precios + tamaño de bulto). */
export interface BotPresentation {
  price_list_id: string;
  bundle_size: number;
  unit_price: number;
  bundle_price: number;
  available_bundles: number;
  label: string;
  contains: string | null;
  savings_percent: number;
  description: string;
}

export interface BotProduct {
  id: string;
  sku: string;
  name: string;
  slug: string;
  image_url: string | null;
  available_stock: number;
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  /** available_stock > 0. */
  in_stock: boolean;
  /** Se puede pedir por el bot: tiene presentaciones (lista asignada) y stock disponible. */
  purchasable: boolean;
  /** Unidad de venta y contenido; null si el producto no los define. */
  unit: PublicUnit | null;
  /** Texto listo para leer con todas las presentaciones; null si no tiene. */
  summary: string | null;
  presentations: BotPresentation[];
  /** Atributos con valor (medidas, color, talle…) por display_order; vacío si no tiene. */
  attributes: ProductAttributeView[];
  /** Sinónimos de búsqueda: tags del producto + los de su categoría y ancestros. */
  tags: string[];
}

export function toBotProduct(product: PublicProduct): BotProduct {
  const presentations = product.tiers.map((tier) => ({
    price_list_id: tier.price_list_id,
    bundle_size: tier.min_quantity,
    unit_price: tier.unit_price,
    bundle_price: computeBundlePrice(tier.unit_price, tier.min_quantity),
    available_bundles: Math.max(0, Math.floor(product.available_stock / tier.min_quantity)),
    label: tier.label,
    contains: tier.contains,
    savings_percent: tier.savings_percent,
    description: tier.description
  }));
  const summary = productSummary(
    product.name,
    product.tiers.map((tier) => ({
      priceListId: tier.price_list_id,
      bundleSize: tier.min_quantity,
      unitPrice: tier.unit_price,
      bundlePrice: tier.bundle_price,
      label: tier.label,
      contains: tier.contains,
      savingsPercent: tier.savings_percent,
      description: tier.description
    }))
  );

  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    slug: product.slug,
    image_url: product.image_url,
    available_stock: product.available_stock,
    category: product.category,
    brand: product.brand,
    in_stock: product.available_stock > 0,
    purchasable: presentations.length > 0 && product.available_stock > 0,
    unit: product.unit,
    summary,
    presentations,
    attributes: product.attributes,
    tags: product.tags ?? []
  };
}

export interface BotCustomer {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
}

export function toBotCustomer(user: User): BotCustomer {
  return {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    phone: user.phone,
    email: user.email
  };
}

export function toBotAddress(address: UserAddressWithDelivery) {
  return {
    id: address.id,
    alias: address.alias,
    street: address.street,
    street_number: address.street_number,
    floor: address.floor,
    apartment: address.apartment,
    city: address.city,
    province: address.province,
    postcode: address.postcode,
    notes: address.notes,
    is_default: address.is_default,
    is_deliverable: address.is_deliverable
  };
}

/** Línea cotizada; `presentation` (nombre y texto de la presentación) puede faltar. */
export function toBotQuoteLine(
  line: PricedOrderLine,
  presentation?: { label: string; description: string }
) {
  return {
    product_id: line.product_id,
    product_name: line.product_name,
    product_sku: line.product_sku,
    price_list_id: line.price_list_id ?? null,
    quantity: line.quantity,
    bundle_size: line.bundle_size_snapshot,
    units: line.real_quantity,
    bundle_price: line.unit_price,
    subtotal: line.subtotal,
    available_stock: line.available_stock,
    label: presentation?.label ?? null,
    description: presentation?.description ?? null
  };
}

export type BotQuoteLine = ReturnType<typeof toBotQuoteLine>;

export function toBotShippingOption(option: ShippingQuote, subtotal: number) {
  return {
    carrier_id: option.carrier_id,
    carrier_name: option.carrier_name,
    price: option.price,
    estimated_days: option.estimated_days,
    total: Math.round((subtotal + option.price) * 100) / 100
  };
}

export function toBotOrderSummary(order: Order) {
  return {
    id: order.id,
    order_number: order.order_number,
    status: order.status,
    status_label: STATUS_LABELS[order.status],
    sales_channel: order.sales_channel,
    total: order.total,
    created_at: order.created_at
  };
}

export function toBotOrder(order: OrderWithDetails) {
  return {
    ...toBotOrderSummary(order),
    subtotal: order.subtotal,
    shipping_cost: order.shipping_cost,
    carrier_name: order.carrier_name,
    payment_method: order.payment_method,
    updated_at: order.updated_at,
    shipping_address: {
      street: order.shipping_street,
      street_number: order.shipping_street_number,
      floor: order.shipping_floor,
      apartment: order.shipping_apartment,
      city: order.shipping_city,
      province: order.shipping_province,
      postcode: order.shipping_postcode
    },
    items: order.items.map((item) => {
      // bundle_size_snapshot viene del SELECT explícito de findOrderWithDetails
      const { bundle_size_snapshot: bundleSize } = item as typeof item & {
        bundle_size_snapshot?: number;
      };
      return {
        product_id: item.product_id,
        product_name: item.product_name,
        product_sku: item.product_sku,
        quantity: item.quantity,
        bundle_size: bundleSize ?? 1,
        bundle_price: item.unit_price,
        subtotal: item.subtotal,
        presentation_label: item.presentation_label_snapshot ?? null
      };
    })
  };
}
