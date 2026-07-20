// apps/web/src/lib/services/cart.service.ts

import { get, post, put, del } from '../api';

export interface CartItem {
  productId: string;
  quantity: number; // number of bundles
  priceListId?: string;
  name?: string;
  slug?: string;
  sku?: string;
  price?: number;
  imageUrl?: string | null;
  availableStock?: number;
  minQuantity?: number; // bundle size (1 if no tier)
  unitPrice?: number; // price per individual unit
  pricePerBundle?: number; // unitPrice × minQuantity
  subtotal?: number;
}

export interface Cart {
  items: CartItem[];
  subtotal: number;
  total: number;
}

/**
 * El backend envuelve el carrito en { cart, message }
 */
interface CartResponse {
  cart: Cart;
  message?: string;
}

/**
 * Obtener carrito actual
 */
export async function getCart(): Promise<Cart> {
  const response = await get<CartResponse>('/cart', { silentErrors: true });

  if (response.success && response.data) {
    return response.data.cart;
  }

  throw new Error(response.error?.message || 'Error al obtener carrito');
}

/**
 * Agregar producto al carrito
 */
export async function addToCart(
  productId: string,
  quantity: number,
  priceListId?: string
): Promise<Cart> {
  const response = await post<CartResponse>('/cart/items', { productId, quantity, priceListId });

  if (response.success && response.data) {
    return response.data.cart;
  }

  throw new Error(response.error?.message || 'Error al agregar al carrito');
}

/**
 * Actualizar cantidad de producto en carrito
 */
export async function updateCartItem(productId: string, quantity: number): Promise<Cart> {
  const response = await put<CartResponse>(`/cart/items/${productId}`, { quantity });

  if (response.success && response.data) {
    return response.data.cart;
  }

  throw new Error(response.error?.message || 'Error al actualizar carrito');
}

/**
 * Eliminar producto del carrito
 */
export async function removeFromCart(productId: string): Promise<Cart> {
  const response = await del<CartResponse>(`/cart/items/${productId}`);

  if (response.success && response.data) {
    return response.data.cart;
  }

  throw new Error(response.error?.message || 'Error al eliminar del carrito');
}

/**
 * Vaciar carrito
 */
export async function clearCart(): Promise<void> {
  const response = await del('/cart');

  if (!response.success) {
    throw new Error(response.error?.message || 'Error al vaciar carrito');
  }
}
