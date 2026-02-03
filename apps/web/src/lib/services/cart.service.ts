// apps/web/src/lib/services/cart.service.ts

import { get, post, put, del } from '../api';

export interface CartItem {
  productId: string;
  quantity: number;
  product?: {
    id: string;
    name: string;
    slug: string;
    base_price: number;
    image_url: string | null;
    stock: number;
  };
}

export interface Cart {
  items: CartItem[];
  subtotal: number;
  total: number;
}

/**
 * Obtener carrito actual
 */
export async function getCart(): Promise<Cart> {
  const response = await get<Cart>('/cart');

  if (response.success && response.data) {
    return response.data;
  }

  throw new Error(response.error?.message || 'Error al obtener carrito');
}

/**
 * Agregar producto al carrito
 */
export async function addToCart(productId: string, quantity: number): Promise<Cart> {
  const response = await post<Cart>('/cart/items', { productId, quantity });

  if (response.success && response.data) {
    return response.data;
  }

  throw new Error(response.error?.message || 'Error al agregar al carrito');
}

/**
 * Actualizar cantidad de producto en carrito
 */
export async function updateCartItem(productId: string, quantity: number): Promise<Cart> {
  const response = await put<Cart>(`/cart/items/${productId}`, { quantity });

  if (response.success && response.data) {
    return response.data;
  }

  throw new Error(response.error?.message || 'Error al actualizar carrito');
}

/**
 * Eliminar producto del carrito
 */
export async function removeFromCart(productId: string): Promise<Cart> {
  const response = await del<Cart>(`/cart/items/${productId}`);

  if (response.success && response.data) {
    return response.data;
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
