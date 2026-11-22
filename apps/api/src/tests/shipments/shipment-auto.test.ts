import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../modules/orders/order.repository.js', () => ({ findOrderById: vi.fn() }));
vi.mock('../../modules/shipments/shipment.domain.js', () => ({ createForOrder: vi.fn() }));
vi.mock('../../modules/shipments/shipment.repository.js', () => ({
  findCarrierCode: vi.fn(),
  countByOrderId: vi.fn(),
  insertError: vi.fn()
}));
vi.mock('../../infrastructure/external/andreani/config.js', () => ({
  getAndreaniConfig: vi.fn()
}));
vi.mock('../../infrastructure/logger/index.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import { tryAutoCreateForOrder } from '../../modules/shipments/shipment-auto.js';
import { findOrderById } from '../../modules/orders/order.repository.js';
import { createForOrder } from '../../modules/shipments/shipment.domain.js';
import * as repo from '../../modules/shipments/shipment.repository.js';
import { getAndreaniConfig } from '../../infrastructure/external/andreani/config.js';
import { AppError } from '../../shared/middleware/error.middleware.js';

const order = (over: Record<string, unknown> = {}) =>
  ({
    id: 'o1',
    status: 'processing',
    shipping_carrier_id: 'c1',
    shipping_method: 'branch_pickup',
    pickup_branch: { id: 'BR-1' },
    ...over
  }) as never;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAndreaniConfig).mockReturnValue({ autoCreate: true } as never);
  vi.mocked(findOrderById).mockResolvedValue(order());
  vi.mocked(repo.findCarrierCode).mockResolvedValue('andreani');
  vi.mocked(repo.countByOrderId).mockResolvedValue(0);
});

describe('tryAutoCreateForOrder', () => {
  it('skips when flag off', async () => {
    vi.mocked(getAndreaniConfig).mockReturnValue({ autoCreate: false } as never);
    expect(await tryAutoCreateForOrder('o1')).toBe('skipped');
    expect(createForOrder).not.toHaveBeenCalled();
  });

  it('skips non-Andreani carrier', async () => {
    vi.mocked(repo.findCarrierCode).mockResolvedValue('other');
    expect(await tryAutoCreateForOrder('o1')).toBe('skipped');
    expect(createForOrder).not.toHaveBeenCalled();
  });

  it('skips when order not processing', async () => {
    vi.mocked(findOrderById).mockResolvedValue(order({ status: 'shipped' }));
    expect(await tryAutoCreateForOrder('o1')).toBe('skipped');
    expect(createForOrder).not.toHaveBeenCalled();
  });

  it('skips when any shipment row exists', async () => {
    vi.mocked(repo.countByOrderId).mockResolvedValue(1);
    expect(await tryAutoCreateForOrder('o1')).toBe('skipped');
    expect(createForOrder).not.toHaveBeenCalled();
  });

  it('creates with order.shipping_method and pickup_branch.id', async () => {
    vi.mocked(createForOrder).mockResolvedValue({} as never);
    expect(await tryAutoCreateForOrder('o1')).toBe('created');
    expect(createForOrder).toHaveBeenCalledWith(
      'o1',
      { serviceType: 'branch_pickup', branchId: 'BR-1' },
      null
    );
  });

  it('on AppError inserts error row with message and created_by null and returns failed', async () => {
    vi.mocked(createForOrder).mockRejectedValue(new AppError('X', 'sin localidad', 422));
    expect(await tryAutoCreateForOrder('o1')).toBe('failed');
    expect(repo.insertError).toHaveBeenCalledWith({
      orderId: 'o1',
      serviceType: 'branch_pickup',
      message: 'sin localidad',
      createdBy: null
    });
  });
});
