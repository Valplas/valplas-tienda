import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { env } from '../../env.js';

const client = new MercadoPagoConfig({ accessToken: env.MP_ACCESS_TOKEN });

interface PreferenceItem {
  id: string;
  title: string;
  description?: string;
  category_id?: string;
  quantity: number;
  unit_price: number;
}

interface PreferencePayer {
  email: string;
  name?: string;
  surname?: string;
  phone?: string;
  identification?: { type: string; number: string };
  address?: {
    zip_code?: string;
    street_name?: string;
    street_number?: string;
  };
}

export interface OrderPreferenceInput {
  orderNumber: string;
  items: PreferenceItem[];
  /** Costo de envío en la misma unidad que items[].unit_price. Se cobra como `shipments.cost`. */
  shippingCost?: number;
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
        category_id: item.category_id ?? 'others',
        quantity: item.quantity,
        unit_price: item.unit_price,
        currency_id: 'ARS'
      })),
      payer: input.payer
        ? {
            email: input.payer.email,
            name: input.payer.name,
            surname: input.payer.surname,
            phone: input.payer.phone ? { number: input.payer.phone } : undefined,
            identification: input.payer.identification,
            address: input.payer.address
          }
        : undefined,
      shipments:
        input.shippingCost && input.shippingCost > 0
          ? { cost: input.shippingCost, mode: 'not_specified' }
          : undefined,
      notification_url: `${env.API_URL}/api/payments/webhook`,
      back_urls: {
        success: `${env.FRONTEND_URL}/checkout/resultado`,
        failure: `${env.FRONTEND_URL}/checkout/resultado`,
        pending: `${env.FRONTEND_URL}/checkout/resultado`
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
