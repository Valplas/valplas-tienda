// apps/api/src/tests/orders/cancel-stale-orders.test.ts
//
// Job que cancela órdenes pending_payment abandonadas para liberar
// el stock reservado (la preferencia de MP ya expiró).

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../modules/orders/order.repository.js', () => ({
  findStalePendingPaymentOrders: vi.fn(),
  updateOrderStatus: vi.fn()
}));

vi.mock('../../infrastructure/logger/index.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import { cancelStaleOrders } from '../../infrastructure/jobs/cancel-stale-orders.job.js';
import * as orderRepository from '../../modules/orders/order.repository.js';

const staleOrder = (id: string) =>
  ({
    id,
    order_number: `VLP-20260701-000${id}`,
    user_id: 'user-1',
    status: 'pending_payment'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('cancelStaleOrders', () => {
  it('cancela cada orden pending_payment vencida', async () => {
    vi.mocked(orderRepository.findStalePendingPaymentOrders).mockResolvedValue([
      staleOrder('1'),
      staleOrder('2')
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(orderRepository.updateOrderStatus).mockResolvedValue({} as any);

    const cancelled = await cancelStaleOrders();

    expect(cancelled).toBe(2);
    expect(orderRepository.updateOrderStatus).toHaveBeenCalledTimes(2);
    expect(orderRepository.updateOrderStatus).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({ status: 'cancelled' }),
      'user-1'
    );
  });

  it('no hace nada si no hay órdenes vencidas', async () => {
    vi.mocked(orderRepository.findStalePendingPaymentOrders).mockResolvedValue([]);

    const cancelled = await cancelStaleOrders();

    expect(cancelled).toBe(0);
    expect(orderRepository.updateOrderStatus).not.toHaveBeenCalled();
  });

  it('si una cancelación falla, continúa con las demás', async () => {
    vi.mocked(orderRepository.findStalePendingPaymentOrders).mockResolvedValue([
      staleOrder('1'),
      staleOrder('2')
    ]);
    vi.mocked(orderRepository.updateOrderStatus)
      .mockRejectedValueOnce(new Error('boom'))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce({} as any);

    const cancelled = await cancelStaleOrders();

    expect(cancelled).toBe(1);
    expect(orderRepository.updateOrderStatus).toHaveBeenCalledTimes(2);
  });
});
