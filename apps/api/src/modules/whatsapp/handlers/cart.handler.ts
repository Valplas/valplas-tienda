import { sendTextMessage } from '../whatsapp.client.js';
import { updateSessionState } from '../session.repository.js';
import type { WhatsAppSession, SessionContext } from '../whatsapp.types.js';

function formatPrice(n: number): string {
  return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export async function showCart(session: WhatsAppSession): Promise<void> {
  const { cart } = session.context;
  await updateSessionState(session.phone, 'cart_view', session.context);

  if (!cart || cart.length === 0) {
    await sendTextMessage(
      session.phone,
      '🛒 Tu carrito está vacío.\n\n0️⃣ Volver al menú'
    );
    return;
  }

  const lines = cart.map(
    (item) =>
      `• ${item.productName} x${item.quantity} → ${formatPrice(item.unitPrice * item.quantity)}`
  );
  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  await sendTextMessage(
    session.phone,
    `🛒 *Tu carrito*\n\n${lines.join('\n')}\n\nSubtotal: ${formatPrice(subtotal)}\nEnvío: a calcular\n\n1️⃣ Confirmar pedido\n2️⃣ Vaciar carrito\n0️⃣ Volver al menú`
  );
}

export async function handleCartInput(
  session: WhatsAppSession,
  input: string
): Promise<void> {
  const trimmed = input.trim();

  if (trimmed === '0') {
    await updateSessionState(session.phone, 'idle', session.context);
    const { showMainMenu } = await import('./menu.handler.js');
    await showMainMenu(session.phone);
  } else if (trimmed === '1') {
    const { startCheckout } = await import('./checkout.handler.js');
    await startCheckout(session);
  } else if (trimmed === '2') {
    const emptyContext: SessionContext = { ...session.context, cart: [] };
    await updateSessionState(session.phone, 'idle', emptyContext);
    await sendTextMessage(session.phone, '🗑️ Carrito vaciado.');
    const { showMainMenu } = await import('./menu.handler.js');
    await showMainMenu(session.phone);
  } else {
    await sendTextMessage(session.phone, 'Opción inválida. Elegí 1, 2 o 0.');
    await showCart(session);
  }
}
