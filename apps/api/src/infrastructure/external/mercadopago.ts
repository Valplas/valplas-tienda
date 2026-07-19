import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import dayjs from 'dayjs';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { env } from '../../env.js';
import { logger } from '../logger/index.js';

const client = new MercadoPagoConfig({ accessToken: env.MP_ACCESS_TOKEN });

/**
 * Vida útil de la preferencia de pago. Pasado este plazo MP rechaza el pago,
 * y el job cancel-stale-orders (con 1h de buffer) cancela la orden para
 * liberar el stock reservado.
 */
export const PAYMENT_EXPIRATION_HOURS = 24;

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
  /**
   * Costo de envío en la misma unidad que items[].unit_price. Se cobra como
   * ítem "Envío" y NO como `shipments.cost`: MP excluye shipments.cost del
   * transaction_amount y el comprobante compartible muestra ese campo, así
   * que el cliente veía un total menor al que pagó.
   */
  shippingCost?: number;
  payer?: PreferencePayer;
}

/**
 * MP espera el teléfono como número nacional (sin código de país).
 * Los teléfonos se almacenan en E.164 (+549...), así que se parsea y se
 * envía el national number. Si no es parseable, se omite el campo.
 */
function toMpPhone(raw: string | undefined): { number: string } | undefined {
  if (!raw) return undefined;
  const parsed = parsePhoneNumberFromString(raw, 'AR');
  if (!parsed || !parsed.isValid()) return undefined;
  return { number: parsed.nationalNumber };
}

export async function createOrderPreference(input: OrderPreferenceInput): Promise<string> {
  const notificationUrl = `${env.API_URL}/api/payments/webhook`;

  if (/localhost|127\.0\.0\.1/.test(notificationUrl)) {
    logger.warn(
      `MP: notification_url (${notificationUrl}) apunta a localhost — MP no podrá entregar webhooks. Probá contra el deploy de develop o usá un túnel.`
    );
  }

  const mpItems = input.items.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    category_id: item.category_id ?? 'others',
    quantity: item.quantity,
    unit_price: item.unit_price,
    currency_id: 'ARS'
  }));

  if (input.shippingCost && input.shippingCost > 0) {
    mpItems.push({
      id: 'envio',
      title: 'Envío',
      description: undefined,
      category_id: 'others',
      quantity: 1,
      unit_price: input.shippingCost,
      currency_id: 'ARS'
    });
  }

  const preference = new Preference(client);
  const response = await preference.create({
    body: {
      external_reference: input.orderNumber,
      statement_descriptor: 'VALPLAS',
      items: mpItems,
      payer: input.payer
        ? {
            email: input.payer.email,
            name: input.payer.name,
            surname: input.payer.surname,
            phone: toMpPhone(input.payer.phone),
            identification: input.payer.identification,
            address: input.payer.address
          }
        : undefined,
      notification_url: notificationUrl,
      back_urls: {
        success: `${env.FRONTEND_URL}/checkout/resultado`,
        failure: `${env.FRONTEND_URL}/checkout/resultado`,
        pending: `${env.FRONTEND_URL}/checkout/resultado`
      },
      auto_return: 'approved',
      expires: true,
      expiration_date_from: dayjs().format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
      expiration_date_to: dayjs()
        .add(PAYMENT_EXPIRATION_HOURS, 'hour')
        .format('YYYY-MM-DDTHH:mm:ss.SSSZ')
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
