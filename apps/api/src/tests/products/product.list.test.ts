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
        `DELETE FROM product_images WHERE product_id = $1 AND url LIKE 'https://vitest.local/%'`,
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
});
