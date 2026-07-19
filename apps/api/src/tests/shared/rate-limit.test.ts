// apps/api/src/tests/shared/rate-limit.test.ts
//
// El webhook de MP no debe caer bajo el rate limiter general: una ráfaga
// de notificaciones legítimas de MP no puede recibir 429.

import { describe, it, expect } from 'vitest';
import type { Request } from 'express';
import { isMpWebhookRequest } from '../../shared/middleware/rate-limit.middleware.js';

function req(method: string, path: string): Request {
  return { method, path } as unknown as Request;
}

describe('isMpWebhookRequest', () => {
  // El limiter está montado en app.use('/api', ...) → req.path llega sin el prefijo /api
  it('exime POST /payments/webhook', () => {
    expect(isMpWebhookRequest(req('POST', '/payments/webhook'))).toBe(true);
  });

  it('no exime otros métodos ni rutas', () => {
    expect(isMpWebhookRequest(req('GET', '/payments/webhook'))).toBe(false);
    expect(isMpWebhookRequest(req('POST', '/orders'))).toBe(false);
    expect(isMpWebhookRequest(req('POST', '/payments/oauth/callback'))).toBe(false);
  });
});
