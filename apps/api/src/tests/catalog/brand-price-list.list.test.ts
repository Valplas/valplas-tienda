// apps/api/src/tests/catalog/brand-price-list.list.test.ts
//
// Marcas y listas de precio por cursor contra la DB real: recorrido completo sin repetir ni
// saltear (incluye listas con el mismo margen), total solo en la primera página, OFFSET con page
// y cursor de otro orden rechazado.

import { describe, it, expect, afterEach } from 'vitest';
import { findBrands } from '../../modules/brands/brand.repository.js';
import { findPriceLists } from '../../modules/price-lists/price-list.repository.js';
import { encodeCursor } from '../../shared/utils/keyset.js';
import { query } from '../../infrastructure/database/client.js';
import { lettersSuffix } from '../helpers.js';

const PREFIX = 'Vitest Cur';

afterEach(async () => {
  await query('DELETE FROM brands WHERE name LIKE $1', [`${PREFIX}%`]);
  await query('DELETE FROM price_lists WHERE name LIKE $1', [`${PREFIX}%`]);
});

describe('findBrands por cursor', () => {
  async function createBrands(token: string, names: string[]) {
    const ids: string[] = [];
    for (const [i, name] of names.entries()) {
      const result = await query<{ id: string }>(
        `INSERT INTO brands (name, slug, is_active) VALUES ($1, $2, true) RETURNING id`,
        [`${PREFIX} ${token} ${name}`, `vitest-cur-${token}-${i}`.toLowerCase()]
      );
      ids.push(result.rows[0].id);
    }
    return ids;
  }

  it('recorre todas las marcas sin repetir, con total solo en la primera página', async () => {
    const token = lettersSuffix();
    const ids = await createBrands(token, ['a', 'b', 'c', 'd', 'e']);

    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    let firstTotal: number | null | undefined;
    do {
      const page = await findBrands({ search: token, limit: 2, cursor });
      expect(page.keyset).toBe(true);
      if (pages === 0) firstTotal = page.total;
      else expect(page.total).toBeNull();
      seen.push(...page.data.map((b) => b.id));
      expect(page.hasMore).toBe(page.nextCursor !== null);
      cursor = page.nextCursor ?? undefined;
      pages++;
    } while (cursor && pages < 10);

    expect(firstTotal).toBe(5);
    expect(pages).toBe(3);
    expect(seen).toEqual(ids);
  });

  it('cuenta productos activos solo de la página y mantiene productCount', async () => {
    const token = lettersSuffix();
    const [brandId] = await createBrands(token, ['con productos']);

    const page = await findBrands({ search: token, limit: 5 });

    expect(page.data).toHaveLength(1);
    expect(page.data[0].id).toBe(brandId);
    expect(page.data[0].productCount).toBe(0);
  });

  it('con page sigue en OFFSET con total', async () => {
    const token = lettersSuffix();
    await createBrands(token, ['a', 'b', 'c']);

    const page = await findBrands({ search: token, page: 2, limit: 2 });

    expect(page.keyset).toBe(false);
    expect(page.total).toBe(3);
    expect(page.data).toHaveLength(1);
  });

  it('rechaza un cursor inválido con 400', async () => {
    await expect(findBrands({ cursor: 'basura' })).rejects.toMatchObject({
      code: 'INVALID_CURSOR',
      statusCode: 400
    });
  });
});

describe('findPriceLists por cursor', () => {
  async function createLists(token: string, margins: number[]) {
    const ids: string[] = [];
    for (const [i, margin] of margins.entries()) {
      const result = await query<{ id: string }>(
        `INSERT INTO price_lists (name, margin, discount, is_active)
         VALUES ($1, $2, 0, true) RETURNING id`,
        [`${PREFIX} ${token} ${i}`, margin]
      );
      ids.push(result.rows[0].id);
    }
    return ids;
  }

  it('recorre todas las listas sin repetir aunque compartan margen', async () => {
    const token = lettersSuffix();
    const ids = await createLists(token, [30, 30, 30, 45.5, 10]);

    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    let firstTotal: number | null | undefined;
    do {
      const page = await findPriceLists({ search: token, limit: 2, cursor });
      expect(page.keyset).toBe(true);
      if (pages === 0) firstTotal = page.total;
      else expect(page.total).toBeNull();
      seen.push(...page.data.map((l) => l.id));
      expect(page.data[0]).not.toHaveProperty('_k0');
      cursor = page.nextCursor ?? undefined;
      pages++;
    } while (cursor && pages < 10);

    expect(firstTotal).toBe(5);
    expect(pages).toBe(3);
    expect(new Set(seen)).toEqual(new Set(ids));
    expect(seen).toHaveLength(5);
    // Margen más bajo primero, el más alto al final
    expect(seen[0]).toBe(ids[4]);
    expect(seen[4]).toBe(ids[3]);
  });

  it('con page sigue en OFFSET con total', async () => {
    const token = lettersSuffix();
    await createLists(token, [10, 20, 30]);

    const page = await findPriceLists({ search: token, page: 1, limit: 2 });

    expect(page.keyset).toBe(false);
    expect(page.total).toBe(3);
    expect(page.data).toHaveLength(2);
  });

  it('rechaza un cursor de otro orden con 400', async () => {
    // Cursor de marcas (name_asc) usado en listas de precio (margin_asc)
    const foreign = encodeCursor('name_asc', ['Acme', '00000000-0000-0000-0000-000000000000']);

    await expect(findPriceLists({ cursor: foreign })).rejects.toMatchObject({
      code: 'INVALID_CURSOR',
      statusCode: 400
    });
  });
});
