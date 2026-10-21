// apps/api/src/tests/banners/banner.repository.test.ts
//
// Contra la DB real: el listado público solo devuelve banners activos y
// vigentes, en orden, y nunca un destino inactivo. Datos de test con prefijo
// `vitest-` (limpieza en setup.ts).

import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query } from '../../infrastructure/database/client.js';
import * as bannerRepository from '../../modules/banners/banner.repository.js';
import type { NewBanner } from '../../modules/banners/banner.types.js';
import { createTestUser, uniqueSuffix } from '../helpers.js';

const HOUR = 60 * 60 * 1000;

async function createTestCategory(isActive: boolean): Promise<string> {
  const suffix = uniqueSuffix();
  const result = await query<{ id: string }>(
    'INSERT INTO categories (name, slug, is_active) VALUES ($1, $2, $3) RETURNING id',
    [`vitest-cat-${suffix}`, `vitest-cat-${suffix}`, isActive]
  );
  return result.rows[0].id;
}

async function insertTestBanner(
  createdBy: string,
  overrides: Partial<NewBanner> = {}
): Promise<string> {
  const id = randomUUID();
  await bannerRepository.insertBanner({
    id,
    title: `vitest-banner-${uniqueSuffix()}`,
    desktop: {
      url: 'https://cdn.test/d.webp',
      storagePath: `banners/${id}/d.webp`,
      width: 3,
      height: 1
    },
    mobile: null,
    linkCategoryId: null,
    linkBrandId: null,
    linkProductId: null,
    displayOrder: 0,
    isActive: true,
    startsAt: null,
    endsAt: null,
    createdBy,
    ...overrides
  });
  return id;
}

async function publicIds(): Promise<string[]> {
  const { data } = await bannerRepository.findPublicBanners({ page: 1, limit: 20 });
  return data.map((banner) => banner.id);
}

describe('findPublicBanners', () => {
  it('excluye inactivos, borrados y fuera de vigencia', async () => {
    const user = await createTestUser();
    const now = Date.now();

    const visible = await insertTestBanner(user.id, {
      startsAt: new Date(now - HOUR).toISOString(),
      endsAt: new Date(now + HOUR).toISOString()
    });
    const inactive = await insertTestBanner(user.id, { isActive: false });
    const future = await insertTestBanner(user.id, {
      startsAt: new Date(now + HOUR).toISOString()
    });
    const expired = await insertTestBanner(user.id, {
      endsAt: new Date(now - HOUR).toISOString()
    });
    const deleted = await insertTestBanner(user.id);
    await bannerRepository.softDeleteBanner(deleted);

    const ids = await publicIds();

    expect(ids).toContain(visible);
    expect(ids).not.toContain(inactive);
    expect(ids).not.toContain(future);
    expect(ids).not.toContain(expired);
    expect(ids).not.toContain(deleted);
  });

  it('respeta display_order y lo actualiza al reordenar', async () => {
    const user = await createTestUser();
    const first = await insertTestBanner(user.id, { displayOrder: 1 });
    const second = await insertTestBanner(user.id, { displayOrder: 2 });

    const before = (await publicIds()).filter((id) => id === first || id === second);
    expect(before).toEqual([first, second]);

    const allIds = await bannerRepository.findAllBannerIds();
    const reordered = [second, first, ...allIds.filter((id) => id !== first && id !== second)];
    await bannerRepository.reorderBanners(reordered);

    const after = (await publicIds()).filter((id) => id === first || id === second);
    expect(after).toEqual([second, first]);
  });

  it('un destino inactivo llega como null en el público pero visible en admin', async () => {
    const user = await createTestUser();
    const categoryId = await createTestCategory(false);
    const bannerId = await insertTestBanner(user.id, { linkCategoryId: categoryId });

    const { data } = await bannerRepository.findPublicBanners({ page: 1, limit: 20 });
    expect(data.find((banner) => banner.id === bannerId)?.linkCategoryId).toBeNull();

    const admin = await bannerRepository.findAdminBannerById(bannerId);
    expect(admin?.linkCategoryId).toBe(categoryId);
    expect(admin?.linkCategoryIsActive).toBe(false);
  });
});
