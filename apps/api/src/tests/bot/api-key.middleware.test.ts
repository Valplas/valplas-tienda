// apps/api/src/tests/bot/api-key.middleware.test.ts

import { describe, it, expect, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { createBotApiKeyMiddleware } from '../../shared/middleware/api-key.middleware.js';
import { AppError } from '../../shared/middleware/error.middleware.js';

function run(keys: string[], headerValue?: string): unknown {
  const middleware = createBotApiKeyMiddleware(() => keys);
  const req = {
    headers: headerValue === undefined ? {} : { 'x-api-key': headerValue }
  } as unknown as Request;
  const next = vi.fn() as unknown as NextFunction;
  middleware(req, {} as Response, next);
  expect(next).toHaveBeenCalledTimes(1);
  return vi.mocked(next).mock.calls[0][0];
}

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);

describe('requireBotApiKey', () => {
  it('responde 503 BOT_API_DISABLED si no hay keys configuradas', () => {
    const error = run([], KEY_A);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'BOT_API_DISABLED', statusCode: 503 });
  });

  it('rechaza un request sin header con 401', () => {
    expect(run([KEY_A])).toMatchObject({ code: 'INVALID_API_KEY', statusCode: 401 });
  });

  it('rechaza una key incorrecta, incluso con el mismo largo o como prefijo', () => {
    expect(run([KEY_A], KEY_B)).toMatchObject({ code: 'INVALID_API_KEY' });
    expect(run([KEY_A], KEY_A.slice(0, 32))).toMatchObject({ code: 'INVALID_API_KEY' });
    expect(run([KEY_A], '')).toMatchObject({ code: 'INVALID_API_KEY' });
  });

  it('acepta la key configurada', () => {
    expect(run([KEY_A], KEY_A)).toBeUndefined();
  });

  it('acepta cualquiera de las keys durante una rotación', () => {
    expect(run([KEY_A, KEY_B], KEY_A)).toBeUndefined();
    expect(run([KEY_A, KEY_B], KEY_B)).toBeUndefined();
  });
});
