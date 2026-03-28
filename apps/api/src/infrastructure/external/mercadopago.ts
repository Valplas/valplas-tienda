import { MercadoPagoConfig, Preference } from 'mercadopago';
import { env } from '../../env.js';

const client = new MercadoPagoConfig({ accessToken: env.MERCADOPAGO_ACCESS_TOKEN });

interface OrderPreferenceInput {
  orderNumber: string;
  items: Array<{ title: string; quantity: number; unit_price: number }>;
  notificationUrl: string;
}

export async function createOrderPreference(order: OrderPreferenceInput): Promise<string> {
  const preference = new Preference(client);

  const response = await preference.create({
    body: {
      external_reference: order.orderNumber,
      items: order.items.map((item, i) => ({
        id: String(i + 1),
        title: item.title,
        quantity: item.quantity,
        unit_price: item.unit_price,
        currency_id: 'ARS'
      })),
      notification_url: order.notificationUrl,
      back_urls: {
        success: `${env.FRONTEND_URL}/cuenta/pedidos`,
        failure: `${env.FRONTEND_URL}/cuenta/pedidos`,
        pending: `${env.FRONTEND_URL}/cuenta/pedidos`
      },
      auto_return: 'approved'
    }
  });

  if (!response.init_point) {
    throw new Error('MercadoPago no devolvió init_point');
  }

  return response.init_point;
}
