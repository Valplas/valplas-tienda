import type { Request, Response } from 'express';
import { AppError } from '../../shared/middleware/error.middleware.js';
import { env } from '../../env.js';
import { describeLineTier } from '../catalog/presentation.js';
import * as cartRepository from './cart.repository.js';
import type { TierInfo } from './cart.repository.js';
import type {
  Cart,
  CartItem,
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
 * Identidad de línea del carrito: (producto, presentación). Cada presentación es un tier
 * (lista de precios + tamaño de bulto); sin priceListId es la línea "a costo" del producto.
 */
type CartLineRef = Pick<CartItem, 'productId' | 'priceListId'>;

function isSameLine(a: CartLineRef, b: CartLineRef): boolean {
  return a.productId === b.productId && (a.priceListId ?? null) === (b.priceListId ?? null);
}

/**
 * Busca la línea pedida. Compatibilidad con clientes que no mandan priceListId: si no hay
 * match exacto y el producto tiene una sola línea, se usa esa.
 */
function findLineIndex(cart: Cart, productId: string, priceListId?: string): number {
  const exact = cart.items.findIndex((item) => isSameLine(item, { productId, priceListId }));
  if (exact !== -1 || priceListId) return exact;

  const productLines = cart.items.filter((item) => item.productId === productId);
  return productLines.length === 1 ? cart.items.indexOf(productLines[0]) : -1;
}

function tierKey(line: CartLineRef): string | null {
  return line.priceListId ? `${line.productId}:${line.priceListId}` : null;
}

/** Unidades por bulto de la línea (1 si no tiene tier o el tier ya no está activo). */
function bundleSizeOf(line: CartLineRef, tiersMap: Map<string, TierInfo>): number {
  const key = tierKey(line);
  return (key && tiersMap.get(key)?.minQuantity) || 1;
}

/** Tiers de todas las líneas con presentación del producto (+ extra), en un solo query. */
function getTiersForProductLines(
  cart: Cart,
  productId: string,
  extra?: CartLineRef
): Promise<Map<string, TierInfo>> {
  const lines = cart.items.filter((item) => item.productId === productId);
  if (extra)
    lines.push({ productId: extra.productId, quantity: 0, priceListId: extra.priceListId });
  const withTier = lines.filter(
    (line): line is CartItem & { priceListId: string } => !!line.priceListId
  );
  return cartRepository.getTiersForCartItems(
    withTier.map((line) => ({ productId: line.productId, priceListId: line.priceListId }))
  );
}

/** Unidades reales que ocupan las demás líneas del mismo producto. */
function unitsOfOtherLines(cart: Cart, line: CartLineRef, tiersMap: Map<string, TierInfo>): number {
  return cart.items
    .filter((item) => item.productId === line.productId && !isSameLine(item, line))
    .reduce((sum, item) => sum + item.quantity * bundleSizeOf(item, tiersMap), 0);
}

function insufficientStockError(availableUnits: number, bundleSize: number): AppError {
  const maxBundles = Math.max(0, Math.floor(availableUnits / bundleSize));
  return new AppError(
    'INSUFFICIENT_STOCK',
    `Stock insuficiente. Máximo de bultos disponibles: ${maxBundles}`,
    400
  );
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
  // Unidades que todavía quedan por producto: varias líneas (presentaciones) del mismo
  // producto comparten el stock y entre todas no pueden superarlo.
  const remainingStock = new Map<string, number>();

  for (const item of cart.items) {
    const product = productsMap.get(item.productId);
    if (!product) continue;

    const key = tierKey(item);
    const tier = key ? tiersMap.get(key) : null;

    const minQuantity = tier ? tier.minQuantity : 1;
    const unitPrice = tier ? tier.unitPrice : product.price;
    const pricePerBundle = Math.trunc(unitPrice * minQuantity * 100) / 100;

    // quantity = bultos; se recorta para que las unidades no superen el stock restante
    const remaining = remainingStock.get(product.id) ?? product.availableStock;
    const maxBundles = Math.max(0, Math.floor(remaining / minQuantity));
    const quantity = Math.min(item.quantity, maxBundles);

    if (quantity === 0) continue;
    remainingStock.set(product.id, remaining - quantity * minQuantity);

    const itemSubtotal = Math.trunc(pricePerBundle * quantity * 100) / 100;

    const presentation = describeLineTier(
      {
        label: product.unitLabel,
        contentQuantity: product.unitContentQuantity,
        contentLabel: product.unitContentLabel
      },
      {
        priceListId: item.priceListId ?? '',
        minQuantity,
        unitPrice,
        label: tier?.label ?? null
      }
    );

    itemsWithProduct.push({
      productId: product.id,
      quantity,
      priceListId: item.priceListId,
      name: product.name,
      slug: product.slug,
      sku: product.sku,
      price: product.price,
      imageUrl: product.imageUrl,
      availableStock: product.availableStock,
      minQuantity,
      unitPrice,
      pricePerBundle,
      subtotal: itemSubtotal,
      presentationLabel: presentation.label,
      presentationContains: presentation.contains
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

  const line: CartLineRef = { productId: data.productId, priceListId: data.priceListId };

  // Tiers de la presentación nueva y de las líneas que ya están (stock compartido)
  const tiersMap = await getTiersForProductLines(cart, data.productId, line);
  const lineKey = tierKey(line);
  if (lineKey && !tiersMap.has(lineKey)) {
    throw new AppError(
      'TIER_NOT_FOUND',
      'No existe un tier activo para este producto con la lista de precios indicada',
      400
    );
  }

  // Misma presentación → suma bultos; otra presentación → línea separada
  const existingItem = cart.items.find((item) => isSameLine(item, line));
  const newBundles = (existingItem?.quantity ?? 0) + data.quantity;

  // Stock en unidades reales: esta línea + las demás presentaciones del producto
  const bundleSize = bundleSizeOf(line, tiersMap);
  const availableForLine = product.availableStock - unitsOfOtherLines(cart, line, tiersMap);
  if (newBundles * bundleSize > availableForLine) {
    throw insufficientStockError(availableForLine, bundleSize);
  }

  if (existingItem) {
    existingItem.quantity = newBundles;
  } else {
    cart.items.push({
      productId: data.productId,
      quantity: data.quantity,
      ...(data.priceListId && { priceListId: data.priceListId })
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
  const itemIndex = findLineIndex(cart, productId, data.priceListId);

  if (itemIndex === -1) {
    throw new AppError('ITEM_NOT_FOUND', 'Producto no encontrado en el carrito', 404);
  }

  const item = cart.items[itemIndex];
  const [availableStock, tiersMap] = await Promise.all([
    cartRepository.getAvailableStock(productId),
    getTiersForProductLines(cart, productId)
  ]);

  // Stock en unidades reales: esta línea + las demás presentaciones del producto
  const bundleSize = bundleSizeOf(item, tiersMap);
  const availableForLine = availableStock - unitsOfOtherLines(cart, item, tiersMap);
  if (data.quantity * bundleSize > availableForLine) {
    throw insufficientStockError(availableForLine, bundleSize);
  }

  item.quantity = data.quantity;

  return { cart, updated: true };
}

/**
 * Eliminar una línea (producto + presentación) del carrito
 */
export function removeFromCart(
  cart: Cart,
  productId: string,
  priceListId?: string
): { cart: Cart; removed: boolean } {
  const itemIndex = findLineIndex(cart, productId, priceListId);

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
