/**
 * Services Adapter
 * Exports the appropriate service implementation (mock or real) based on configuration
 */

import { config } from '@/lib/config';

// Real API services
import * as realProductService from '@/lib/services/products.service';
import * as realCategoryService from '@/lib/services/categories.service';
import * as realCartService from '@/lib/services/cart.service';
import * as realAuthService from '@/lib/services/auth.service';

// Mock services
import {
  fake_getProducts,
  fake_getProductById,
  fake_getProductBySlug,
  fake_getCategories,
  fake_getCategoryBySlug,
  fake_getCart,
  fake_addToCart,
  fake_updateCartItem,
  fake_removeFromCart,
  fake_clearCart,
  fake_login,
  fake_register,
  fake_logout,
  fake_getCurrentSession,
  fake_getBrands,
  fake_getBrandBySlug,
  fake_getShippingZones,
  fake_createOrder,
  fake_getAllOrders,
  fake_getOrderById
} from '@/lib/mock/services';

/**
 * Product Service
 */
export const productService = config.USE_MOCK_SERVICES
  ? {
      getProducts: fake_getProducts,
      getProductById: fake_getProductById,
      getProductBySlug: fake_getProductBySlug
    }
  : realProductService;

/**
 * Category Service
 */
export const categoryService = config.USE_MOCK_SERVICES
  ? {
      getCategories: fake_getCategories,
      getCategoryBySlug: fake_getCategoryBySlug
    }
  : realCategoryService;

/**
 * Cart Service
 */
export const cartService = config.USE_MOCK_SERVICES
  ? {
      getCart: fake_getCart,
      addToCart: fake_addToCart,
      updateCartItem: fake_updateCartItem,
      removeFromCart: fake_removeFromCart,
      clearCart: fake_clearCart
    }
  : realCartService;

/**
 * Auth Service
 */
export const authService = config.USE_MOCK_SERVICES
  ? {
      login: fake_login,
      register: fake_register,
      logout: fake_logout,
      getCurrentSession: fake_getCurrentSession
    }
  : realAuthService;

/**
 * Brand Service (mock only for now)
 */
export const brandService = {
  getBrands: fake_getBrands,
  getBrandBySlug: fake_getBrandBySlug
};

/**
 * Shipping Service (mock only for now)
 */
export const shippingService = {
  getShippingZones: fake_getShippingZones
};

/**
 * Order Service (mock only for now)
 */
export const orderService = {
  createOrder: fake_createOrder,
  getAllOrders: fake_getAllOrders,
  getOrderById: fake_getOrderById
};

// Log which services are being used
if (config.DEBUG) {
  console.log(
    `📦 Services Mode: ${config.USE_MOCK_SERVICES ? '🎭 MOCK (localStorage)' : '🌐 REAL API (${config.API_URL})'}`
  );
}
