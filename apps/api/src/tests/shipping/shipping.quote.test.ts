// apps/api/src/tests/shipping/shipping.quote.test.ts
//
// getShippingQuote contra la DB real: carriers resueltos en un solo query, orden por precio y
// exclusión de carriers inactivos. Datos propios: carriers/zonas con prefijo `vitest-`
// (los limpia setup.ts).

import { describe, it, expect } from 'vitest';
import { getShippingQuote } from '../../modules/shipping/shipping.domain.js';
import { createTestShipping } from '../helpers.js';
import { query } from '../../infrastructure/database/client.js';

const POSTCODE = '1043';

describe('getShippingQuote', () => {
  it('incluye los carriers activos con su precio y ordena de menor a mayor', async () => {
    const cheap = await createTestShipping(100);
    const pricey = await createTestShipping(99999);

    const quotes = await getShippingQuote({ postcode: POSTCODE, cart_total: 5000 });

    const cheapQuote = quotes.find((q) => q.carrier_id === cheap.carrierId);
    const priceyQuote = quotes.find((q) => q.carrier_id === pricey.carrierId);
    expect(cheapQuote?.price).toBe(100);
    expect(priceyQuote?.price).toBe(99999);
    expect(cheapQuote?.carrier_name).toMatch(/^vitest-carrier-/);

    const prices = quotes.map((q) => q.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it('excluye los carriers inactivos', async () => {
    const active = await createTestShipping(150);
    const inactive = await createTestShipping(120);
    await query('UPDATE shipping_carriers SET is_active = false WHERE id = $1', [
      inactive.carrierId
    ]);

    const quotes = await getShippingQuote({ postcode: POSTCODE, cart_total: 5000 });
    const ids = quotes.map((q) => q.carrier_id);

    expect(ids).toContain(active.carrierId);
    expect(ids).not.toContain(inactive.carrierId);
  });
});
