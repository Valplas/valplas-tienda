// apps/api/src/tests/orders/order.service.test.ts
//
// Tests del dominio de órdenes contra la DB real (triggers de stock incluidos).
// Datos propios por test: usuario @vitest.local, dirección, carrier+zona+tarifa
// vitest-*. Producto: uno real del catálogo con stock disponible.
// payment_method 'manual' para no invocar a MercadoPago.

import { describe, it, expect, beforeEach } from 'vitest';
import * as orderDomain from '../../modules/orders/order.domain.js';
import {
  createTestUser,
  createTestAddress,
  createTestShipping,
  getTestProduct,
  getProductStock
} from '../helpers.js';
import { query } from '../../infrastructure/database/client.js';

const SHIPPING_PRICE = 1500;

describe('Order Service', () => {
  let userId: string;
  let addressId: string;
  let carrierId: string;
  let productId: string;
  let basePrice: number;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;

    const address = await createTestAddress(userId);
    addressId = address.id;

    const shipping = await createTestShipping(SHIPPING_PRICE);
    carrierId = shipping.carrierId;

    const product = await getTestProduct(10);
    productId = product.id;
    basePrice = product.base_price;
  });

  function orderInput(quantity: number) {
    return {
      shipping_address_id: addressId,
      shipping_carrier_id: carrierId,
      payment_method: 'manual',
      items: [{ product_id: productId, quantity }]
    };
  }

  describe('createOrder', () => {
    it('should create order and reserve stock', async () => {
      const initialStock = await getProductStock(productId);

      const { order } = await orderDomain.createOrder(userId, orderInput(2));

      expect(order.order_number).toMatch(/^VLP-\d{8}-\d{4,}$/);
      expect(order.status).toBe('pending_payment');
      expect(order.user_id).toBe(userId);

      const afterStock = await getProductStock(productId);
      expect(afterStock.stock).toBe(initialStock.stock);
      expect(afterStock.reserved_stock).toBe(initialStock.reserved_stock + 2);
    });

    it('should reject order with insufficient stock', async () => {
      await expect(orderDomain.createOrder(userId, orderInput(99999))).rejects.toThrow(
        /Stock insuficiente/
      );
    });

    it('should calculate totals correctly', async () => {
      const quantity = 2;
      const expectedSubtotal = Math.trunc(basePrice * quantity * 100) / 100;

      const { order } = await orderDomain.createOrder(userId, orderInput(quantity));

      expect(order.subtotal).toBeCloseTo(expectedSubtotal, 2);
      expect(order.shipping_cost).toBeCloseTo(SHIPPING_PRICE, 2);
      expect(order.total).toBeCloseTo(expectedSubtotal + SHIPPING_PRICE, 2);
    });

    it('should snapshot shipping address correctly', async () => {
      const { order } = await orderDomain.createOrder(userId, orderInput(1));

      expect(order.shipping_street).toBe('Av. Vitest');
      expect(order.shipping_street_number).toBe('123');
      expect(order.shipping_city).toBe('Buenos Aires');
      expect(order.shipping_province).toBe('CABA');
      expect(order.shipping_postcode).toBe('1043');
    });

    it('should snapshot product info in order_items', async () => {
      const product = await getTestProduct(10);

      const { order } = await orderDomain.createOrder(userId, orderInput(1));

      const items = await query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);

      expect(items.rows.length).toBe(1);
      expect(items.rows[0].product_name).toBe(product.name);
      expect(items.rows[0].product_sku).toBe(product.sku);
      expect(Number(items.rows[0].unit_price)).toBeCloseTo(product.base_price, 2);
    });

    it('should reject an address that belongs to another user', async () => {
      const otherUser = await createTestUser();
      const otherAddress = await createTestAddress(otherUser.id);

      await expect(
        orderDomain.createOrder(userId, { ...orderInput(1), shipping_address_id: otherAddress.id })
      ).rejects.toThrow(/Dirección de envío inválida/);
    });
  });

  describe('updateOrderStatus', () => {
    it('should transition to payment_confirmed and deduct stock', async () => {
      const { order } = await orderDomain.createOrder(userId, orderInput(2));

      const afterCreate = await getProductStock(productId);

      await orderDomain.updateOrderStatus(order.id, { status: 'payment_confirmed' }, userId, true);

      const afterConfirm = await getProductStock(productId);
      expect(afterConfirm.stock).toBe(afterCreate.stock - 2);
      expect(afterConfirm.reserved_stock).toBe(afterCreate.reserved_stock - 2);
    });

    it('should reject invalid status transition', async () => {
      const { order } = await orderDomain.createOrder(userId, orderInput(1));

      await expect(
        orderDomain.updateOrderStatus(order.id, { status: 'delivered' }, userId, true)
      ).rejects.toThrow(/Transición de estado inválida/);
    });

    it('should create status history entry', async () => {
      const { order } = await orderDomain.createOrder(userId, orderInput(1));

      await orderDomain.updateOrderStatus(
        order.id,
        { status: 'payment_confirmed', notes: 'Test payment confirmation' },
        userId,
        true
      );

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
      const { order } = await orderDomain.createOrder(userId, orderInput(2));

      const afterCreate = await getProductStock(productId);

      await orderDomain.cancelOrder(order.id, 'Customer request', userId, true);

      const afterCancel = await getProductStock(productId);
      expect(afterCancel.stock).toBe(afterCreate.stock);
      expect(afterCancel.reserved_stock).toBe(afterCreate.reserved_stock - 2);
    });

    it('should restore stock when cancelling confirmed order', async () => {
      const { order } = await orderDomain.createOrder(userId, orderInput(2));
      await orderDomain.updateOrderStatus(order.id, { status: 'payment_confirmed' }, userId, true);

      const afterConfirm = await getProductStock(productId);

      await orderDomain.cancelOrder(order.id, 'Customer request', userId, true);

      const afterCancel = await getProductStock(productId);
      expect(afterCancel.stock).toBe(afterConfirm.stock + 2);
      expect(afterCancel.reserved_stock).toBe(afterConfirm.reserved_stock);
    });

    it('should set cancelled status and record the reason in history', async () => {
      const { order } = await orderDomain.createOrder(userId, orderInput(1));
      const reason = 'Out of stock';

      const cancelled = await orderDomain.cancelOrder(order.id, reason, userId, true);

      expect(cancelled.status).toBe('cancelled');

      const history = await query(
        "SELECT * FROM order_status_history WHERE order_id = $1 AND status = 'cancelled'",
        [order.id]
      );
      expect(history.rows.length).toBe(1);
      expect(history.rows[0].notes).toBe(reason);
    });
  });
});
