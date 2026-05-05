import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { env } from '../../env.js';

const client = new MercadoPagoConfig({ accessToken: env.MP_ACCESS_TOKEN });

interface PreferenceItem {
  id: string;
  title: string;
  description?: string;
  quantity: number;
  unit_price: number;
}

interface PreferencePayer {
  email: string;
  name?: string;
  surname?: string;
}

export interface OrderPreferenceInput {
  orderNumber: string;
  items: PreferenceItem[];
  payer?: PreferencePayer;
}

export async function createOrderPreference(input: OrderPreferenceInput): Promise<string> {
  const preference = new Preference(client);
  const response = await preference.create({
    body: {
      external_reference: input.orderNumber,
      statement_descriptor: 'VALPLAS',
      items: input.items.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        currency_id: 'ARS'
      })),
      payer: input.payer
        ? { email: input.payer.email, name: input.payer.name, surname: input.payer.surname }
        : undefined,
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
