import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AndreaniConfig } from '../../infrastructure/external/andreani/config.js';

const cfg = vi.hoisted(() => ({ current: { mode: 'disabled', mockStepSeconds: 10 } }));

vi.mock('../../infrastructure/external/andreani/config.js', () => ({
  getAndreaniConfig: () => cfg.current
}));

import {
  getAndreaniClient,
  isAndreaniEnabled,
  resetAndreaniClientForTests
} from '../../infrastructure/external/andreani/index.js';
import { AndreaniError } from '../../infrastructure/external/andreani/errors.js';

function setMode(mode: AndreaniConfig['mode']): void {
  cfg.current = {
    mode,
    mockStepSeconds: 10,
    baseUrl: 'https://apisqa.andreani.com',
    username: 'u',
    password: 'p',
    clientCode: 'c'
  } as unknown as typeof cfg.current;
}

beforeEach(() => {
  resetAndreaniClientForTests();
  setMode('disabled');
});

describe('andreani client selector', () => {
  it('throws UPSTREAM when disabled', () => {
    try {
      getAndreaniClient();
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AndreaniError);
      expect((e as AndreaniError).code).toBe('UPSTREAM');
      expect((e as AndreaniError).message).toBe('Andreani deshabilitado');
    }
  });

  it('isAndreaniEnabled reflects the mode', () => {
    expect(isAndreaniEnabled()).toBe(false);
    setMode('mock');
    expect(isAndreaniEnabled()).toBe(true);
  });

  it('memoizes per mode', () => {
    setMode('mock');
    expect(getAndreaniClient()).toBe(getAndreaniClient());
  });

  it('returns a different client when the mode changes', () => {
    setMode('mock');
    const a = getAndreaniClient();
    setMode('qa');
    expect(getAndreaniClient()).not.toBe(a);
  });

  it('resetAndreaniClientForTests clears the memo', () => {
    setMode('mock');
    const a = getAndreaniClient();
    resetAndreaniClientForTests();
    expect(getAndreaniClient()).not.toBe(a);
  });
});
