// apps/api/src/tests/integration/purchase-flow.test.ts

import { describe, it, expect } from 'vitest';
import * as authService from '../../modules/auth/auth.service.js';
import * as addressDomain from '../../modules/addresses/address.domain.js';
import * as orderDomain from '../../modules/orders/order.domain.js';
import * as productRepository from '../../modules/products/product.repository.js';
import { query } from '../../infrastructure/database/client.js';

describe('Complete Purchase Flow (Integration)', () => {
  it('should complete full purchase: register → add address → create order → confirm payment', async () => {
    // 1. Register new customer
    const registerData = {
      email: 'integration@test.com',
      username: 'integration',
      password: 'Test1234',
      firstName: 'Integration',
      lastName: 'Test',
      phone: '+541199887766'
    };

    const user = await authService.register(registerData);
    expect(user).toBeDefined();
    expect(user.id).toBeDefined();
    expect(user.role).toBe('customer');

    // 2. Login
    const loginResult = await authService.login({
      emailOrUsername: registerData.email,
      password: registerData.password
    });

    expect(loginResult.accessToken).toBeDefined();
    expect(loginResult.refreshToken).toBeDefined();

    // 3. Create shipping address
    const addressData = {
      userId: user.id,
      street: 'Av. Corrientes',
      streetNumber: '1234',
      city: 'Buenos Aires',
      province: 'CABA',
      postcode: '1043'
    };

    const address = await addressDomain.create(addressData);
    expect(address).toBeDefined();
    expect(address.is_default).toBe(true); // First address should be default

    // 4. Get available products
    const products = await productRepository.findAll({
      filters: { inStock: true },
      pagination: { page: 1, limit: 10 }
    });

    expect(products.data.length).toBeGreaterThan(0);
    const product = products.data[0];

    // 5. Get initial stock
    const initialStock = await query(
      'SELECT stock, reserved_stock FROM products WHERE id = $1',
      [product.id]
    );

    // 6. Create order (simulating cart checkout)
    const orderData = {
      userId: user.id,
      items: [
        { productId: product.id, quantity: 2 }
      ],
      shippingAddressId: address.id,
      shippingCost: 15000 // $150 shipping
    };

    const order = await orderDomain.createOrder(orderData);

    expect(order).toBeDefined();
    expect(order.order_number).toMatch(/^VLP-\d{8}-\d{4}$/);
    expect(order.status).toBe('pending_payment');
    expect(order.user_id).toBe(user.id);

    // 7. Verify stock was reserved
    const afterOrder = await query(
      'SELECT stock, reserved_stock FROM products WHERE id = $1',
      [product.id]
    );

    expect(afterOrder.rows[0].stock).toBe(initialStock.rows[0].stock);
    expect(afterOrder.rows[0].reserved_stock).toBe(
      initialStock.rows[0].reserved_stock + 2
    );

    // 8. Verify order items snapshot
    const orderItems = await query(
      'SELECT * FROM order_items WHERE order_id = $1',
      [order.id]
    );

    expect(orderItems.rows.length).toBe(1);
    expect(orderItems.rows[0].product_name).toBe(product.name);
    expect(orderItems.rows[0].product_sku).toBe(product.sku);
    expect(orderItems.rows[0].quantity).toBe(2);

    // 9. Verify totals
    const expectedSubtotal = product.base_price * 2;
    const expectedTotal = expectedSubtotal + 15000;

    expect(order.subtotal).toBe(expectedSubtotal);
    expect(order.total).toBe(expectedTotal);

    // 10. Simulate payment confirmation (Mercado Pago webhook)
    await orderDomain.updateOrderStatus(order.id, 'payment_confirmed', {
      notes: 'Payment confirmed via MP webhook'
    });

    // 11. Verify stock was deducted
    const afterPayment = await query(
      'SELECT stock, reserved_stock FROM products WHERE id = $1',
      [product.id]
    );

    expect(afterPayment.rows[0].stock).toBe(initialStock.rows[0].stock - 2);
    expect(afterPayment.rows[0].reserved_stock).toBe(
      initialStock.rows[0].reserved_stock
    );

    // 12. Verify order status
    const finalOrder = await orderDomain.findById(order.id);
    expect(finalOrder?.status).toBe('payment_confirmed');

    // 13. Verify status history
    const history = await query(
      'SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY created_at',
      [order.id]
    );

    expect(history.rows.length).toBeGreaterThanOrEqual(1);
    expect(history.rows.some((h: any) => h.status === 'payment_confirmed')).toBe(true);

    // 14. Get user's orders
    const userOrders = await orderDomain.findAllByUser(user.id, { page: 1, limit: 10 });
    expect(userOrders.data.length).toBeGreaterThan(0);
    expect(userOrders.data[0].id).toBe(order.id);
  });

  it('should handle order cancellation correctly', async () => {
    // 1. Get existing user
    const userResult = await query(
      'SELECT id FROM users WHERE email = $1',
      ['cliente@test.com']
    );
    const userId = userResult.rows[0].id;

    // 2. Get product
    const productResult = await query(
      "SELECT id FROM products WHERE sku = 'MAG-001'"
    );
    const productId = productResult.rows[0].id;

    // 3. Create address
    const addressData = {
      userId,
      street: 'Test St',
      streetNumber: '456',
      city: 'Buenos Aires',
      province: 'Buenos Aires',
      postcode: '1000'
    };

    const address = await addressDomain.create(addressData);

    // 4. Get initial stock
    const initialStock = await query(
      'SELECT stock, reserved_stock FROM products WHERE id = $1',
      [productId]
    );

    // 5. Create order
    const orderData = {
      userId,
      items: [{ productId, quantity: 3 }],
      shippingAddressId: address.id,
      shippingCost: 20000
    };

    const order = await orderDomain.createOrder(orderData);

    // 6. Confirm payment
    await orderDomain.updateOrderStatus(order.id, 'payment_confirmed');

    const afterPayment = await query(
      'SELECT stock, reserved_stock FROM products WHERE id = $1',
      [productId]
    );

    // 7. Cancel order
    await orderDomain.cancelOrder(order.id, 'Customer changed mind');

    // 8. Verify stock was restored
    const afterCancel = await query(
      'SELECT stock, reserved_stock FROM products WHERE id = $1',
      [productId]
    );

    expect(afterCancel.rows[0].stock).toBe(afterPayment.rows[0].stock + 3);

    // 9. Verify order is cancelled
    const cancelledOrder = await orderDomain.findById(order.id);
    expect(cancelledOrder?.status).toBe('cancelled');
    expect(cancelledOrder?.cancelled_reason).toBe('Customer changed mind');
  });
});
