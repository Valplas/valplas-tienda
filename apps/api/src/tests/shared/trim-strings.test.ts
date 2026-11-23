import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Request, Response } from 'express';
import {
  trimDeep,
  trimStrings,
  trimmedQueryParser
} from '../../shared/middleware/trim-strings.middleware.js';

describe('trim-strings', () => {
  it('trimDeep recorta strings anidados y arrays', () => {
    expect(trimDeep({ a: '  x ', b: [' y '], c: { d: ' z' }, n: 1 })).toEqual({
      a: 'x',
      b: ['y'],
      c: { d: 'z' },
      n: 1
    });
  });

  it('no toca claves con password (cualquier mayúscula)', () => {
    const skip = (k: string) => /password/i.test(k);
    expect(trimDeep({ password: ' p ', newPassword: ' q ', name: ' n ' }, skip)).toEqual({
      password: ' p ',
      newPassword: ' q ',
      name: 'n'
    });
  });

  it('trimStrings recorta req.body y llama next', () => {
    const req = { originalUrl: '/api/products', body: { name: ' Bolsa ' } } as Request;
    const next = vi.fn();
    trimStrings(req, {} as Response, next);
    expect(req.body).toEqual({ name: 'Bolsa' });
    expect(next).toHaveBeenCalledOnce();
  });

  it('trimStrings no recorta passwords en el body', () => {
    const req = {
      originalUrl: '/api/auth/login',
      body: { username: ' u ', password: ' p ' }
    } as Request;
    trimStrings(req, {} as Response, vi.fn());
    expect(req.body).toEqual({ username: 'u', password: ' p ' });
  });

  it('trimStrings no toca webhooks', () => {
    const req = { originalUrl: '/api/payments/webhook?id=1', body: { a: ' x ' } } as Request;
    trimStrings(req, {} as Response, vi.fn());
    expect(req.body).toEqual({ a: ' x ' });
  });

  it('trimmedQueryParser recorta valores', () => {
    expect(trimmedQueryParser('search=%20%20bolsa%20&tags=%20a&tags=b%20')).toEqual({
      search: 'bolsa',
      tags: ['a', 'b']
    });
  });

  it('integración: con query parser y trimStrings, ?search=%20bolsa%20 equivale a ?search=bolsa', async () => {
    const app = express();
    app.set('query parser', trimmedQueryParser);
    app.use(express.json());
    app.use(trimStrings);
    app.post('/echo', (req, res) => {
      res.json({ query: req.query, body: req.body });
    });
    const server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const res = await fetch(`http://127.0.0.1:${port}/echo?search=%20bolsa%20`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: ' Bolsa ', password: ' p ' })
      });
      expect(await res.json()).toEqual({
        query: { search: 'bolsa' },
        body: { name: 'Bolsa', password: ' p ' }
      });
    } finally {
      server.close();
    }
  });
});
