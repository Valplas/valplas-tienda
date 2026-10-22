// apps/api/src/tests/shared/web-revalidation.test.ts
//
// La revalidación de la web es best-effort: sin secret no llama, y un fallo
// de red o un status de error nunca se propaga al request que la disparó.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockEnv = vi.hoisted(() => ({
  REVALIDATE_SECRET: '',
  FRONTEND_URL: 'https://web.test'
}));

vi.mock('../../env.js', () => ({ env: mockEnv }));

vi.mock('../../infrastructure/logger/index.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import { revalidateWebTags } from '../../infrastructure/external/web-revalidation.js';
import { logger } from '../../infrastructure/logger/index.js';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  mockEnv.REVALIDATE_SECRET = 'shh';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('revalidateWebTags', () => {
  it('sin secret no llama a la web', async () => {
    mockEnv.REVALIDATE_SECRET = '';

    await revalidateWebTags(['banners']);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('manda los tags con el secret en el header', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await revalidateWebTags(['banners', 'store-settings']);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://web.test/api/revalidate');
    expect(init.headers['x-revalidate-secret']).toBe('shh');
    expect(JSON.parse(init.body)).toEqual({ tags: ['banners', 'store-settings'] });
  });

  it('no propaga errores de red ni respuestas no-ok', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(revalidateWebTags(['banners'])).resolves.toBeUndefined();

    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(revalidateWebTags(['banners'])).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledTimes(2);
  });
});
