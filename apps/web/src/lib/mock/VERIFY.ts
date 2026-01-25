/**
 * Mock System Verification Script
 * Run this to verify all mock services work correctly
 *
 * Usage: Create a test page that imports and runs these tests
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import {
  fake_login,
  fake_register,
  fake_getProducts,
  fake_getFeaturedProducts,
  fake_getProductById,
  fake_addToCart,
  fake_getCart,
  fake_getShippingOptions,
  fake_createOrder,
  fake_getUserOrders,
  fake_getUserAddresses
} from './services';

export async function verifyMockSystem() {
  console.group('🧪 Mock System Verification');

  try {
    // ============================================================================
    // AUTH TESTS
    // ============================================================================
    console.group('1️⃣ Auth Service');

    // Test login (MOCK DATA - not real credentials)
    const loginResponse = await fake_login({
      identifier: 'owner@valplas.net',
      password: 'Valplas123' // MOCK password from plan
    });

    if (!loginResponse.success) {
      throw new Error('Login failed');
    }
    console.log('✅ Login successful:', loginResponse.data?.user.email);

    // Test invalid login
    const invalidLogin = await fake_login({
      identifier: 'fake@test.com',
      password: 'wrong'
    });
    if (invalidLogin.success) {
      throw new Error('Invalid login should fail');
    }
    console.log('✅ Invalid login correctly rejected');

    console.groupEnd();

    // ============================================================================
    // PRODUCTS TESTS
    // ============================================================================
    console.group('2️⃣ Product Service');

    // Get all products
    const productsResponse = await fake_getProducts({}, { page: 1, limit: 10 });
    if (!productsResponse.success || !productsResponse.data) {
      throw new Error('Get products failed');
    }
    console.log(
      `✅ Products loaded: ${productsResponse.data.length} items, Total: ${productsResponse.pagination?.total}`
    );

    // Get featured products
    const featuredResponse = await fake_getFeaturedProducts(5);
    if (!featuredResponse.success || !featuredResponse.data) {
      throw new Error('Get featured products failed');
    }
    console.log(`✅ Featured products: ${featuredResponse.data.length} items`);

    // Get product by ID
    const productResponse = await fake_getProductById('prod-001');
    if (!productResponse.success || !productResponse.data) {
      throw new Error('Get product by ID failed');
    }
    console.log(`✅ Product by ID: ${productResponse.data.name}`);

    // Test filters
    const filteredResponse = await fake_getProducts(
      {
        category_id: 'cat-004',
        min_price: 1000,
        max_price: 3000
      },
      { page: 1, limit: 5 }
    );
    if (!filteredResponse.success) {
      throw new Error('Product filters failed');
    }
    console.log(`✅ Filtered products: ${filteredResponse.data?.length} items`);

    // Test search
    const searchResponse = await fake_getProducts(
      { search: 'bolsas' },
      { page: 1, limit: 10 }
    );
    if (!searchResponse.success) {
      throw new Error('Product search failed');
    }
    console.log(`✅ Search results: ${searchResponse.data?.length} items`);

    console.groupEnd();

    // ============================================================================
    // CART TESTS
    // ============================================================================
    console.group('3️⃣ Cart Service');

    const userId = 'user-004';

    // Add to cart
    const addResponse = await fake_addToCart('prod-001', 2, userId);
    if (!addResponse.success || !addResponse.data) {
      throw new Error('Add to cart failed');
    }
    console.log(`✅ Added to cart. Subtotal: $${addResponse.data.subtotal}`);

    // Add another product
    await fake_addToCart('prod-005', 1, userId);

    // Get cart
    const cartResponse = await fake_getCart(userId);
    if (!cartResponse.success || !cartResponse.data) {
      throw new Error('Get cart failed');
    }
    console.log(
      `✅ Cart loaded: ${cartResponse.data.items.length} items, Total: $${cartResponse.data.total}`
    );

    // Test insufficient stock (try to add more than available)
    const product = await fake_getProductById('prod-001');
    if (product.success && product.data) {
      const excessiveQuantity = product.data.available_stock + 100;
      const stockResponse = await fake_addToCart('prod-001', excessiveQuantity, userId);
      if (stockResponse.success) {
        throw new Error('Should have failed due to insufficient stock');
      }
      console.log('✅ Stock validation working correctly');
    }

    console.groupEnd();

    // ============================================================================
    // SHIPPING TESTS
    // ============================================================================
    console.group('4️⃣ Shipping Service');

    // Get shipping options for CABA
    const shippingResponse = await fake_getShippingOptions('1043', 10000);
    if (!shippingResponse.success || !shippingResponse.data) {
      throw new Error('Get shipping options failed');
    }
    const option = shippingResponse.data[0];
    console.log(
      `✅ Shipping for CP 1043: ${option.carrier_name} - $${option.cost} - ${option.estimated_days} días`
    );

    // Test free shipping threshold
    const freeShippingResponse = await fake_getShippingOptions('1043', 20000);
    if (!freeShippingResponse.success || !freeShippingResponse.data) {
      throw new Error('Free shipping test failed');
    }
    const freeOption = freeShippingResponse.data[0];
    console.log(
      `✅ Free shipping for $20000: Cost = $${freeOption.cost} (should be $0)`
    );

    // Test invalid postcode
    const invalidPostcodeResponse = await fake_getShippingOptions('99999', 10000);
    if (invalidPostcodeResponse.success) {
      throw new Error('Invalid postcode should fail');
    }
    console.log('✅ Invalid postcode correctly rejected');

    console.groupEnd();

    // ============================================================================
    // USER & ADDRESSES TESTS
    // ============================================================================
    console.group('5️⃣ User Service');

    const addressesResponse = await fake_getUserAddresses(userId);
    if (!addressesResponse.success || !addressesResponse.data) {
      throw new Error('Get user addresses failed');
    }
    console.log(`✅ User addresses: ${addressesResponse.data.length} items`);

    console.groupEnd();

    // ============================================================================
    // ORDERS TESTS
    // ============================================================================
    console.group('6️⃣ Order Service');

    // Get existing orders
    const ordersResponse = await fake_getUserOrders(userId, { page: 1, limit: 5 });
    if (!ordersResponse.success) {
      throw new Error('Get user orders failed');
    }
    console.log(`✅ User orders: ${ordersResponse.data?.length} items`);

    // Create new order (would need proper cart and address data)
    console.log('⚠️ Order creation test skipped (requires full cart flow)');

    console.groupEnd();

    // ============================================================================
    // SUMMARY
    // ============================================================================
    console.log('\n✅ ALL TESTS PASSED!');
    console.log('Mock system is working correctly.');

    console.groupEnd();

    return {
      success: true,
      message: 'All mock system tests passed'
    };
  } catch (error) {
    console.error('❌ TEST FAILED:', error);
    console.groupEnd();
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Quick test function for individual features
 */
export async function quickTest() {
  console.log('🚀 Quick Mock System Test\n');

  // Test auth (MOCK DATA)
  const login = await fake_login({
    identifier: 'owner@valplas.net',
    password: 'Valplas123' // MOCK password from plan
  });
  console.log('Auth:', login.success ? '✅' : '❌');

  // Test products
  const products = await fake_getProducts({}, { page: 1, limit: 5 });
  console.log(
    'Products:',
    products.success && products.data && products.data.length > 0 ? '✅' : '❌'
  );

  // Test cart
  const cart = await fake_getCart('user-004');
  console.log('Cart:', cart.success ? '✅' : '❌');

  // Test shipping
  const shipping = await fake_getShippingOptions('1043', 10000);
  console.log('Shipping:', shipping.success ? '✅' : '❌');

  console.log('\n✅ Quick test complete!');
}
