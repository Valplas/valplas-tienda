/**
 * Cart Types - Frontend Extensions
 * Base types in index.ts, these are UI-specific extensions
 */

import { Cart } from './index';

export interface CartState extends Omit<Cart, 'shippingCost' | 'total'> {
  isOpen: boolean; // Drawer state
  isLoading: boolean;
  itemCount: number; // Computed
}

export interface CartActions {
  addItem: (productId: string, quantity?: number, priceListId?: string) => Promise<void>;
  updateQuantity: (productId: string, quantity: number) => Promise<void>;
  removeItem: (productId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  toggleCart: () => void;
  syncWithServer: (userId: string) => Promise<void>;
  loadFromStorage: (userId?: string) => Promise<void>;
  setLoading: (loading: boolean) => void;
}
