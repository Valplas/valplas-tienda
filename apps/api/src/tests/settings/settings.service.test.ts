// apps/api/src/tests/settings/settings.service.test.ts
//
// Reemplazo del logo: el objeto anterior se borra recién después de guardar
// el nuevo, y si falla la DB no queda el nuevo huérfano en Storage.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MulterFile } from '../../shared/middleware/image-upload.middleware.js';

vi.mock('../../modules/settings/settings.repository.js', () => ({
  getStoreSettings: vi.fn(),
  updateLogo: vi.fn()
}));

vi.mock('../../infrastructure/external/supabase-storage.js', () => ({
  uploadImageObject: vi.fn(),
  deleteImageObjectsBestEffort: vi.fn(),
  getPublicUrl: vi.fn((path: string) => `https://cdn.test/${path}`),
  buildImageFilename: vi.fn((w: number, h: number) => `logo_${w}x${h}.webp`)
}));

vi.mock('../../infrastructure/external/web-revalidation.js', () => ({
  revalidateWebTags: vi.fn(),
  WEB_CACHE_TAGS: { BANNERS: 'banners', STORE_SETTINGS: 'store-settings' }
}));

vi.mock('../../shared/middleware/image-upload.middleware.js', () => ({
  processImage: vi.fn(async () => ({
    buffer: Buffer.from('webp'),
    width: 400,
    height: 120,
    sizeBytes: 4
  }))
}));

import * as settingsService from '../../modules/settings/settings.service.js';
import * as settingsRepository from '../../modules/settings/settings.repository.js';
import * as storage from '../../infrastructure/external/supabase-storage.js';
import { revalidateWebTags } from '../../infrastructure/external/web-revalidation.js';

const LOGO_FILE = { buffer: Buffer.from('png') } as MulterFile;

const PREVIOUS_LOGO = {
  url: 'https://cdn.test/store/logo/old.webp',
  storagePath: 'store/logo/old.webp',
  width: 300,
  height: 100
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(settingsRepository.getStoreSettings).mockResolvedValue({ logo: PREVIOUS_LOGO });
});

describe('uploadLogo', () => {
  it('guarda el nuevo logo, borra el anterior y revalida', async () => {
    await settingsService.uploadLogo(LOGO_FILE, 'user-1');

    expect(settingsRepository.updateLogo).toHaveBeenCalledWith(
      {
        url: 'https://cdn.test/store/logo/logo_400x120.webp',
        storagePath: 'store/logo/logo_400x120.webp',
        width: 400,
        height: 120
      },
      'user-1'
    );
    expect(storage.deleteImageObjectsBestEffort).toHaveBeenCalledWith(
      ['store/logo/old.webp'],
      'settings'
    );
    expect(revalidateWebTags).toHaveBeenCalledWith(['store-settings']);
  });

  it('si falla la DB borra el nuevo y conserva el anterior', async () => {
    vi.mocked(settingsRepository.updateLogo).mockRejectedValueOnce(new Error('db down'));

    await expect(settingsService.uploadLogo(LOGO_FILE, 'user-1')).rejects.toThrow('db down');

    expect(storage.deleteImageObjectsBestEffort).toHaveBeenCalledTimes(1);
    expect(storage.deleteImageObjectsBestEffort).toHaveBeenCalledWith(
      ['store/logo/logo_400x120.webp'],
      'settings'
    );
    expect(revalidateWebTags).not.toHaveBeenCalled();
  });
});

describe('deleteLogo', () => {
  it('sin logo no toca nada', async () => {
    vi.mocked(settingsRepository.getStoreSettings).mockResolvedValue({ logo: null });

    const result = await settingsService.deleteLogo('user-1');

    expect(result.logoUrl).toBeNull();
    expect(settingsRepository.updateLogo).not.toHaveBeenCalled();
    expect(revalidateWebTags).not.toHaveBeenCalled();
  });

  it('limpia la fila y borra el objeto', async () => {
    await settingsService.deleteLogo('user-1');

    expect(settingsRepository.updateLogo).toHaveBeenCalledWith(null, 'user-1');
    expect(storage.deleteImageObjectsBestEffort).toHaveBeenCalledWith(
      ['store/logo/old.webp'],
      'settings'
    );
  });
});
