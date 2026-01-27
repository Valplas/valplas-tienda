/**
 * Cart Store - Zustand
 * Manages shopping cart state with localStorage sync
 */

import { create } from 'zustand';
import { CartState, CartActions } from '@/types/cart.types';
import {
  fake_getCart,
  fake_addToCart,
  fake_updateCartItem,
  fake_removeFromCart,
  fake_clearCart,
  fake_migrateCart
} from '@/lib/mock/services';

type CartStore = CartState & CartActions;

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
      // Get current user if authenticated (from authStore in real app)
      // For now, undefined = guest cart
      const response = await fake_addToCart(productId, quantity);

      if (response.success && response.data) {
        const cart = response.data;
        set({
          items: cart.items,
          subtotal: cart.subtotal,
          updated_at: cart.updated_at,
          itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
          isLoading: false
        });
      } else {
        setLoading(false);
        throw new Error(response.error?.message || 'Error al agregar producto');
      }
    } catch (error) {
      setLoading(false);
      throw error;
    }
  },

  updateQuantity: async (productId, quantity) => {
    const { setLoading } = get();
    setLoading(true);

    try {
      const response = await fake_updateCartItem(productId, quantity);

      if (response.success && response.data) {
        const cart = response.data;
        set({
          items: cart.items,
          subtotal: cart.subtotal,
          updated_at: cart.updated_at,
          itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
          isLoading: false
        });
      } else {
        setLoading(false);
        throw new Error(response.error?.message || 'Error al actualizar cantidad');
      }
    } catch (error) {
      setLoading(false);
      throw error;
    }
  },

  removeItem: async (productId) => {
    const { setLoading } = get();
    setLoading(true);

    try {
      const response = await fake_removeFromCart(productId);

      if (response.success && response.data) {
        const cart = response.data;
        set({
          items: cart.items,
          subtotal: cart.subtotal,
          updated_at: cart.updated_at,
          itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
          isLoading: false
        });
      } else {
        setLoading(false);
        throw new Error(response.error?.message || 'Error al eliminar producto');
      }
    } catch (error) {
      setLoading(false);
      throw error;
    }
  },

  clearCart: async () => {
    const { setLoading } = get();
    setLoading(true);

    try {
      await fake_clearCart();
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

  syncWithServer: async (userId) => {
    const { setLoading } = get();
    setLoading(true);

    try {
      // Migrate guest cart to authenticated user cart
      const response = await fake_migrateCart(userId);

      if (response.success && response.data) {
        const cart = response.data;
        set({
          items: cart.items,
          subtotal: cart.subtotal,
          updated_at: cart.updated_at,
          itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
          isLoading: false
        });
      } else {
        setLoading(false);
      }
    } catch (error) {
      setLoading(false);
      console.error('Error syncing cart:', error);
    }
  },

  loadFromStorage: async (userId) => {
    const { setLoading } = get();
    setLoading(true);

    try {
      const response = await fake_getCart(userId);

      if (response.success && response.data) {
        const cart = response.data;
        set({
          items: cart.items,
          subtotal: cart.subtotal,
          updated_at: cart.updated_at,
          itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
          isLoading: false
        });
      } else {
        setLoading(false);
      }
    } catch (error) {
      setLoading(false);
      console.error('Error loading cart:', error);
    }
  },

  setLoading: (loading) => {
    set({ isLoading: loading });
  }
}));
