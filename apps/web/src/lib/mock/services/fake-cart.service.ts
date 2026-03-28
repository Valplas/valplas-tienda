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
    shippingCost: 0,
    total: 0,
    updatedAt: new Date().toISOString()
  };
  return getOrInit(getCartKey(userId), emptyCart);
}

/**
 * Calcula totales del carrito
 */
async function calculateTotals(items: CartItem[]): Promise<{
  subtotal: number;
  shippingCost: number;
  total: number;
}> {
  let subtotal = 0;

  // Calcular subtotal usando finalPrice de cada producto
  for (const item of items) {
    const productResponse = await fake_getProductById(item.productId);
    if (productResponse.success && productResponse.data) {
      subtotal += productResponse.data.finalPrice * item.quantity;
    }
  }

  // En MVP, shippingCost se calcula en checkout
  // Aquí lo dejamos en 0
  const shippingCost = 0;
  const total = subtotal + shippingCost;

  return { subtotal, shippingCost, total };
}

/**
 * Guarda carrito en localStorage
 */
async function saveCart(items: CartItem[], userId?: string): Promise<Cart> {
  const totals = await calculateTotals(items);

  const cart: Cart = {
    items,
    ...totals,
    updatedAt: new Date().toISOString()
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
      const productResponse = await fake_getProductById(item.productId);
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
        updatedAt: cart.updatedAt
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

    if (!product.isActive) {
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
    const existingItem = cart.items.find((i) => i.productId === productId);
    const currentQuantity = existingItem ? existingItem.quantity : 0;
    const newQuantity = currentQuantity + quantity;

    if (newQuantity > product.availableStock) {
      return {
        success: false,
        error: {
          code: 'INSUFFICIENT_STOCK',
          message: `Stock insuficiente. Disponible: ${product.availableStock}`,
          details: {
            available: product.availableStock,
            requested: newQuantity
          }
        }
      };
    }

    // Actualizar o agregar item
    let items: CartItem[];
    if (existingItem) {
      items = cart.items.map((i) =>
        i.productId === productId ? { ...i, quantity: newQuantity } : i
      );
    } else {
      items = [...cart.items, { productId, quantity }];
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
    const itemIndex = cart.items.findIndex((i) => i.productId === productId);

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
    if (quantity > product.availableStock) {
      return {
        success: false,
        error: {
          code: 'INSUFFICIENT_STOCK',
          message: `Stock insuficiente. Disponible: ${product.availableStock}`
        }
      };
    }

    // Actualizar cantidad
    const items = cart.items.map((i) => (i.productId === productId ? { ...i, quantity } : i));

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
    const items = cart.items.filter((i) => i.productId !== productId);

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
      const existingIndex = mergedItems.findIndex((i) => i.productId === guestItem.productId);

      if (existingIndex !== -1) {
        // Sumar cantidades (verificar stock)
        const productResponse = await fake_getProductById(guestItem.productId);
        if (productResponse.success && productResponse.data) {
          const product = productResponse.data;
          const newQuantity = mergedItems[existingIndex].quantity + guestItem.quantity;

          if (newQuantity <= product.availableStock) {
            mergedItems[existingIndex].quantity = newQuantity;
          } else {
            // Si excede stock, usar el máximo disponible
            mergedItems[existingIndex].quantity = product.availableStock;
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
