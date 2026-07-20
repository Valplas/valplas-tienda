// apps/api/src/tests/integration/purchase-flow.test.ts
//
// Flujo de compra completo contra la DB real: registro → login → dirección →
// orden (reserva stock por trigger) → confirmación de pago (descuenta stock) →
// consulta. Segundo caso: cancelación con restitución de stock.
// payment_method 'manual' para no llamar a MercadoPago desde tests.

import { describe, it, expect } from 'vitest';
import * as authService from '../../modules/auth/auth.service.js';
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

describe('Complete Purchase Flow (Integration)', () => {
  it('should complete full purchase: register → login → address → order → confirm payment', async () => {
    // 1. Register + login
    const user = await createTestUser();

    const loginResult = await authService.login({
      emailOrUsername: user.email,
      password: user.password
    });
    expect(loginResult.accessToken).toBeDefined();
    expect(loginResult.user.role).toBe('customer');

    // 2. Shipping address + carrier con tarifa
    const address = await createTestAddress(user.id);
    const shipping = await createTestShipping(SHIPPING_PRICE);

    // 3. Producto real con stock
    const product = await getTestProduct(5);
    const initialStock = await getProductStock(product.id);

    // 4. Create order (reserva stock vía trigger)
    const { order, paymentUrl } = await orderDomain.createOrder(user.id, {
      shipping_address_id: address.id,
      shipping_carrier_id: shipping.carrierId,
      payment_method: 'manual',
      items: [{ product_id: product.id, quantity: 2 }]
    });

    expect(order.order_number).toMatch(/^VLP-\d{8}-\d{4,}$/);
    expect(order.status).toBe('pending_payment');
    expect(order.user_id).toBe(user.id);
    expect(paymentUrl).toBeUndefined(); // solo mercadopago genera paymentUrl

    // 5. Stock reservado, no descontado
    const afterOrder = await getProductStock(product.id);
    expect(afterOrder.stock).toBe(initialStock.stock);
    expect(afterOrder.reserved_stock).toBe(initialStock.reserved_stock + 2);

    // 6. Items snapshotean el producto
    const orderItems = await query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
    expect(orderItems.rows.length).toBe(1);
    expect(orderItems.rows[0].product_name).toBe(product.name);
    expect(orderItems.rows[0].product_sku).toBe(product.sku);
    expect(orderItems.rows[0].quantity).toBe(2);

    // 7. Totales
    const expectedSubtotal = Math.trunc(product.cost_price * 2 * 100) / 100;
    expect(order.subtotal).toBeCloseTo(expectedSubtotal, 2);
    expect(order.total).toBeCloseTo(expectedSubtotal + SHIPPING_PRICE, 2);

    // 8. Confirmar pago (lo que hace el webhook de MP) → descuenta stock
    await orderDomain.updateOrderStatus(
      order.id,
      { status: 'payment_confirmed', notes: 'Payment confirmed via MP webhook' },
      user.id,
      true
    );

    const afterPayment = await getProductStock(product.id);
    expect(afterPayment.stock).toBe(initialStock.stock - 2);
    expect(afterPayment.reserved_stock).toBe(initialStock.reserved_stock);

    // 9. Estado final + historial
    const finalOrder = await orderDomain.getOrderById(order.id, user.id);
    expect(finalOrder.status).toBe('payment_confirmed');

    const history = await query(
      'SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY created_at',
      [order.id]
    );
    expect(
      history.rows.some((h: Record<string, unknown>) => h.status === 'payment_confirmed')
    ).toBe(true);

    // 10. Consulta por número de orden (lo que usa /checkout/resultado)
    const byNumber = await orderDomain.getOrderByNumber(order.order_number, user.id);
    expect(byNumber.id).toBe(order.id);
  });

  it('should handle order cancellation correctly', async () => {
    const user = await createTestUser();
    const address = await createTestAddress(user.id);
    const shipping = await createTestShipping(SHIPPING_PRICE);
    const product = await getTestProduct(5);

    const { order } = await orderDomain.createOrder(user.id, {
      shipping_address_id: address.id,
      shipping_carrier_id: shipping.carrierId,
      payment_method: 'manual',
      items: [{ product_id: product.id, quantity: 3 }]
    });

    // Confirm payment → stock descontado
    await orderDomain.updateOrderStatus(order.id, { status: 'payment_confirmed' }, user.id, true);
    const afterPayment = await getProductStock(product.id);

    // Cancel → stock restituido por trigger
    await orderDomain.cancelOrder(order.id, 'Customer changed mind', user.id, true);

    const afterCancel = await getProductStock(product.id);
    expect(afterCancel.stock).toBe(afterPayment.stock + 3);

    const cancelledOrder = await orderDomain.getOrderById(order.id, user.id);
    expect(cancelledOrder.status).toBe('cancelled');

    const history = await query(
      "SELECT notes FROM order_status_history WHERE order_id = $1 AND status = 'cancelled'",
      [order.id]
    );
    expect(history.rows[0].notes).toBe('Customer changed mind');
  });
});
