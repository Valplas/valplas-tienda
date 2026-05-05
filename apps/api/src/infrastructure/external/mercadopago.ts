import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { env } from '../../env.js';

const client = new MercadoPagoConfig({ accessToken: env.MP_ACCESS_TOKEN });

interface PreferenceItem {
  title: string;
  quantity: number;
  unit_price: number;
}

export interface OrderPreferenceInput {
  orderNumber: string;
  items: PreferenceItem[];
}

export async function createOrderPreference(input: OrderPreferenceInput): Promise<string> {
  const preference = new Preference(client);
  const response = await preference.create({
    body: {
      external_reference: input.orderNumber,
      items: input.items.map((item, i) => ({
        id: String(i + 1),
        title: item.title,
        quantity: item.quantity,
        unit_price: item.unit_price,
        currency_id: 'ARS'
      })),
      notification_url: `${env.API_URL}/api/payments/webhook`,
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

export async function fetchPayment(paymentId: string) {
  return new Payment(client).get({ id: paymentId });
}
