import * as categoryRepository from '../../categories/category.repository.js';
import * as catalogRepository from '../../catalog/catalog.repository.js';
import { sendTextMessage } from '../whatsapp.client.js';
import { updateSessionState } from '../session.repository.js';
import type { WhatsAppSession, SessionContext } from '../whatsapp.types.js';
import { showMainMenu } from './menu.handler.js';

const PAGE_SIZE = 8;

function formatPrice(n: number): string {
  return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export async function showCategoryList(phone: string): Promise<void> {
  const categories = await categoryRepository.findAllCategories();
  const active = categories.filter((c) => c.is_active);

  if (active.length === 0) {
    await sendTextMessage(phone, 'No hay categorías disponibles en este momento.');
    return;
  }

  const lines = active.map((c, i) => `${i + 1}️⃣ ${c.name}`);
  await sendTextMessage(
    phone,
    `📦 *Elegí una categoría:*\n\n${lines.join('\n')}\n\n0️⃣ Volver al menú`
  );
}

export async function handleCatalogMenu(
  session: WhatsAppSession,
  input: string
): Promise<void> {
  if (input.trim() === '0') {
    await updateSessionState(session.phone, 'idle', session.context);
    await showMainMenu(session.phone);
    return;
  }

  const idx = parseInt(input.trim()) - 1;
  const categories = await categoryRepository.findAllCategories();
  const active = categories.filter((c) => c.is_active);

  if (isNaN(idx) || idx < 0 || idx >= active.length) {
    await sendTextMessage(session.phone, 'Opción inválida. Elegí un número de la lista.');
    await showCategoryList(session.phone);
    return;
  }

  const category = active[idx];
  const newContext: SessionContext = { ...session.context, categoryId: category.id };
  await updateSessionState(session.phone, 'catalog_search', newContext);
  await sendTextMessage(
    session.phone,
    `🔍 *${category.name}*\n\n¿Qué producto buscás? Escribí el nombre o código.`
  );
}

export async function handleCatalogSearch(
  session: WhatsAppSession,
  input: string
): Promise<void> {
  if (input.trim() === '0') {
    await updateSessionState(session.phone, 'catalog_menu', {
      ...session.context,
      categoryId: undefined
    });
    await showCategoryList(session.phone);
    return;
  }

  const query = input.trim();
  const newContext: SessionContext = { ...session.context, query, page: 1 };

  const { products, total } = await catalogRepository.findPublicProducts({
    search: query,
    category_id: session.context.categoryId,
    page: 1,
    limit: PAGE_SIZE
  });

  if (products.length === 0) {
    await sendTextMessage(
      session.phone,
      `No encontré productos para "${query}".\n\nProbá con otro término o escribí 0 para volver.`
    );
    return;
  }

  newContext.total = total;
  await updateSessionState(session.phone, 'catalog_results', newContext);
  await sendProductList(session.phone, products, 1, total);
}

export async function handleCatalogResults(
  session: WhatsAppSession,
  input: string
): Promise<void> {
  const trimmed = input.trim().toLowerCase();

  if (trimmed === '0') {
    await updateSessionState(session.phone, 'idle', session.context);
    await showMainMenu(session.phone);
    return;
  }

  if (trimmed === 'n') {
    // Nueva búsqueda
    await updateSessionState(session.phone, 'catalog_search', {
      ...session.context,
      query: undefined,
      page: undefined,
      total: undefined
    });
    await sendTextMessage(session.phone, '🔍 ¿Qué producto buscás? Escribí el nombre o código.');
    return;
  }

  const currentPage = session.context.page ?? 1;
  const total = session.context.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (trimmed === 's' && currentPage < totalPages) {
    const nextPage = currentPage + 1;
    const { products } = await catalogRepository.findPublicProducts({
      search: session.context.query,
      category_id: session.context.categoryId,
      page: nextPage,
      limit: PAGE_SIZE
    });
    await updateSessionState(session.phone, 'catalog_results', {
      ...session.context,
      page: nextPage
    });
    await sendProductList(session.phone, products, nextPage, total);
    return;
  }

  if (trimmed === 'a' && currentPage > 1) {
    const prevPage = currentPage - 1;
    const { products } = await catalogRepository.findPublicProducts({
      search: session.context.query,
      category_id: session.context.categoryId,
      page: prevPage,
      limit: PAGE_SIZE
    });
    await updateSessionState(session.phone, 'catalog_results', {
      ...session.context,
      page: prevPage
    });
    await sendProductList(session.phone, products, prevPage, total);
    return;
  }

  // Seleccionar producto por número
  const idx = parseInt(trimmed) - 1;
  const { products } = await catalogRepository.findPublicProducts({
    search: session.context.query,
    category_id: session.context.categoryId,
    page: currentPage,
    limit: PAGE_SIZE
  });

  if (isNaN(idx) || idx < 0 || idx >= products.length) {
    await sendTextMessage(session.phone, 'Opción inválida. Elegí un número de la lista.');
    return;
  }

  const product = products[idx];
  const unitPrice =
    product.tiers && product.tiers.length > 0 ? product.tiers[0].unit_price : product.base_price;

  const newContext: SessionContext = {
    ...session.context,
    productId: product.id,
    productName: product.name,
    unitPrice
  };
  await updateSessionState(session.phone, 'awaiting_quantity', newContext);
  await sendTextMessage(
    session.phone,
    `*${product.name}*\nPrecio: ${formatPrice(unitPrice)}/u\nStock: ${product.available_stock}\n\n¿Cuántas unidades querés agregar?`
  );
}

async function sendProductList(
  phone: string,
  products: catalogRepository.PublicProduct[],
  page: number,
  total: number
): Promise<void> {
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const lines = products.map((p, i) => {
    const price =
      p.tiers && p.tiers.length > 0 ? p.tiers[0].unit_price : p.base_price;
    return `${i + 1}️⃣ ${p.name} - ${formatPrice(price)} (stock: ${p.available_stock})`;
  });

  const nav: string[] = [];
  if (page < totalPages) nav.push('➡️ s = siguiente');
  if (page > 1) nav.push('⬅️ a = anterior');
  nav.push('🔍 n = nueva búsqueda');
  nav.push('🏠 0 = menú');

  await sendTextMessage(
    phone,
    `Encontré ${total} producto(s) — página ${page}/${totalPages}:\n\n${lines.join('\n')}\n\n${nav.join('   ')}`
  );
}

export async function handleAwaitingQuantity(
  session: WhatsAppSession,
  input: string
): Promise<void> {
  const qty = parseInt(input.trim());

  if (isNaN(qty) || qty <= 0) {
    await sendTextMessage(session.phone, 'Ingresá un número válido mayor a 0.');
    return;
  }

  if (!session.context.productId || !session.context.productName || session.context.unitPrice === undefined) {
    await sendTextMessage(session.phone, 'Ocurrió un error. Volvé al menú e intentá de nuevo.');
    await updateSessionState(session.phone, 'idle', session.context);
    return;
  }

  // Agregar al carrito o actualizar si ya existe
  const existingIdx = session.context.cart.findIndex(
    (item) => item.productId === session.context.productId
  );

  const updatedCart = [...session.context.cart];
  if (existingIdx >= 0) {
    updatedCart[existingIdx] = {
      ...updatedCart[existingIdx],
      quantity: updatedCart[existingIdx].quantity + qty
    };
  } else {
    updatedCart.push({
      productId: session.context.productId,
      productName: session.context.productName,
      unitPrice: session.context.unitPrice,
      quantity: qty
    });
  }

  const newContext: SessionContext = {
    ...session.context,
    cart: updatedCart,
    productId: undefined,
    productName: undefined,
    unitPrice: undefined
  };
  await updateSessionState(session.phone, 'catalog_results', newContext);

  await sendTextMessage(
    session.phone,
    `✅ Agregado al carrito.\n\n1️⃣ Seguir buscando   2️⃣ Ver carrito   0️⃣ Menú`
  );
}

export async function handlePostAdd(
  session: WhatsAppSession,
  input: string
): Promise<void> {
  const trimmed = input.trim();
  if (trimmed === '1') {
    // Volver a resultados (ya está en catalog_results)
    const { products } = await catalogRepository.findPublicProducts({
      search: session.context.query,
      category_id: session.context.categoryId,
      page: session.context.page ?? 1,
      limit: PAGE_SIZE
    });
    await sendProductList(
      session.phone,
      products,
      session.context.page ?? 1,
      session.context.total ?? products.length
    );
  } else if (trimmed === '2') {
    const { showCart } = await import('./cart.handler.js');
    await showCart(session);
  } else {
    await updateSessionState(session.phone, 'idle', session.context);
    const { showMainMenu } = await import('./menu.handler.js');
    await showMainMenu(session.phone);
  }
}
