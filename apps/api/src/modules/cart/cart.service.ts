import type { Request, Response } from 'express';
import { AppError } from '../../shared/middleware/error.middleware.js';
import * as cartRepository from './cart.repository.js';
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
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: CART_COOKIE_MAX_AGE
  });
}

/**
 * Limpiar carrito (eliminar cookie)
 */
export function clearCartCookie(res: Response): void {
  res.clearCookie(CART_COOKIE_NAME);
}

/**
 * Obtener carrito con detalles de productos
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

  // Obtener productos
  const productIds = cart.items.map((item) => item.productId);
  const products = await cartRepository.getProductsForCart(productIds);

  // Crear mapa de productos para búsqueda rápida
  const productsMap = new Map(products.map((p) => [p.id, p]));

  // Combinar items con detalles de productos
  const itemsWithProduct: CartItemWithProduct[] = [];
  let subtotal = 0;
  let itemCount = 0;

  for (const item of cart.items) {
    const product = productsMap.get(item.productId);

    // Si el producto no existe o no está activo, omitir
    if (!product) {
      continue;
    }

    // Ajustar cantidad si excede stock disponible
    const quantity = Math.min(item.quantity, product.availableStock);

    // Si no hay stock, omitir
    if (quantity === 0) {
      continue;
    }

    const itemSubtotal = product.basePrice * quantity;

    itemsWithProduct.push({
      productId: product.id,
      quantity,
      name: product.name,
      slug: product.slug,
      sku: product.sku,
      basePrice: product.basePrice,
      imageUrl: product.imageUrl,
      availableStock: product.availableStock,
      subtotal: itemSubtotal
    });

    subtotal += itemSubtotal;
    itemCount += quantity;
  }

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
  // Verificar que el producto existe y obtener stock
  const product = await cartRepository.getProductForCart(data.productId);

  if (!product) {
    throw new AppError('PRODUCT_NOT_FOUND', 'Producto no encontrado', 404);
  }

  // Verificar stock disponible
  const existingItem = cart.items.find((item) => item.productId === data.productId);
  const currentQuantity = existingItem ? existingItem.quantity : 0;
  const newQuantity = currentQuantity + data.quantity;

  if (newQuantity > product.availableStock) {
    throw new AppError(
      'INSUFFICIENT_STOCK',
      `Stock insuficiente. Disponible: ${product.availableStock}`,
      400
    );
  }

  // Agregar o actualizar item
  if (existingItem) {
    existingItem.quantity = newQuantity;
  } else {
    cart.items.push({
      productId: data.productId,
      quantity: data.quantity
    });
  }

  return {
    cart,
    added: true
  };
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

  // Verificar stock disponible
  const availableStock = await cartRepository.getAvailableStock(productId);

  if (data.quantity > availableStock) {
    throw new AppError(
      'INSUFFICIENT_STOCK',
      `Stock insuficiente. Disponible: ${availableStock}`,
      400
    );
  }

  // Actualizar cantidad
  cart.items[itemIndex].quantity = data.quantity;

  return {
    cart,
    updated: true
  };
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

  return {
    cart,
    removed: true
  };
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
export async function syncCart(guestCart: Cart, userId: string): Promise<Cart> {
  // En MVP sin Redis/DB, simplemente retornar el carrito guest
  // En iteraciones futuras, aquí se haría merge con carrito persistido en DB/Redis
  return guestCart;
}
