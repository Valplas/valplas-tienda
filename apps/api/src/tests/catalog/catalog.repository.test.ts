// apps/api/src/tests/catalog/catalog.repository.test.ts
//
// findPublicProducts contra la DB real: orden, paginación determinista (desempate por id),
// filtros por precio efectivo y precio de tier. No modifica productos; el test de tier crea
// y borra su propio tier.

import { describe, it, expect, afterEach } from 'vitest';
import { findPublicProducts } from '../../modules/catalog/catalog.repository.js';
import { getTestProduct } from '../helpers.js';
import { query } from '../../infrastructure/database/client.js';

describe('findPublicProducts', () => {
  let tierCleanup: { productId: string; minQuantity: number } | null = null;

  afterEach(async () => {
    if (tierCleanup) {
      await query('DELETE FROM product_price_tiers WHERE product_id = $1 AND min_quantity = $2', [
        tierCleanup.productId,
        tierCleanup.minQuantity
      ]);
      tierCleanup = null;
    }
  });

  it('devuelve la primera página con total y sin exponer costos', async () => {
    const { products, total } = await findPublicProducts({ limit: 10 });

    expect(products.length).toBeGreaterThan(0);
    expect(products.length).toBeLessThanOrEqual(10);
    expect(total).toBeGreaterThanOrEqual(products.length);
    for (const p of products) {
      expect(typeof p.price).toBe('number');
      expect(p.available_stock).toBeGreaterThan(0);
      expect(p).not.toHaveProperty('cost_price');
      expect(Array.isArray(p.tiers)).toBe(true);
    }
  });

  it('ordena por nombre y pagina sin repetir ni saltear productos', async () => {
    const all = await findPublicProducts({ sort: 'name_asc', limit: 12, page: 1 });
    const p1 = await findPublicProducts({ sort: 'name_asc', limit: 4, page: 1 });
    const p2 = await findPublicProducts({ sort: 'name_asc', limit: 4, page: 2 });
    const p3 = await findPublicProducts({ sort: 'name_asc', limit: 4, page: 3 });

    const paged = [...p1.products, ...p2.products, ...p3.products].map((p) => p.id);
    expect(new Set(paged).size).toBe(paged.length);
    expect(paged).toEqual(all.products.map((p) => p.id));
  });

  it('featured respeta el orden: destacados primero, luego nombre', async () => {
    const { products } = await findPublicProducts({ sort: 'featured', limit: 30 });
    const ids = products.map((p) => p.id);
    const flags = await query<{ id: string; is_featured: boolean; name: string }>(
      'SELECT id, is_featured, name FROM products WHERE id = ANY($1)',
      [ids]
    );
    const byId = new Map(flags.rows.map((r) => [r.id, r]));
    const ordered = ids.map((id) => byId.get(id)!);

    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1];
      const cur = ordered[i];
      if (prev.is_featured === cur.is_featured) {
        expect(prev.name.localeCompare(cur.name, 'en')).toBeLessThanOrEqual(0);
      } else {
        expect(prev.is_featured).toBe(true);
      }
    }
  });

  it('ordena por precio ascendente y descendente', async () => {
    const asc = await findPublicProducts({ sort: 'price_asc', limit: 20 });
    const desc = await findPublicProducts({ sort: 'price_desc', limit: 20 });

    const ascPrices = asc.products.map((p) => p.price);
    const descPrices = desc.products.map((p) => p.price);
    expect(ascPrices).toEqual([...ascPrices].sort((a, b) => a - b));
    expect(descPrices).toEqual([...descPrices].sort((a, b) => b - a));
  });

  it('filtra por rango de precio y el total coincide con el filtro', async () => {
    const base = await findPublicProducts({ sort: 'price_asc', limit: 20 });
    const prices = base.products.map((p) => p.price);
    const min = prices[Math.floor(prices.length / 4)];
    const max = prices[Math.floor((prices.length * 3) / 4)];

    const filtered = await findPublicProducts({
      min_price: min,
      max_price: max,
      sort: 'price_asc',
      limit: 100
    });

    expect(filtered.products.length).toBeGreaterThan(0);
    for (const p of filtered.products) {
      expect(p.price).toBeGreaterThanOrEqual(min);
      expect(p.price).toBeLessThanOrEqual(max);
    }
    expect(filtered.total).toBe(filtered.products.length);
  });

  it('el precio efectivo sale del tier cuando existe', async () => {
    const product = await getTestProduct(1);
    const priceList = await query<{ id: string }>(
      'SELECT id FROM price_lists WHERE is_active = true AND deleted_at IS NULL LIMIT 1'
    );
    const minQuantity = 11;
    await query(
      `INSERT INTO product_price_tiers (product_id, price_list_id, min_quantity, is_active)
       VALUES ($1, $2, $3, true)`,
      [product.id, priceList.rows[0].id, minQuantity]
    );
    tierCleanup = { productId: product.id, minQuantity };

    const expected = await query<{ price: string }>(
      `SELECT TRUNC(p.cost_price * (1 + pl.margin / 100) * 100) / 100 AS price
       FROM products p, price_lists pl WHERE p.id = $1 AND pl.id = $2`,
      [product.id, priceList.rows[0].id]
    );

    const { products } = await findPublicProducts({ search: product.sku, limit: 5 });
    const found = products.find((p) => p.id === product.id);

    expect(found).toBeDefined();
    expect(found?.price).toBeCloseTo(Number(expected.rows[0].price), 2);
    expect(found?.tiers.some((t) => t.min_quantity === minQuantity)).toBe(true);
  });

  it('una búsqueda sin resultados devuelve lista vacía y total 0', async () => {
    const { products, total } = await findPublicProducts({ search: 'zzzz-no-existe-9x9x' });
    expect(products).toEqual([]);
    expect(total).toBe(0);
  });
});
