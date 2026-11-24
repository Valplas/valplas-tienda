// apps/api/src/tests/shared/date-range.test.ts
//
// Helper de rangos por día en hora de Argentina + filtros de fecha de pedidos
// contra la DB real. Los pedidos de test se crean con created_at fijo cerca de la
// medianoche argentina para verificar que el día se corta en UTC-3, no en UTC.

import { describe, it, expect } from 'vitest';
import {
  isDateOnly,
  isValidDateInput,
  fromBoundSql,
  toBoundSql
} from '../../shared/utils/date-range.js';
import * as orderRepository from '../../modules/orders/order.repository.js';
import { createTestUser, createRawOrder } from '../helpers.js';
import { query } from '../../infrastructure/database/client.js';

describe('date-range helpers', () => {
  it('distingue día calendario de timestamp', () => {
    expect(isDateOnly('2026-10-20')).toBe(true);
    expect(isDateOnly('2026-10-20T23:59:59')).toBe(false);
  });

  it('valida fechas reales', () => {
    expect(isValidDateInput('2026-10-20')).toBe(true);
    expect(isValidDateInput('2026-02-31')).toBe(false);
    expect(isValidDateInput('no-es-fecha')).toBe(false);
    expect(isValidDateInput('2026-10-20T10:00:00Z')).toBe(true);
  });

  it('un día usa rango semiabierto sin función sobre la columna', () => {
    expect(toBoundSql('o.created_at', '2026-10-20', '$2')).toMatch(/^o\.created_at < /);
    expect(toBoundSql('o.created_at', '2026-10-20', '$2')).not.toContain('<=');
    expect(fromBoundSql('o.created_at', '2026-10-20', '$1')).toMatch(/^o\.created_at >= /);
    // Un timestamp conserva el comportamiento inclusivo
    expect(toBoundSql('o.created_at', '2026-10-20T10:00:00Z', '$2')).toContain('<=');
  });
});

describe('findOrders: filtro por día en hora de Argentina', () => {
  async function orderAt(userId: string, isoUtc: string): Promise<string> {
    const id = await createRawOrder(userId);
    await query('UPDATE orders SET created_at = $1 WHERE id = $2', [isoUtc, id]);
    return id;
  }

  it('from_date = to_date = YYYY-MM-DD trae el día argentino completo', async () => {
    const userId = (await createTestUser()).id;
    // 20/10 23:30 ART = 21/10 02:30 UTC (el filtro viejo en UTC lo asignaba al 21)
    const lateNight = await orderAt(userId, '2026-10-21T02:30:00Z');
    // 20/10 00:10 ART = 20/10 03:10 UTC (primer minuto del día argentino)
    const earlyMorning = await orderAt(userId, '2026-10-20T03:10:00Z');
    // 19/10 23:50 ART = 20/10 02:50 UTC (pertenece al 19, no al 20)
    const prevDay = await orderAt(userId, '2026-10-20T02:50:00Z');
    // 21/10 00:10 ART = 21/10 03:10 UTC (pertenece al 21)
    const nextDay = await orderAt(userId, '2026-10-21T03:10:00Z');

    const { orders, total } = await orderRepository.findOrders({
      user_id: userId,
      from_date: '2026-10-20',
      to_date: '2026-10-20',
      limit: 50
    });
    const ids = orders.map((o) => o.id);

    expect(total).toBe(2);
    expect(ids).toContain(lateNight);
    expect(ids).toContain(earlyMorning);
    expect(ids).not.toContain(prevDay);
    expect(ids).not.toContain(nextDay);
  });
});
