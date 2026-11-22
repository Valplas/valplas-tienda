import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../modules/shipments/shipment.repository.js', () => ({
  claimDueForPolling: vi.fn(),
  updateShipment: vi.fn(),
  expireStaleShipments: vi.fn(),
  findOrdersPendingAutoCreate: vi.fn()
}));
vi.mock('../../modules/shipments/shipment-lifecycle.js', () => ({ pollShipment: vi.fn() }));
vi.mock('../../modules/shipments/shipment-auto.js', () => ({ tryAutoCreateForOrder: vi.fn() }));
vi.mock('../../infrastructure/external/andreani/index.js', () => ({
  isAndreaniEnabled: vi.fn()
}));
vi.mock('../../infrastructure/external/andreani/config.js', () => ({
  getAndreaniConfig: vi.fn()
}));
vi.mock('../../infrastructure/logger/index.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import {
  pollAndreaniShipments,
  scheduleAndreaniTracking
} from '../../infrastructure/jobs/andreani-tracking.job.js';
import * as repo from '../../modules/shipments/shipment.repository.js';
import { pollShipment } from '../../modules/shipments/shipment-lifecycle.js';
import { tryAutoCreateForOrder } from '../../modules/shipments/shipment-auto.js';
import { isAndreaniEnabled } from '../../infrastructure/external/andreani/index.js';
import { getAndreaniConfig } from '../../infrastructure/external/andreani/config.js';
import type { Shipment } from '../../modules/shipments/shipment.types.js';

const ship = (id: string, poll_failures = 0) => ({ id, poll_failures }) as unknown as Shipment;

function setConfig(over: { autoCreate?: boolean; pollCron?: string } = {}) {
  vi.mocked(getAndreaniConfig).mockReturnValue({
    autoCreate: false,
    pollCron: '*/10 * * * *',
    ...over
  } as never);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(isAndreaniEnabled).mockReturnValue(true);
  setConfig();
  vi.mocked(repo.claimDueForPolling).mockResolvedValue([]);
  vi.mocked(repo.expireStaleShipments).mockResolvedValue([]);
  vi.mocked(repo.findOrdersPendingAutoCreate).mockResolvedValue([]);
});

describe('pollAndreaniShipments', () => {
  it('polls claimed shipments sequentially', async () => {
    vi.mocked(repo.claimDueForPolling).mockResolvedValue([ship('a'), ship('b')]);
    const order: string[] = [];
    vi.mocked(pollShipment).mockImplementation(async (s) => {
      order.push(`start-${s.id}`);
      await new Promise((r) => setTimeout(r, 5));
      order.push(`end-${s.id}`);
      return s;
    });

    const r = await pollAndreaniShipments();

    expect(order).toEqual(['start-a', 'end-a', 'start-b', 'end-b']);
    expect(r).toEqual({ processed: 2, failed: 0, expired: 0 });
    expect(repo.claimDueForPolling).toHaveBeenCalledWith(50, 600);
  });

  it('a failing shipment increments poll_failures and backs off', async () => {
    vi.mocked(repo.claimDueForPolling).mockResolvedValue([
      ship('a', 0),
      ship('b', 2),
      ship('c', 9)
    ]);
    vi.mocked(pollShipment).mockRejectedValue(new Error('boom'));
    const before = Date.now();

    const r = await pollAndreaniShipments();

    expect(r.failed).toBe(3);
    const calls = vi.mocked(repo.updateShipment).mock.calls;
    const expectations: [string, number, number][] = [
      ['a', 1, 15],
      ['b', 3, 60],
      ['c', 10, 720]
    ];
    expectations.forEach(([id, failures, minutes], i) => {
      expect(calls[i][0]).toBe(id);
      const patch = calls[i][1];
      expect(patch.poll_failures).toBe(failures);
      const delta = (patch.next_poll_at as Date).getTime() - before;
      expect(Math.abs(delta - minutes * 60_000)).toBeLessThan(5_000);
    });
  });

  it('resets poll_failures after a success, only when it was > 0', async () => {
    vi.mocked(repo.claimDueForPolling).mockResolvedValue([ship('a', 0), ship('b', 3)]);
    vi.mocked(pollShipment).mockImplementation(async (s) => s);

    await pollAndreaniShipments();

    expect(repo.updateShipment).toHaveBeenCalledTimes(1);
    expect(repo.updateShipment).toHaveBeenCalledWith('b', { poll_failures: 0 });
  });

  it('pre-envío older than 30 days in pending/created without admission → expired', async () => {
    vi.mocked(repo.expireStaleShipments).mockResolvedValue(['x', 'y']);
    const r = await pollAndreaniShipments();
    expect(r.expired).toBe(2);
  });

  it('no-op when disabled', async () => {
    vi.mocked(isAndreaniEnabled).mockReturnValue(false);
    const r = await pollAndreaniShipments();
    expect(r).toEqual({ processed: 0, failed: 0, expired: 0 });
    expect(repo.claimDueForPolling).not.toHaveBeenCalled();
  });

  it('runs auto-create backstop only when autoCreate is true', async () => {
    vi.mocked(repo.findOrdersPendingAutoCreate).mockResolvedValue(['o1', 'o2']);
    vi.mocked(tryAutoCreateForOrder).mockResolvedValue('created');

    await pollAndreaniShipments();
    expect(tryAutoCreateForOrder).not.toHaveBeenCalled();

    setConfig({ autoCreate: true });
    await pollAndreaniShipments();
    expect(tryAutoCreateForOrder).toHaveBeenCalledTimes(2);
    expect(tryAutoCreateForOrder).toHaveBeenNthCalledWith(1, 'o1');
    expect(tryAutoCreateForOrder).toHaveBeenNthCalledWith(2, 'o2');
  });
});

describe('scheduleAndreaniTracking', () => {
  it('returns null when disabled', () => {
    vi.mocked(isAndreaniEnabled).mockReturnValue(false);
    expect(scheduleAndreaniTracking()).toBeNull();
  });

  it('returns null on an invalid cron expression', () => {
    setConfig({ pollCron: 'not a cron' });
    expect(scheduleAndreaniTracking()).toBeNull();
  });

  it('returns a stoppable task for a valid cron', () => {
    const task = scheduleAndreaniTracking();
    expect(task).not.toBeNull();
    task?.stop();
  });
});
