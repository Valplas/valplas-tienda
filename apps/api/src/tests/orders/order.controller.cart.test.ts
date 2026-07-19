// apps/api/src/tests/orders/order.controller.cart.test.ts
//
// Al crear una orden, el carrito (cookie HttpOnly) debe vaciarse en la
// misma respuesta — si no, el usuario vuelve de MP con el carrito lleno.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../../modules/orders/order.domain.js', () => ({
  createOrder: vi.fn()
}));

vi.mock('../../modules/cart/cart.service.js', () => ({
  clearCartCookie: vi.fn()
}));

import { createOrder } from '../../modules/orders/order.controller.js';
import * as orderDomain from '../../modules/orders/order.domain.js';
import { clearCartCookie } from '../../modules/cart/cart.service.js';

function buildRes(): Response {
  const res: Record<string, unknown> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as unknown as Response;
}

const req = {
  user: { userId: 'user-1', role: 'customer' },
  body: { items: [] }
} as unknown as Request;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createOrder controller: limpieza de carrito', () => {
  it('vacía la cookie del carrito cuando la orden se crea OK', async () => {
    vi.mocked(orderDomain.createOrder).mockResolvedValue({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      order: { id: 'order-1' } as any,
      paymentUrl: 'https://mp.test/init'
    });
    const res = buildRes();
    const next: NextFunction = vi.fn();

    await createOrder(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(clearCartCookie).toHaveBeenCalledWith(res);
  });

  it('NO toca el carrito si la creación de orden falla', async () => {
    vi.mocked(orderDomain.createOrder).mockRejectedValue(new Error('sin stock'));
    const res = buildRes();
    const next: NextFunction = vi.fn();

    await createOrder(req, res, next);

    expect(clearCartCookie).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
