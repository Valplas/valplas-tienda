// apps/api/src/infrastructure/external/andreani/index.ts
//
// Selector de cliente según ANDREANI_MODE. Memoizado por modo.

import { getAndreaniConfig } from './config.js';
import { AndreaniError } from './errors.js';
import { createHttpAndreaniClient } from './http-client.js';
import { createMockAndreaniClient } from './mock-client.js';
import type { AndreaniClient } from './types.js';

let cached: { mode: string; client: AndreaniClient } | null = null;

export function isAndreaniEnabled(): boolean {
  return getAndreaniConfig().mode !== 'disabled';
}

export function getAndreaniClient(): AndreaniClient {
  const cfg = getAndreaniConfig();
  if (cfg.mode === 'disabled') {
    throw new AndreaniError('UPSTREAM', 'Andreani deshabilitado');
  }
  if (cached && cached.mode === cfg.mode) return cached.client;
  const client =
    cfg.mode === 'mock'
      ? createMockAndreaniClient({ stepSeconds: cfg.mockStepSeconds })
      : createHttpAndreaniClient(cfg);
  cached = { mode: cfg.mode, client };
  return client;
}

export function resetAndreaniClientForTests(): void {
  cached = null;
}
