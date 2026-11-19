// apps/api/src/tests/products/product.list.test.ts
//
// findProducts (listado admin) contra la DB real: imágenes embebidas y ordenadas, productos sin
// imágenes con [], búsqueda por SKU y paginación determinista. Las imágenes de test se crean
// y borran en cada caso.

import { describe, it, expect, afterEach } from 'vitest';
import { findProducts } from '../../modules/products/product.repository.js';
import { getTestProduct, uniqueSuffix } from '../helpers.js';
import { query } from '../../infrastructure/database/client.js';

describe('findProducts (admin)', () => {
  let imageProductId: string | null = null;

  afterEach(async () => {
    if (imageProductId) {
      await query(
        "DELETE FROM product_images WHERE product_id = $1 AND url LIKE 'https://vitest.local/%'",
        [imageProductId]
      );
      imageProductId = null;
    }
  });

  it('embebe las imágenes ordenadas por displayOrder', async () => {
    const product = await getTestProduct(1);
    imageProductId = product.id;
    const tag = uniqueSuffix();
    await query(
      `INSERT INTO product_images (product_id, url, display_order, is_primary)
       VALUES ($1, $2, 20, false), ($1, $3, 10, false)`,
      [product.id, `https://vitest.local/${tag}-b.jpg`, `https://vitest.local/${tag}-a.jpg`]
    );

    const { products } = await findProducts({ search: product.sku, limit: 5 });
    const found = products.find((p) => p.id === product.id);
    const urls = (found?.images ?? []).map((i) => i.url).filter((u) => u.includes(tag));

    expect(urls).toEqual([
      `https://vitest.local/${tag}-a.jpg`,
      `https://vitest.local/${tag}-b.jpg`
    ]);
  });

  it('un producto sin imágenes devuelve images = []', async () => {
    const { products } = await findProducts({ limit: 100, sort: 'name_asc' });
    const withoutImages = products.find((p) => p.images.length === 0);

    expect(withoutImages).toBeDefined();
    expect(withoutImages?.images).toEqual([]);
    expect(Array.isArray(withoutImages?.priceTiers ?? [])).toBe(true);
  });

  it('busca por SKU y respeta el total', async () => {
    const product = await getTestProduct(1);

    const { products, total } = await findProducts({ search: product.sku, limit: 10 });

    expect(products.map((p) => p.id)).toContain(product.id);
    expect(total).toBeGreaterThanOrEqual(products.length);
  });

  it('pagina sin repetir ni saltear productos', async () => {
    const all = await findProducts({ sort: 'name_asc', limit: 12, page: 1 });
    const p1 = await findProducts({ sort: 'name_asc', limit: 4, page: 1 });
    const p2 = await findProducts({ sort: 'name_asc', limit: 4, page: 2 });
    const p3 = await findProducts({ sort: 'name_asc', limit: 4, page: 3 });

    const paged = [...p1.products, ...p2.products, ...p3.products].map((p) => p.id);
    expect(new Set(paged).size).toBe(paged.length);
    expect(paged).toEqual(all.products.map((p) => p.id));
  });

  describe('por cursor', () => {
    const SORTS = [
      'name_asc',
      'name_desc',
      'price_asc',
      'price_desc',
      'newest',
      'oldest',
      'updated_asc',
      'updated_desc',
      'stock_asc',
      'stock_desc'
    ] as const;

    async function walkByCursor(sort: (typeof SORTS)[number]) {
      const ids: string[] = [];
      let cursor: string | undefined;
      let firstTotal: number | null | undefined;
      let pages = 0;
      do {
        const page = await findProducts({ sort, limit: 100, cursor });
        if (pages === 0) firstTotal = page.total;
        else expect(page.total).toBeNull();
        expect(page.keyset).toBe(true);
        expect(page.hasMore).toBe(page.nextCursor !== null);
        ids.push(...page.products.map((p) => p.id));
        cursor = page.nextCursor ?? undefined;
        pages++;
      } while (cursor && pages < 200);
      return { ids, firstTotal };
    }

    async function walkByPage(sort: (typeof SORTS)[number]) {
      const ids: string[] = [];
      for (let page = 1; page < 200; page++) {
        const result = await findProducts({ sort, limit: 100, page });
        ids.push(...result.products.map((p) => p.id));
        if (result.products.length < 100) break;
      }
      return ids;
    }

    for (const sort of SORTS) {
      it(`recorre todos los productos sin repetir con sort=${sort}`, async () => {
        const byCursor = await walkByCursor(sort);
        const byPage = await walkByPage(sort);

        expect(new Set(byCursor.ids).size).toBe(byCursor.ids.length);
        expect(byCursor.firstTotal).toBe(byPage.length);
        expect(new Set(byCursor.ids)).toEqual(new Set(byPage));
        // El stock disponible cambia con otros tests en paralelo: solo se compara el orden
        // exacto en los órdenes estables
        if (!sort.startsWith('stock') && !sort.startsWith('updated')) {
          expect(byCursor.ids).toEqual(byPage);
        }
      });
    }

    it('rechaza un cursor de otro orden con 400', async () => {
      const first = await findProducts({ sort: 'name_asc', limit: 1 });

      await expect(
        findProducts({ sort: 'newest', cursor: first.nextCursor ?? 'x' })
      ).rejects.toMatchObject({ code: 'INVALID_CURSOR', statusCode: 400 });
    });
  });
});
