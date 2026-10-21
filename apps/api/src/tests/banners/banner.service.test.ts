// apps/api/src/tests/banners/banner.service.test.ts
//
// Orquestación de imágenes + DB del service de banners: no dejar objetos
// huérfanos en Storage cuando falla la DB, borrar las imágenes viejas recién
// después de persistir las nuevas, y exigir la lista completa al reordenar.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdminBanner } from '../../modules/banners/banner.types.js';
import type { MulterFile } from '../../shared/middleware/image-upload.middleware.js';

vi.mock('../../modules/banners/banner.repository.js', () => ({
  findPublicBanners: vi.fn(),
  findAdminBanners: vi.fn(),
  findAdminBannerById: vi.fn(),
  findBannerStorage: vi.fn(),
  findAllBannerIds: vi.fn(),
  getNextDisplayOrder: vi.fn(),
  countExistingLinkTargets: vi.fn(),
  insertBanner: vi.fn(),
  updateBanner: vi.fn(),
  updateBannerImages: vi.fn(),
  softDeleteBanner: vi.fn(),
  reorderBanners: vi.fn()
}));

vi.mock('../../infrastructure/external/supabase-storage.js', () => ({
  uploadImageObject: vi.fn(),
  deleteImageObjectsBestEffort: vi.fn(),
  getPublicUrl: vi.fn((path: string) => `https://cdn.test/${path}`),
  buildImageFilename: vi.fn((w: number, h: number) => `img_${w}x${h}.webp`)
}));

vi.mock('../../infrastructure/external/web-revalidation.js', () => ({
  revalidateWebTags: vi.fn(),
  WEB_CACHE_TAGS: { BANNERS: 'banners', STORE_SETTINGS: 'store-settings' }
}));

vi.mock('../../shared/middleware/image-upload.middleware.js', () => ({
  processImage: vi.fn(async (_buffer: Buffer, options: { maxWidth: number }) => ({
    buffer: Buffer.from('webp'),
    width: options.maxWidth,
    height: 100,
    sizeBytes: 4
  }))
}));

import * as bannerService from '../../modules/banners/banner.service.js';
import * as bannerRepository from '../../modules/banners/banner.repository.js';
import * as storage from '../../infrastructure/external/supabase-storage.js';
import { revalidateWebTags } from '../../infrastructure/external/web-revalidation.js';

const BANNER_ID = '0b9f1d64-8f39-4c1f-9d6a-4e2f2b9c7a01';
const PRODUCT_ID = '5a2c8e1b-3d4f-4a6b-8c9d-1e2f3a4b5c6d';

function file(name: string): MulterFile {
  return { buffer: Buffer.from(name), originalname: `${name}.jpg` } as MulterFile;
}

const NO_LINKS = { linkCategoryId: null, linkBrandId: null, linkProductId: null };

const CREATE_INPUT = {
  title: 'Promo',
  ...NO_LINKS,
  isActive: true,
  startsAt: null,
  endsAt: null
};

function adminBanner(overrides: Partial<AdminBanner> = {}): AdminBanner {
  return {
    id: BANNER_ID,
    title: 'Promo',
    startsAt: null,
    endsAt: null,
    ...overrides
  } as AdminBanner;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(bannerRepository.getNextDisplayOrder).mockResolvedValue(3);
  vi.mocked(bannerRepository.findAdminBannerById).mockResolvedValue(adminBanner());
  vi.mocked(bannerRepository.countExistingLinkTargets).mockResolvedValue({
    categories: 0,
    brands: 0,
    products: 1
  });
});

describe('createBanner', () => {
  it('sube PC y celular con sus límites, inserta al final y revalida la web', async () => {
    await bannerService.createBanner(
      CREATE_INPUT,
      { desktop: file('pc'), mobile: file('cel') },
      'user-1'
    );

    expect(storage.uploadImageObject).toHaveBeenCalledTimes(2);
    const inserted = vi.mocked(bannerRepository.insertBanner).mock.calls[0][0];
    expect(inserted.displayOrder).toBe(3);
    expect(inserted.createdBy).toBe('user-1');
    expect(inserted.desktop.storagePath).toMatch(
      /^banners\/[0-9a-f-]+\/desktop_img_2000x100\.webp$/
    );
    expect(inserted.mobile?.storagePath).toMatch(/\/mobile_img_1200x100\.webp$/);
    expect(revalidateWebTags).toHaveBeenCalledWith(['banners']);
  });

  it('sin imagen de celular guarda mobile null', async () => {
    await bannerService.createBanner(CREATE_INPUT, { desktop: file('pc') }, 'user-1');

    expect(storage.uploadImageObject).toHaveBeenCalledTimes(1);
    expect(vi.mocked(bannerRepository.insertBanner).mock.calls[0][0].mobile).toBeNull();
  });

  it('si falla el INSERT borra las imágenes ya subidas', async () => {
    vi.mocked(bannerRepository.insertBanner).mockRejectedValueOnce(new Error('db down'));

    await expect(
      bannerService.createBanner(
        CREATE_INPUT,
        { desktop: file('pc'), mobile: file('cel') },
        'user-1'
      )
    ).rejects.toThrow('db down');

    const [paths] = vi.mocked(storage.deleteImageObjectsBestEffort).mock.calls[0];
    expect(paths).toHaveLength(2);
    expect(revalidateWebTags).not.toHaveBeenCalled();
  });

  it('rechaza un destino inexistente antes de subir nada', async () => {
    vi.mocked(bannerRepository.countExistingLinkTargets).mockResolvedValueOnce({
      categories: 0,
      brands: 0,
      products: 0
    });

    await expect(
      bannerService.createBanner(
        { ...CREATE_INPUT, linkProductId: PRODUCT_ID },
        { desktop: file('pc') },
        'user-1'
      )
    ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });

    expect(storage.uploadImageObject).not.toHaveBeenCalled();
  });
});

describe('replaceBannerImages', () => {
  it('borra las imágenes anteriores recién después de actualizar la fila', async () => {
    vi.mocked(bannerRepository.findBannerStorage).mockResolvedValue({
      desktopStoragePath: 'banners/old/desktop.webp',
      mobileStoragePath: 'banners/old/mobile.webp'
    });
    vi.mocked(bannerRepository.updateBannerImages).mockResolvedValue(true);

    await bannerService.replaceBannerImages(BANNER_ID, { desktop: file('pc') });

    const updateOrder = vi.mocked(bannerRepository.updateBannerImages).mock.invocationCallOrder[0];
    const deleteCall = vi.mocked(storage.deleteImageObjectsBestEffort).mock;
    expect(deleteCall.calls[0][0]).toEqual(['banners/old/desktop.webp', 'banners/old/mobile.webp']);
    expect(deleteCall.invocationCallOrder[0]).toBeGreaterThan(updateOrder);
    // Sin recorte de celular: se limpia el anterior
    expect(vi.mocked(bannerRepository.updateBannerImages).mock.calls[0][2]).toBeNull();
  });

  it('404 sin subir nada si el banner no existe', async () => {
    vi.mocked(bannerRepository.findBannerStorage).mockResolvedValue(null);

    await expect(
      bannerService.replaceBannerImages(BANNER_ID, { desktop: file('pc') })
    ).rejects.toMatchObject({ code: 'BANNER_NOT_FOUND' });
    expect(storage.uploadImageObject).not.toHaveBeenCalled();
  });
});

describe('updateBanner', () => {
  it('valida el rango contra la fecha que ya tiene el banner', async () => {
    vi.mocked(bannerRepository.findAdminBannerById).mockResolvedValue(
      adminBanner({ startsAt: '2026-12-10T03:00:00.000Z' })
    );

    await expect(
      bannerService.updateBanner(BANNER_ID, { endsAt: '2026-12-01T02:59:59.000Z' })
    ).rejects.toMatchObject({ code: 'INVALID_DATE_RANGE' });
    expect(bannerRepository.updateBanner).not.toHaveBeenCalled();
  });

  it('actualiza y revalida', async () => {
    await bannerService.updateBanner(BANNER_ID, { isActive: false });

    expect(bannerRepository.updateBanner).toHaveBeenCalledWith(BANNER_ID, { isActive: false });
    expect(revalidateWebTags).toHaveBeenCalledWith(['banners']);
  });
});

describe('reorderBanners', () => {
  const IDS = ['a', 'b', 'c'];

  beforeEach(() => {
    vi.mocked(bannerRepository.findAllBannerIds).mockResolvedValue(IDS);
  });

  it('acepta la lista completa en otro orden', async () => {
    await bannerService.reorderBanners(['c', 'a', 'b']);

    expect(bannerRepository.reorderBanners).toHaveBeenCalledWith(['c', 'a', 'b']);
  });

  it.each([
    ['incompleta', ['a', 'b']],
    ['con repetidos', ['a', 'a', 'b']],
    ['con ids ajenos', ['a', 'b', 'z']]
  ])('rechaza una lista %s', async (_label, ids) => {
    await expect(bannerService.reorderBanners(ids)).rejects.toMatchObject({
      code: 'INVALID_BANNER_IDS'
    });
    expect(bannerRepository.reorderBanners).not.toHaveBeenCalled();
  });
});

describe('deleteBanner', () => {
  it('hace soft delete y limpia los objetos de Storage', async () => {
    vi.mocked(bannerRepository.findBannerStorage).mockResolvedValue({
      desktopStoragePath: 'banners/x/desktop.webp',
      mobileStoragePath: null
    });

    await bannerService.deleteBanner(BANNER_ID);

    expect(bannerRepository.softDeleteBanner).toHaveBeenCalledWith(BANNER_ID);
    expect(storage.deleteImageObjectsBestEffort).toHaveBeenCalledWith(
      ['banners/x/desktop.webp', null],
      'banners'
    );
    expect(revalidateWebTags).toHaveBeenCalledWith(['banners']);
  });
});
