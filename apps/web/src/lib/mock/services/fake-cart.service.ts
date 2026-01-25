/**
 * Fake Cart Service - Carrito de compras mock
 * Simula operaciones de carrito con localStorage
 */

import { ApiResponse } from '@/lib/api';
import { Cart, CartItem } from '@/types';
import { fakeFetch } from '../utils/fake-fetch';
import { getOrInit, setItem, removeItem } from '../utils/local-storage';
import { fake_getProductById } from './fake-product.service';

const STORAGE_KEY = 'cart';
const STORAGE_KEY_GUEST = 'cart_guest';

/**
 * Obtiene la key correcta según autenticación
 */
function getCartKey(userId?: string): string {
  return userId ? `${STORAGE_KEY}_${userId}` : STORAGE_KEY_GUEST;
}

/**
 * Inicializa carrito vacío
 */
function initCart(userId?: string): Cart {
  const emptyCart: Cart = {
    items: [],
    subtotal: 0,
    shipping_cost: 0,
    total: 0,
    updated_at: new Date().toISOString()
  };
  return getOrInit(getCartKey(userId), emptyCart);
}

/**
 * Calcula totales del carrito
 */
async function calculateTotals(items: CartItem[]): Promise<{
  subtotal: number;
  shipping_cost: number;
  total: number;
}> {
  let subtotal = 0;

  // Calcular subtotal usando final_price de cada producto
  for (const item of items) {
    const productResponse = await fake_getProductById(item.product_id);
    if (productResponse.success && productResponse.data) {
      subtotal += productResponse.data.final_price * item.quantity;
    }
  }

  // En MVP, shipping_cost se calcula en checkout
  // Aquí lo dejamos en 0
  const shipping_cost = 0;
  const total = subtotal + shipping_cost;

  return { subtotal, shipping_cost, total };
}

/**
 * Guarda carrito en localStorage
 */
async function saveCart(items: CartItem[], userId?: string): Promise<Cart> {
  const totals = await calculateTotals(items);

  const cart: Cart = {
    items,
    ...totals,
    updated_at: new Date().toISOString()
  };

  setItem(getCartKey(userId), cart);
  return cart;
}

/**
 * Obtener carrito actual
 */
export async function fake_getCart(userId?: string): Promise<ApiResponse<Cart>> {
  return fakeFetch(async () => {
    const cart = initCart(userId);

    // Enriquecer items con datos de productos
    const enrichedItems: CartItem[] = [];
    for (const item of cart.items) {
      const productResponse = await fake_getProductById(item.product_id);
      if (productResponse.success && productResponse.data) {
        enrichedItems.push({
          ...item,
          product: productResponse.data
        });
      }
    }

    // Recalcular totales
    const totals = await calculateTotals(cart.items);

    return {
      success: true,
      data: {
        items: enrichedItems,
        ...totals,
        updated_at: cart.updated_at
      }
    };
  });
}

/**
 * Agregar producto al carrito
 */
export async function fake_addToCart(
  productId: string,
  quantity: number,
  userId?: string
): Promise<ApiResponse<Cart>> {
  return fakeFetch(async () => {
    // Verificar que el producto existe y está activo
    const productResponse = await fake_getProductById(productId);
    if (!productResponse.success || !productResponse.data) {
      return {
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: 'Producto no encontrado'
        }
      };
    }

    const product = productResponse.data;

    if (!product.is_active) {
      return {
        success: false,
        error: {
          code: 'PRODUCT_NOT_ACTIVE',
          message: 'El producto no está disponible'
        }
      };
    }

    // Verificar stock disponible
    const cart = initCart(userId);
    const existingItem = cart.items.find((i) => i.product_id === productId);
    const currentQuantity = existingItem ? existingItem.quantity : 0;
    const newQuantity = currentQuantity + quantity;

    if (newQuantity > product.available_stock) {
      return {
        success: false,
        error: {
          code: 'INSUFFICIENT_STOCK',
          message: `Stock insuficiente. Disponible: ${product.available_stock}`,
          details: {
            available: product.available_stock,
            requested: newQuantity
          }
        }
      };
    }

    // Actualizar o agregar item
    let items: CartItem[];
    if (existingItem) {
      items = cart.items.map((i) =>
        i.product_id === productId ? { ...i, quantity: newQuantity } : i
      );
    } else {
      items = [...cart.items, { product_id: productId, quantity }];
    }

    const updatedCart = await saveCart(items, userId);

    return {
      success: true,
      data: updatedCart
    };
  });
}

/**
 * Actualizar cantidad de un item
 */
export async function fake_updateCartItem(
  productId: string,
  quantity: number,
  userId?: string
): Promise<ApiResponse<Cart>> {
  return fakeFetch(async () => {
    const cart = initCart(userId);
    const itemIndex = cart.items.findIndex((i) => i.product_id === productId);

    if (itemIndex === -1) {
      return {
        success: false,
        error: {
          code: 'ITEM_NOT_FOUND',
          message: 'Producto no encontrado en el carrito'
        }
      };
    }

    // Si quantity es 0, eliminar item
    if (quantity === 0) {
      return fake_removeFromCart(productId, userId);
    }

    // Verificar stock
    const productResponse = await fake_getProductById(productId);
    if (!productResponse.success || !productResponse.data) {
      return {
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: 'Producto no encontrado'
        }
      };
    }

    const product = productResponse.data;
    if (quantity > product.available_stock) {
      return {
        success: false,
        error: {
          code: 'INSUFFICIENT_STOCK',
          message: `Stock insuficiente. Disponible: ${product.available_stock}`
        }
      };
    }

    // Actualizar cantidad
    const items = cart.items.map((i) => (i.product_id === productId ? { ...i, quantity } : i));

    const updatedCart = await saveCart(items, userId);

    return {
      success: true,
      data: updatedCart
    };
  });
}

/**
 * Eliminar producto del carrito
 */
export async function fake_removeFromCart(
  productId: string,
  userId?: string
): Promise<ApiResponse<Cart>> {
  return fakeFetch(async () => {
    const cart = initCart(userId);
    const items = cart.items.filter((i) => i.product_id !== productId);

    const updatedCart = await saveCart(items, userId);

    return {
      success: true,
      data: updatedCart
    };
  });
}

/**
 * Limpiar carrito
 */
export async function fake_clearCart(userId?: string): Promise<ApiResponse<void>> {
  return fakeFetch(() => {
    removeItem(getCartKey(userId));

    return {
      success: true
    };
  });
}

/**
 * Migrar carrito de guest a usuario autenticado
 */
export async function fake_migrateCart(userId: string): Promise<ApiResponse<Cart>> {
  return fakeFetch(async () => {
    const guestCart = initCart(); // Cart sin userId
    const userCart = initCart(userId);

    // Merge items
    const mergedItems = [...userCart.items];

    for (const guestItem of guestCart.items) {
      const existingIndex = mergedItems.findIndex((i) => i.product_id === guestItem.product_id);

      if (existingIndex !== -1) {
        // Sumar cantidades (verificar stock)
        const productResponse = await fake_getProductById(guestItem.product_id);
        if (productResponse.success && productResponse.data) {
          const product = productResponse.data;
          const newQuantity = mergedItems[existingIndex].quantity + guestItem.quantity;

          if (newQuantity <= product.available_stock) {
            mergedItems[existingIndex].quantity = newQuantity;
          } else {
            // Si excede stock, usar el máximo disponible
            mergedItems[existingIndex].quantity = product.available_stock;
          }
        }
      } else {
        // Agregar nuevo item
        mergedItems.push(guestItem);
      }
    }

    // Guardar carrito migrado
    const migratedCart = await saveCart(mergedItems, userId);

    // Limpiar carrito guest
    removeItem(STORAGE_KEY_GUEST);

    return {
      success: true,
      data: migratedCart
    };
  });
}
