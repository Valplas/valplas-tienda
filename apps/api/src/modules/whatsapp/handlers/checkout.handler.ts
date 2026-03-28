import * as addressRepository from '../../addresses/address.repository.js';
import * as shippingRepository from '../../shipping/shipping.repository.js';
import * as orderDomain from '../../orders/order.domain.js';
import { createOrderPreference } from '../../../infrastructure/external/mercadopago.js';
import { sendTextMessage } from '../whatsapp.client.js';
import { updateSessionState } from '../session.repository.js';
import type { WhatsAppSession, SessionContext } from '../whatsapp.types.js';
import { env } from '../../../env.js';

function formatPrice(n: number): string {
  return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export async function startCheckout(session: WhatsAppSession): Promise<void> {
  if (!session.userId) {
    await sendTextMessage(
      session.phone,
      '❌ No pudimos identificar tu cuenta. Por favor escribí "hola" para empezar de nuevo.'
    );
    await updateSessionState(session.phone, 'idle', session.context);
    return;
  }

  const address = await addressRepository.findDefaultAddress(session.userId);
  if (!address) {
    await sendTextMessage(
      session.phone,
      '📍 No tenés una dirección de envío cargada. Contactá al admin para registrarla.'
    );
    await updateSessionState(session.phone, 'idle', session.context);
    return;
  }

  const zone = await shippingRepository.findZoneByPostcode(address.postcode);
  if (!zone) {
    await sendTextMessage(
      session.phone,
      '🚚 No realizamos envíos a tu zona actualmente.'
    );
    await updateSessionState(session.phone, 'idle', session.context);
    return;
  }

  const subtotal = session.context.cart.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );

  const rates = await shippingRepository.findRatesByZoneAndAmount(zone.id, subtotal);
  if (!rates || rates.length === 0) {
    await sendTextMessage(
      session.phone,
      '🚚 No hay tarifas de envío disponibles para tu zona y monto.'
    );
    await updateSessionState(session.phone, 'idle', session.context);
    return;
  }

  const rate = rates[0];
  const carrier = await shippingRepository.findCarrierById(rate.carrier_id);
  const carrierName = carrier?.name ?? 'Envío';

  const total = subtotal + rate.price;
  const addressStr = [
    address.street,
    address.street_number,
    address.floor ? `piso ${address.floor}` : null,
    address.apartment ? `depto ${address.apartment}` : null,
    address.city
  ]
    .filter(Boolean)
    .join(' ');

  const lines = session.context.cart.map(
    (item) =>
      `• ${item.productName} x${item.quantity} → ${formatPrice(item.unitPrice * item.quantity)}`
  );

  await updateSessionState(session.phone, 'checkout_confirm', {
    ...session.context,
    categoryId: zone.id,    // reusing field to store zone id temporarily
    productId: rate.id,     // reusing field to store rate id temporarily
    productName: address.id // reusing field to store address id temporarily
  });

  await sendTextMessage(
    session.phone,
    `📦 *Resumen del pedido*\n\n${lines.join('\n')}\n\nDirección: ${addressStr}\nEnvío: ${carrierName} - ${formatPrice(rate.price)}\n\nSubtotal: ${formatPrice(subtotal)}\nEnvío:     ${formatPrice(rate.price)}\n*Total: ${formatPrice(total)}*\n\n1️⃣ Confirmar y pagar   0️⃣ Cancelar`
  );
}

export async function handleCheckoutConfirm(
  session: WhatsAppSession,
  input: string
): Promise<void> {
  const trimmed = input.trim();

  if (trimmed === '0') {
    await updateSessionState(session.phone, 'idle', session.context);
    const { showMainMenu } = await import('./menu.handler.js');
    await showMainMenu(session.phone);
    return;
  }

  if (trimmed !== '1') {
    await sendTextMessage(session.phone, 'Escribí 1 para confirmar o 0 para cancelar.');
    return;
  }

  if (!session.userId) {
    await sendTextMessage(session.phone, '❌ Error al procesar el pedido. Contactá al admin.');
    await updateSessionState(session.phone, 'idle', session.context);
    return;
  }

  // Recover stored IDs from context
  const addressId = session.context.productName!;  // address id stored here
  const carrierId = session.context.productId!;     // rate id stored here

  // Find the carrier from the rate
  const rate = await shippingRepository.findRateById(carrierId);
  if (!rate) {
    await sendTextMessage(session.phone, '❌ Error al procesar el pedido. Intentá de nuevo.');
    await updateSessionState(session.phone, 'idle', session.context);
    return;
  }

  try {
    const order = await orderDomain.createOrder(session.userId, {
      shipping_address_id: addressId,
      shipping_carrier_id: rate.carrier_id,
      payment_method: 'mercado_pago',
      items: session.context.cart.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity
      }))
    });

    const paymentLink = await createOrderPreference({
      orderNumber: order.order_number,
      items: session.context.cart.map((item) => ({
        title: item.productName,
        quantity: item.quantity,
        unit_price: item.unitPrice
      })),
      notificationUrl: env.MERCADOPAGO_NOTIFICATION_URL
    });

    const emptyContext: SessionContext = { ...session.context, cart: [], productId: undefined, productName: undefined, unitPrice: undefined, categoryId: undefined };
    await updateSessionState(session.phone, 'idle', emptyContext);

    await sendTextMessage(
      session.phone,
      `✅ Pedido creado: *${order.order_number}*\n\n💳 Pagá acá:\n${paymentLink}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    await sendTextMessage(
      session.phone,
      `❌ No pudimos crear el pedido: ${message}\n\nIntentá de nuevo o contactá al admin.`
    );
    await updateSessionState(session.phone, 'idle', session.context);
  }
}
