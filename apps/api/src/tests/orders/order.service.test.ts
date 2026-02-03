// apps/api/src/tests/orders/order.service.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import * as orderDomain from '../../modules/orders/order.domain.js';
import * as productRepository from '../../modules/products/product.repository.js';
import { query } from '../../infrastructure/database/client.js';

describe('Order Service', () => {
  let userId: string;
  let productId: string;
  let addressId: string;

  beforeEach(async () => {
    // Get test user
    const userResult = await query(
      'SELECT id FROM users WHERE email = $1 LIMIT 1',
      ['cliente@test.com']
    );
    userId = userResult.rows[0].id;

    // Get test product
    const productResult = await query(
      "SELECT id FROM products WHERE sku = 'MAG-001' LIMIT 1"
    );
    productId = productResult.rows[0].id;

    // Create test address
    const addressResult = await query(
      `INSERT INTO user_addresses (
        user_id, street, street_number, city, province, postcode, is_default
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id`,
      [userId, 'Av. Test', '123', 'Buenos Aires', 'Buenos Aires', '1000', true]
    );
    addressId = addressResult.rows[0].id;
  });

  describe('createOrder', () => {
    it('should create order and reserve stock', async () => {
      // Get initial stock
      const initialStock = await query(
        'SELECT stock, reserved_stock FROM products WHERE id = $1',
        [productId]
      );

      const orderData = {
        userId,
        items: [{ productId, quantity: 2 }],
        shippingAddressId: addressId,
        shippingCost: 15000
      };

      const order = await orderDomain.createOrder(orderData);

      expect(order).toBeDefined();
      expect(order.order_number).toMatch(/^VLP-\d{8}-\d{4}$/);
      expect(order.status).toBe('pending_payment');
      expect(order.user_id).toBe(userId);

      // Verify stock reservation
      const afterStock = await query(
        'SELECT stock, reserved_stock FROM products WHERE id = $1',
        [productId]
      );

      expect(afterStock.rows[0].stock).toBe(initialStock.rows[0].stock);
      expect(afterStock.rows[0].reserved_stock).toBe(
        initialStock.rows[0].reserved_stock + 2
      );
    });

    it('should reject order with insufficient stock', async () => {
      const orderData = {
        userId,
        items: [{ productId, quantity: 99999 }], // More than available
        shippingAddressId: addressId,
        shippingCost: 15000
      };

      await expect(orderDomain.createOrder(orderData)).rejects.toThrow();
    });

    it('should calculate totals correctly', async () => {
      const product = await productRepository.findById(productId);
      const quantity = 2;
      const shippingCost = 15000;
      const expectedSubtotal = product!.base_price * quantity;
      const expectedTotal = expectedSubtotal + shippingCost;

      const orderData = {
        userId,
        items: [{ productId, quantity }],
        shippingAddressId: addressId,
        shippingCost
      };

      const order = await orderDomain.createOrder(orderData);

      expect(order.subtotal).toBe(expectedSubtotal);
      expect(order.shipping_cost).toBe(shippingCost);
      expect(order.total).toBe(expectedTotal);
    });

    it('should snapshot shipping address correctly', async () => {
      const orderData = {
        userId,
        items: [{ productId, quantity: 1 }],
        shippingAddressId: addressId,
        shippingCost: 15000
      };

      const order = await orderDomain.createOrder(orderData);

      expect(order.shipping_street).toBe('Av. Test');
      expect(order.shipping_street_number).toBe('123');
      expect(order.shipping_city).toBe('Buenos Aires');
      expect(order.shipping_province).toBe('Buenos Aires');
      expect(order.shipping_postcode).toBe('1000');
    });

    it('should snapshot product info in order_items', async () => {
      const product = await productRepository.findById(productId);

      const orderData = {
        userId,
        items: [{ productId, quantity: 1 }],
        shippingAddressId: addressId,
        shippingCost: 15000
      };

      const order = await orderDomain.createOrder(orderData);

      // Get order items
      const items = await query(
        'SELECT * FROM order_items WHERE order_id = $1',
        [order.id]
      );

      expect(items.rows[0].product_name).toBe(product!.name);
      expect(items.rows[0].product_sku).toBe(product!.sku);
      expect(items.rows[0].unit_price).toBe(product!.base_price);
    });
  });

  describe('updateOrderStatus', () => {
    it('should transition to payment_confirmed and deduct stock', async () => {
      // Create order first
      const orderData = {
        userId,
        items: [{ productId, quantity: 2 }],
        shippingAddressId: addressId,
        shippingCost: 15000
      };

      const order = await orderDomain.createOrder(orderData);

      // Get stock after order creation
      const afterCreate = await query(
        'SELECT stock, reserved_stock FROM products WHERE id = $1',
        [productId]
      );

      // Update to payment_confirmed
      await orderDomain.updateOrderStatus(order.id, 'payment_confirmed');

      // Verify stock deduction
      const afterConfirm = await query(
        'SELECT stock, reserved_stock FROM products WHERE id = $1',
        [productId]
      );

      expect(afterConfirm.rows[0].stock).toBe(afterCreate.rows[0].stock - 2);
      expect(afterConfirm.rows[0].reserved_stock).toBe(
        afterCreate.rows[0].reserved_stock - 2
      );
    });

    it('should reject invalid status transition', async () => {
      const orderData = {
        userId,
        items: [{ productId, quantity: 1 }],
        shippingAddressId: addressId,
        shippingCost: 15000
      };

      const order = await orderDomain.createOrder(orderData);

      // Try invalid transition: pending_payment -> delivered (skipping steps)
      await expect(
        orderDomain.updateOrderStatus(order.id, 'delivered')
      ).rejects.toThrow();
    });

    it('should create status history entry', async () => {
      const orderData = {
        userId,
        items: [{ productId, quantity: 1 }],
        shippingAddressId: addressId,
        shippingCost: 15000
      };

      const order = await orderDomain.createOrder(orderData);

      await orderDomain.updateOrderStatus(order.id, 'payment_confirmed', {
        notes: 'Test payment confirmation'
      });

      const history = await query(
        'SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY created_at DESC',
        [order.id]
      );

      expect(history.rows.length).toBeGreaterThan(0);
      expect(history.rows[0].status).toBe('payment_confirmed');
      expect(history.rows[0].notes).toBe('Test payment confirmation');
    });
  });

  describe('cancelOrder', () => {
    it('should release reserved stock when cancelling pending order', async () => {
      const orderData = {
        userId,
        items: [{ productId, quantity: 2 }],
        shippingAddressId: addressId,
        shippingCost: 15000
      };

      const order = await orderDomain.createOrder(orderData);

      const afterCreate = await query(
        'SELECT stock, reserved_stock FROM products WHERE id = $1',
        [productId]
      );

      await orderDomain.cancelOrder(order.id, 'Customer request');

      const afterCancel = await query(
        'SELECT stock, reserved_stock FROM products WHERE id = $1',
        [productId]
      );

      // Stock should stay same, reserved_stock should decrease
      expect(afterCancel.rows[0].stock).toBe(afterCreate.rows[0].stock);
      expect(afterCancel.rows[0].reserved_stock).toBe(
        afterCreate.rows[0].reserved_stock - 2
      );
    });

    it('should restore stock when cancelling confirmed order', async () => {
      const orderData = {
        userId,
        items: [{ productId, quantity: 2 }],
        shippingAddressId: addressId,
        shippingCost: 15000
      };

      const order = await orderDomain.createOrder(orderData);
      await orderDomain.updateOrderStatus(order.id, 'payment_confirmed');

      const afterConfirm = await query(
        'SELECT stock, reserved_stock FROM products WHERE id = $1',
        [productId]
      );

      await orderDomain.cancelOrder(order.id, 'Customer request');

      const afterCancel = await query(
        'SELECT stock, reserved_stock FROM products WHERE id = $1',
        [productId]
      );

      // Stock should be restored
      expect(afterCancel.rows[0].stock).toBe(afterConfirm.rows[0].stock + 2);
      expect(afterCancel.rows[0].reserved_stock).toBe(
        afterConfirm.rows[0].reserved_stock
      );
    });

    it('should set cancelled_at and cancelled_reason', async () => {
      const orderData = {
        userId,
        items: [{ productId, quantity: 1 }],
        shippingAddressId: addressId,
        shippingCost: 15000
      };

      const order = await orderDomain.createOrder(orderData);
      const reason = 'Out of stock';

      await orderDomain.cancelOrder(order.id, reason);

      const result = await query(
        'SELECT cancelled_at, cancelled_reason FROM orders WHERE id = $1',
        [order.id]
      );

      expect(result.rows[0].cancelled_at).toBeDefined();
      expect(result.rows[0].cancelled_reason).toBe(reason);
    });
  });
});
