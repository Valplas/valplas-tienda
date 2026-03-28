import { sendTextMessage } from '../whatsapp.client.js';
import { updateSessionState } from '../session.repository.js';
import type { WhatsAppSession } from '../whatsapp.types.js';
import { env } from '../../../env.js';

export async function showMainMenu(phone: string): Promise<void> {
  await sendTextMessage(
    phone,
    '🛒 *Valplas Tienda*\n¿Qué querés hacer?\n\n1️⃣ Ver catálogo\n2️⃣ Mi carrito\n3️⃣ Finalizar pedido\n0️⃣ Hablar con un asesor'
  );
}

export async function handleMenuInput(
  session: WhatsAppSession,
  input: string
): Promise<void> {
  const choice = input.trim();

  if (choice === '1') {
    await updateSessionState(session.phone, 'catalog_menu', session.context);
    // catalog.handler will render the category list on the next pass
    // but we need to trigger it inline
    const { showCategoryList } = await import('./catalog.handler.js');
    await showCategoryList(session.phone);
  } else if (choice === '2') {
    const { showCart } = await import('./cart.handler.js');
    await showCart(session);
  } else if (choice === '3') {
    if (!session.context.cart || session.context.cart.length === 0) {
      await sendTextMessage(session.phone, '🛒 Tu carrito está vacío. Agregá productos primero.');
      await showMainMenu(session.phone);
    } else {
      const { startCheckout } = await import('./checkout.handler.js');
      await startCheckout(session);
    }
  } else if (choice === '0') {
    const adminNumber = env.ADMIN_WHATSAPP_NUMBER;
    if (adminNumber) {
      await sendTextMessage(
        session.phone,
        `📞 Te conectamos con un asesor. Escribile directamente a wa.me/${adminNumber.replace('+', '')}`
      );
    } else {
      await sendTextMessage(
        session.phone,
        '📞 Contactanos por teléfono para hablar con un asesor.'
      );
    }
    await updateSessionState(session.phone, 'idle', session.context);
  } else {
    await sendTextMessage(
      session.phone,
      'Opción inválida. Elegí una de las opciones del menú.'
    );
    await showMainMenu(session.phone);
  }
}
