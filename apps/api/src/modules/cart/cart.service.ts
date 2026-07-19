import type { Request, Response } from 'express';
import { AppError } from '../../shared/middleware/error.middleware.js';
import { env } from '../../env.js';
import * as cartRepository from './cart.repository.js';
import type {
  Cart,
  CartItemWithProduct,
  CartSummary,
  AddToCartData,
  UpdateCartItemData
} from './cart.types.js';

const CART_COOKIE_NAME = 'cart';
const CART_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 días

// Cross-site (frontend en Vercel, API en Railway): la cookie debe ir con
// SameSite=None; Secure o el browser no la reenvía en los fetch a la API y el
// carrito guest se "reinicia" en cada request. Misma lógica que las cookies de auth.
const USE_CROSS_SITE_COOKIES = env.IS_PRODUCTION || env.COOKIE_CROSS_SITE;
const CART_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: USE_CROSS_SITE_COOKIES,
  sameSite: (USE_CROSS_SITE_COOKIES ? 'none' : 'lax') as 'none' | 'lax',
  path: '/'
};

/**
 * Leer carrito desde cookie
 */
export function getCartFromCookie(req: Request): Cart {
  const cartCookie = req.cookies[CART_COOKIE_NAME];

  if (!cartCookie) {
    return { items: [] };
  }

  try {
    const cart = JSON.parse(cartCookie);
    if (!cart || !Array.isArray(cart.items)) {
      return { items: [] };
    }
    return cart;
  } catch {
    return { items: [] };
  }
}

/**
 * Guardar carrito en cookie
 */
export function saveCartToCookie(res: Response, cart: Cart): void {
  res.cookie(CART_COOKIE_NAME, JSON.stringify(cart), {
    ...CART_COOKIE_OPTIONS,
    maxAge: CART_COOKIE_MAX_AGE
  });
}

/**
 * Limpiar carrito (eliminar cookie)
 */
export function clearCartCookie(res: Response): void {
  res.clearCookie(CART_COOKIE_NAME, CART_COOKIE_OPTIONS);
}

/**
 * Obtener carrito con detalles de productos y tiers de precio
 */
export async function getCartWithDetails(cart: Cart): Promise<CartSummary> {
  if (cart.items.length === 0) {
    return {
      items: [],
      subtotal: 0,
      itemCount: 0,
      totalItems: 0
    };
  }

  const productIds = cart.items.map((item) => item.productId);
  const products = await cartRepository.getProductsForCart(productIds);
  const productsMap = new Map(products.map((p) => [p.id, p]));

  // Batch-fetch tier info for items that have a priceListId
  const tierItems = cart.items.filter(
    (item): item is typeof item & { priceListId: string } => !!item.priceListId
  );
  const tiersMap = await cartRepository.getTiersForCartItems(tierItems);

  const itemsWithProduct: CartItemWithProduct[] = [];
  let subtotal = 0;
  let itemCount = 0;

  for (const item of cart.items) {
    const product = productsMap.get(item.productId);
    if (!product) continue;

    const tierKey = item.priceListId ? `${item.productId}:${item.priceListId}` : null;
    const tier = tierKey ? tiersMap.get(tierKey) : null;

    const minQuantity = tier ? tier.minQuantity : 1;
    const unitPrice = tier ? tier.unitPrice : product.basePrice;
    const pricePerBundle = Math.trunc(unitPrice * minQuantity * 100) / 100;

    // quantity = bundles; cap bundles so total units don't exceed available stock
    const maxBundles =
      minQuantity > 0 ? Math.floor(product.availableStock / minQuantity) : product.availableStock;
    const quantity = Math.min(item.quantity, maxBundles);

    if (quantity === 0) continue;

    const itemSubtotal = Math.trunc(pricePerBundle * quantity * 100) / 100;

    itemsWithProduct.push({
      productId: product.id,
      quantity,
      priceListId: item.priceListId,
      name: product.name,
      slug: product.slug,
      sku: product.sku,
      basePrice: product.basePrice,
      imageUrl: product.imageUrl,
      availableStock: product.availableStock,
      minQuantity,
      unitPrice,
      pricePerBundle,
      subtotal: itemSubtotal
    });

    subtotal += itemSubtotal;
    itemCount += quantity;
  }

  subtotal = Math.trunc(subtotal * 100) / 100;

  return {
    items: itemsWithProduct,
    subtotal,
    itemCount,
    totalItems: itemsWithProduct.length
  };
}

/**
 * Agregar producto al carrito
 */
export async function addToCart(
  cart: Cart,
  data: AddToCartData
): Promise<{ cart: Cart; added: boolean; message?: string }> {
  const product = await cartRepository.getProductForCart(data.productId);

  if (!product) {
    throw new AppError('PRODUCT_NOT_FOUND', 'Producto no encontrado', 404);
  }

  // Resolve tier info if priceListId provided
  let minQuantity = 1;
  if (data.priceListId) {
    const tiersMap = await cartRepository.getTiersForCartItems([
      { productId: data.productId, priceListId: data.priceListId }
    ]);
    const tier = tiersMap.get(`${data.productId}:${data.priceListId}`);
    if (!tier) {
      throw new AppError(
        'TIER_NOT_FOUND',
        'No existe un tier activo para este producto con la lista de precios indicada',
        400
      );
    }
    minQuantity = tier.minQuantity;
  }

  // Stock check: total units after adding = (existing bundles + new bundles) × minQuantity
  const existingItem = cart.items.find((item) => item.productId === data.productId);
  const currentBundles = existingItem ? existingItem.quantity : 0;
  const newBundles = currentBundles + data.quantity;
  const requiredUnits = newBundles * minQuantity;

  if (requiredUnits > product.availableStock) {
    const maxBundles = Math.floor(product.availableStock / minQuantity);
    throw new AppError(
      'INSUFFICIENT_STOCK',
      `Stock insuficiente. Máximo de bultos disponibles: ${maxBundles}`,
      400
    );
  }

  // Add or update item (replace if priceListId changed)
  if (existingItem) {
    existingItem.quantity = newBundles;
    existingItem.priceListId = data.priceListId;
  } else {
    cart.items.push({
      productId: data.productId,
      quantity: data.quantity,
      priceListId: data.priceListId
    });
  }

  return { cart, added: true };
}

/**
 * Actualizar cantidad de producto en carrito
 */
export async function updateCartItem(
  cart: Cart,
  productId: string,
  data: UpdateCartItemData
): Promise<{ cart: Cart; updated: boolean }> {
  const itemIndex = cart.items.findIndex((item) => item.productId === productId);

  if (itemIndex === -1) {
    throw new AppError('ITEM_NOT_FOUND', 'Producto no encontrado en el carrito', 404);
  }

  const item = cart.items[itemIndex];
  const availableStock = await cartRepository.getAvailableStock(productId);

  // Resolve minQuantity if item has a tier
  let minQuantity = 1;
  if (item.priceListId) {
    const tiersMap = await cartRepository.getTiersForCartItems([
      { productId, priceListId: item.priceListId }
    ]);
    const tier = tiersMap.get(`${productId}:${item.priceListId}`);
    if (tier) minQuantity = tier.minQuantity;
  }

  const requiredUnits = data.quantity * minQuantity;
  if (requiredUnits > availableStock) {
    const maxBundles = Math.floor(availableStock / minQuantity);
    throw new AppError(
      'INSUFFICIENT_STOCK',
      `Stock insuficiente. Máximo de bultos disponibles: ${maxBundles}`,
      400
    );
  }

  cart.items[itemIndex].quantity = data.quantity;

  return { cart, updated: true };
}

/**
 * Eliminar producto del carrito
 */
export function removeFromCart(cart: Cart, productId: string): { cart: Cart; removed: boolean } {
  const itemIndex = cart.items.findIndex((item) => item.productId === productId);

  if (itemIndex === -1) {
    throw new AppError('ITEM_NOT_FOUND', 'Producto no encontrado en el carrito', 404);
  }

  cart.items.splice(itemIndex, 1);

  return { cart, removed: true };
}

/**
 * Vaciar carrito
 */
export function clearCart(): Cart {
  return { items: [] };
}

/**
 * Sincronizar carrito de guest a usuario autenticado
 * (En MVP, simplemente mantener el carrito actual en cookie)
 */
export async function syncCart(guestCart: Cart, _userId: string): Promise<Cart> {
  return guestCart;
}
