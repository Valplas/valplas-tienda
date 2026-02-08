/**
 * Cart Store - Zustand
 * Manages shopping cart state
 */

import { create } from 'zustand';
import { CartState, CartActions } from '@/types/cart.types';
import { getCart, addToCart, updateCartItem, removeFromCart, clearCart } from '@/services';
import type { Cart as ServiceCart } from '@/services';

type CartStore = CartState & CartActions;

/**
 * Convierte el Cart del servicio al formato del frontend
 */
function mapServiceCartToFrontendCart(serviceCart: ServiceCart) {
  // Manejar caso donde items es undefined o null
  const items = serviceCart?.items || [];

  return {
    items: items.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      product: item.product as any // Type assertion: API devuelve partial Product
    })),
    subtotal: serviceCart?.subtotal || 0,
    updated_at: new Date().toISOString()
  };
}

export const useCartStore = create<CartStore>((set, get) => ({
  // State
  items: [],
  subtotal: 0,
  updated_at: new Date().toISOString(),
  isOpen: false,
  isLoading: false,
  itemCount: 0,

  // Actions
  addItem: async (productId, quantity = 1) => {
    const { setLoading } = get();
    setLoading(true);

    try {
      const serviceCart = await addToCart(productId, quantity);
      const cart = mapServiceCartToFrontendCart(serviceCart);

      set({
        items: cart.items,
        subtotal: cart.subtotal,
        updated_at: cart.updated_at,
        itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
        isLoading: false
      });
    } catch (error) {
      setLoading(false);
      throw error;
    }
  },

  updateQuantity: async (productId, quantity) => {
    const { setLoading } = get();
    setLoading(true);

    try {
      const serviceCart = await updateCartItem(productId, quantity);
      const cart = mapServiceCartToFrontendCart(serviceCart);

      set({
        items: cart.items,
        subtotal: cart.subtotal,
        updated_at: cart.updated_at,
        itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
        isLoading: false
      });
    } catch (error) {
      setLoading(false);
      throw error;
    }
  },

  removeItem: async (productId) => {
    const { setLoading } = get();
    setLoading(true);

    try {
      const serviceCart = await removeFromCart(productId);
      const cart = mapServiceCartToFrontendCart(serviceCart);

      set({
        items: cart.items,
        subtotal: cart.subtotal,
        updated_at: cart.updated_at,
        itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
        isLoading: false
      });
    } catch (error) {
      setLoading(false);
      throw error;
    }
  },

  clearCart: async () => {
    const { setLoading } = get();
    setLoading(true);

    try {
      await clearCart();
      set({
        items: [],
        subtotal: 0,
        updated_at: new Date().toISOString(),
        itemCount: 0,
        isLoading: false
      });
    } catch (error) {
      setLoading(false);
      throw error;
    }
  },

  toggleCart: () => {
    set((state) => ({ isOpen: !state.isOpen }));
  },

  syncWithServer: async () => {
    // En API real, el carrito ya está en el servidor
    // Solo necesitamos recargarlo
    const { loadFromStorage } = get();
    await loadFromStorage();
  },

  loadFromStorage: async () => {
    const { setLoading } = get();
    setLoading(true);

    try {
      const serviceCart = await getCart();
      const cart = mapServiceCartToFrontendCart(serviceCart);

      set({
        items: cart.items,
        subtotal: cart.subtotal,
        updated_at: cart.updated_at,
        itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
        isLoading: false
      });
    } catch (error) {
      setLoading(false);
      console.error('Error loading cart:', error);
      // Si falla (ej: no autenticado), dejar carrito vacío
      set({
        items: [],
        subtotal: 0,
        updated_at: new Date().toISOString(),
        itemCount: 0,
        isLoading: false
      });
    }
  },

  setLoading: (loading) => {
    set({ isLoading: loading });
  }
}));
