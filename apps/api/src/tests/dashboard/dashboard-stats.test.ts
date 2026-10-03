// apps/api/src/tests/dashboard/dashboard-stats.test.ts
//
// pg devuelve COUNT/SUM (bigint) como string: el repositorio debe
// convertirlos a number y ventas del mes debe filtrar por pedidos pagos.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../infrastructure/database/client.js', () => ({
  query: vi.fn()
}));

import { query } from '../../infrastructure/database/client.js';
import { getDashboardStats } from '../../modules/dashboard/dashboard.repository.js';

const mockedQuery = vi.mocked(query);

function rows<T>(data: T[]) {
  return { rows: data, rowCount: data.length } as never;
}

describe('getDashboardStats', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
    mockedQuery
      .mockResolvedValueOnce(
        rows([{ total_orders: '42', pending_orders: '3', month_revenue: '150000' }])
      )
      .mockResolvedValueOnce(rows([{ active_products: '120', low_stock_count: '7' }]))
      .mockResolvedValueOnce(rows([{ id: 'p1', name: 'Balde', sku: 'B-1', available_stock: '2' }]))
      .mockResolvedValueOnce(
        rows([
          {
            id: 'o1',
            order_number: 'VLP-20261002-0001',
            status: 'processing',
            total: '5000',
            created_at: '2026-10-02T12:00:00Z',
            user: { first_name: 'Ana', last_name: 'Paz' }
          }
        ])
      );
  });

  it('convierte agregados a number', async () => {
    const stats = await getDashboardStats();

    expect(stats).toMatchObject({
      active_products: 120,
      total_orders: 42,
      pending_orders: 3,
      month_revenue: 150000,
      low_stock_threshold: 10,
      low_stock_count: 7
    });
    expect(stats.low_stock_products[0].available_stock).toBe(2);
    expect(stats.recent_orders[0].total).toBe(5000);
  });

  it('ventas del mes solo suma pedidos con pago confirmado, en hora Argentina', async () => {
    await getDashboardStats();

    const [, params] = mockedQuery.mock.calls[0];
    const [pending, revenue, timezone] = params as [string[], string[], string];

    expect(revenue).not.toContain('pending_payment');
    expect(revenue).not.toContain('cancelled');
    expect(revenue).not.toContain('refunded');
    expect(pending).toContain('pending_payment');
    expect(timezone).toBe('America/Argentina/Buenos_Aires');
  });
});
