// apps/api/src/modules/orders/order-payment.ts
//
// Link de pago de Mercado Pago (Checkout Pro) para una orden ya creada. Lo usan el checkout
// web (al crear la orden) y el bot (al crear la orden y al regenerar el link).

import {
  createOrderPreference,
  type PreferenceBackUrls
} from '../../infrastructure/external/mercadopago.js';
import type { OrderWithDetails } from './order.types.js';

export interface PaymentLinkOptions {
  backUrls?: PreferenceBackUrls;
  expiresAt?: Date;
  payerIdentification?: { type: string; number: string };
}

/**
 * Crea la preferencia de MP con los ítems y el envío de la orden y devuelve el init_point.
 * Los montos salen de la orden persistida (no del request), así un link regenerado cobra
 * exactamente lo mismo que el original.
 */
export async function createPaymentLinkForOrder(
  order: OrderWithDetails,
  options: PaymentLinkOptions = {}
): Promise<string> {
  return createOrderPreference({
    orderNumber: order.order_number,
    shippingCost: Number(order.shipping_cost),
    items: order.items.map((item) => ({
      id: item.product_id,
      title: item.product_name,
      description: item.product_sku,
      quantity: item.quantity,
      unit_price: Number(item.unit_price)
    })),
    payer: order.user?.email
      ? {
          email: order.user.email,
          name: order.user.first_name ?? undefined,
          surname: order.user.last_name ?? undefined,
          phone: order.user.phone ?? undefined,
          identification: options.payerIdentification,
          address: {
            zip_code: order.shipping_postcode,
            street_name: order.shipping_street,
            street_number: order.shipping_street_number
          }
        }
      : undefined,
    backUrls: options.backUrls,
    expiresAt: options.expiresAt
  });
}
