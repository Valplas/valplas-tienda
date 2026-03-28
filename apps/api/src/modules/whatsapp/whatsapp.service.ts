import { query } from '../../infrastructure/database/client.js';
import {
  findSessionByPhone,
  upsertSession,
  updateSessionState
} from './session.repository.js';
import { sendTextMessage } from './whatsapp.client.js';
import { handleRegistration, handleAwaitingName } from './handlers/registration.handler.js';
import { showMainMenu, handleMenuInput } from './handlers/menu.handler.js';
import {
  showCategoryList,
  handleCatalogMenu,
  handleCatalogSearch,
  handleCatalogResults,
  handleAwaitingQuantity
} from './handlers/catalog.handler.js';
import { showCart, handleCartInput } from './handlers/cart.handler.js';
import { startCheckout, handleCheckoutConfirm } from './handlers/checkout.handler.js';
import type { WhatsAppMessage } from './whatsapp.types.js';

/**
 * Procesa un mensaje entrante: busca o crea sesión, despacha al handler correcto.
 */
export async function processMessage(message: WhatsAppMessage): Promise<void> {
  const phone = message.from;
  const body = message.text?.body?.trim() ?? '';
  const messageId = message.id;

  // 1. Buscar sesión existente
  let session = await findSessionByPhone(phone);

  // 2. Idempotencia: ignorar si ya procesamos este mensaje
  if (session?.lastMessageId === messageId) return;

  // 3. Si no hay sesión o expiró → registro
  if (!session || session.expiresAt < new Date()) {
    // Verificar si ya existe usuario con ese teléfono
    const existing = await query<{ id: string }>(
      `SELECT id FROM users WHERE phone = $1 AND deleted_at IS NULL LIMIT 1`,
      [phone]
    );

    if (existing.rows.length > 0) {
      // Usuario conocido, crear sesión idle
      const userId = existing.rows[0].id;
      session = await upsertSession(phone, 'idle', { cart: [] }, userId);
      await updateSessionState(phone, 'idle', { cart: [] }, messageId);
      await showMainMenu(phone);
    } else {
      // Nuevo usuario → iniciar registro
      await handleRegistration(phone);
      if (session) {
        await updateSessionState(phone, 'awaiting_name', { cart: [] }, messageId);
      }
    }
    return;
  }

  // 4. Actualizar last_message_id para idempotencia
  await updateSessionState(phone, session.state, session.context, messageId);

  // 5. Despachar según estado
  switch (session.state) {
    case 'awaiting_name':
      await handleAwaitingName(session, body);
      break;

    case 'idle':
      await handleMenuInput(session, body);
      break;

    case 'catalog_menu':
      await handleCatalogMenu(session, body);
      break;

    case 'catalog_search':
      await handleCatalogSearch(session, body);
      break;

    case 'catalog_results':
    case 'awaiting_quantity':
      if (session.state === 'catalog_results') {
        // Check if user is picking a product or navigating
        const trimmed = body.trim().toLowerCase();
        const isNav = ['s', 'a', 'n', '0'].includes(trimmed);
        if (!isNav && !isNaN(parseInt(trimmed))) {
          await handleCatalogResults(session, body);
        } else {
          await handleCatalogResults(session, body);
        }
      } else {
        await handleAwaitingQuantity(session, body);
      }
      break;

    case 'cart_view':
      await handleCartInput(session, body);
      break;

    case 'checkout_confirm':
      await handleCheckoutConfirm(session, body);
      break;

    default:
      await updateSessionState(phone, 'idle', session.context);
      await sendTextMessage(phone, 'Hubo un error. Volvemos al menú principal.');
      await showMainMenu(phone);
  }
}
