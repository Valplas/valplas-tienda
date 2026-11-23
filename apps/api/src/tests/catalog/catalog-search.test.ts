// apps/api/src/tests/catalog/catalog-search.test.ts
//
// Búsqueda del catálogo (web y bot) en findPublicProducts: tags (producto, categoría y
// ancestros), medidas, atributos, stopwords, modo relajado, fallback "4050" y relevancia.
// Cada producto de test lleva un token aleatorio de letras en el nombre/tags para que los
// productos reales nunca interfieran; las búsquedas amplias se verifican filtrando los ids.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { query } from '../../infrastructure/database/client.js';
import { findPublicProducts } from '../../modules/catalog/catalog.repository.js';
import {
  buildSearchSql,
  digitsRegex,
  escapeLike,
  MAX_SEARCH_TERMS,
  measureRegex,
  numberRegex,
  planSearchAttempts,
  SEARCH_JOINS,
  SEARCH_WITH
} from '../../modules/catalog/catalog-search.js';
import { parseSearch } from '../../modules/catalog/search-parser.js';
import { getAliasIndex } from '../../modules/attributes/attribute.repository.js';
import botRoutes from '../../modules/bot/bot.routes.js';
import catalogRoutes from '../../modules/catalog/catalog.routes.js';
import { errorHandler } from '../../shared/middleware/error.middleware.js';
import { camelCaseResponse } from '../../shared/middleware/camel-case.middleware.js';
import { env } from '../../env.js';
import { createTestProduct, lettersSuffix, uniqueSuffix } from '../helpers.js';

const NO_ALIASES = { terms: new Map<string, string>() };
const idsOf = (result: { products: Array<{ id: string }> }) => result.products.map((p) => p.id);
/** Ids de `result` que pertenecen a `wanted`, en el orden del resultado. */
const onlyIds = (result: { products: Array<{ id: string }> }, wanted: string[]) =>
  idsOf(result).filter((id) => wanted.includes(id));

describe('catalog-search: builder puro', () => {
  it('escapeLike escapa %, _ y la barra invertida', () => {
    expect(escapeLike(String.raw`100%_a\b`)).toBe(String.raw`100\%\_a\\b`);
  });

  it('numberRegex arma la regex solo con el número (entero o decimal con [.,])', () => {
    expect(numberRegex(20)).toBe(String.raw`(?<![0-9])(?<![0-9][.,])20(?![.,]?[0-9])`);
    expect(numberRegex(1.5)).toBe(String.raw`(?<![0-9])(?<![0-9][.,])1[.,]5(?![.,]?[0-9])`);
    expect(numberRegex(Number.POSITIVE_INFINITY)).toBeNull();
    expect(numberRegex(1e21)).toBeNull();
  });

  it('digitsRegex conserva los dígitos tal cual y rechaza lo que no sea dígitos', () => {
    expect(digitsRegex('0042')).toBe(String.raw`(?<![0-9])(?<![0-9][.,])0042(?![.,]?[0-9])`);
    expect(digitsRegex('12a4')).toBeNull();
  });

  it('measureRegex acepta cualquier separador entre los dos números', () => {
    expect(measureRegex(40, 50)).toBe(
      String.raw`(?<![0-9])(?<![0-9][.,])40\s*[x×*/]\s*50(?![.,]?[0-9])`
    );
  });

  it('búsqueda vacía o solo stopwords: sin intentos (se comporta como sin búsqueda)', () => {
    expect(planSearchAttempts(parseSearch('', NO_ALIASES))).toEqual([]);
    expect(planSearchAttempts(parseSearch('hola, quiero... ¿?', NO_ALIASES))).toEqual([]);
    expect(planSearchAttempts(parseSearch('%_%', NO_ALIASES))).toEqual([]);
  });

  it('"4050 camiseta": exacto con el número, exacto con 40x50 y recién después relajado', () => {
    expect(planSearchAttempts(parseSearch('4050 camiseta', NO_ALIASES))).toEqual([
      {
        mode: 'exact',
        tokens: [
          { kind: 'word', word: 'camiseta' },
          { kind: 'digits', digits: '4050' }
        ]
      },
      {
        mode: 'exact',
        tokens: [
          { kind: 'word', word: 'camiseta' },
          { kind: 'measure', a: 40, b: 50 }
        ]
      },
      {
        mode: 'relaxed',
        tokens: [
          { kind: 'word', word: 'camiseta' },
          { kind: 'digits', digits: '4050' },
          { kind: 'measure', a: 40, b: 50 }
        ]
      }
    ]);
  });

  it('un número de 4 dígitos conserva los ceros a la izquierda ("0042")', () => {
    const [exact, asMeasure] = planSearchAttempts(parseSearch('0042', NO_ALIASES));
    expect(exact.tokens).toEqual([{ kind: 'digits', digits: '0042' }]);
    expect(asMeasure.tokens).toEqual([{ kind: 'measure', a: 0, b: 42 }]);
  });

  it('sin palabras significativas (>= 3 letras) no hay modo relajado', () => {
    const attempts = planSearchAttempts(parseSearch('x no 40x50', NO_ALIASES));
    expect(attempts.map((a) => a.mode)).toEqual(['exact']);
  });

  it('una sola palabra y nada más: el relajado sería igual al exacto y se omite', () => {
    expect(planSearchAttempts(parseSearch('camiseta', NO_ALIASES)).map((a) => a.mode)).toEqual([
      'exact'
    ]);
    // Con otro término (aunque no filtre en el relajado) el relajado sí es más amplio
    expect(planSearchAttempts(parseSearch('camiseta zz', NO_ALIASES)).map((a) => a.mode)).toEqual([
      'exact',
      'relaxed'
    ]);
  });

  it('buildSearchSql: el número de 4 dígitos busca en el nombre y en el SKU (escapado)', () => {
    const sql = buildSearchSql({ mode: 'exact', tokens: [{ kind: 'digits', digits: '0042' }] }, 1);
    expect(sql.params).toEqual([digitsRegex('0042'), '%0042%']);
    expect(sql.where).toContain('p.sku ILIKE $2');
    expect(sql.score).toContain('THEN 3');
  });

  it('palabras repetidas o en plural/singular cuentan una sola vez', () => {
    const [exact] = planSearchAttempts(parseSearch('bolsa bolsas BOLSA', NO_ALIASES));
    expect(exact.tokens).toEqual([{ kind: 'word', word: 'bolsa' }]);
  });

  it('un texto largo se acota a MAX_SEARCH_TERMS términos por tipo', () => {
    const words = Array.from({ length: 20 }, (_, i) => `palabra${String.fromCharCode(97 + i)}`);
    const measures = Array.from({ length: 30 }, (_, i) => `${i + 1}x${i + 2}`);
    const [exact] = planSearchAttempts(
      parseSearch(`${words.join(' ')} ${measures.join(' ')}`, NO_ALIASES)
    );
    const count = (kind: string) => exact.tokens.filter((t) => t.kind === kind).length;
    expect(count('word')).toBe(MAX_SEARCH_TERMS);
    expect(count('measure')).toBe(MAX_SEARCH_TERMS);
  });

  it('buildSearchSql: placeholders desde el índice pedido y texto solo en los parámetros', () => {
    const sql = buildSearchSql(
      {
        mode: 'exact',
        tokens: [
          { kind: 'word', word: 'a%b' },
          { kind: 'measure', a: 40, b: 50 }
        ]
      },
      4
    );
    expect(sql.params[0]).toBe(String.raw`%a\%b%`);
    expect(sql.params).toContain(measureRegex(40, 50));
    expect(sql.where).toContain('$4');
    expect(sql.where).not.toContain('$3');
    expect(sql.where).not.toContain('a%b');
    expect(sql.where).toContain(' AND ');
  });

  it('buildSearchSql relajado: exige al menos una palabra significativa (OR)', () => {
    const sql = buildSearchSql(
      {
        mode: 'relaxed',
        tokens: [
          { kind: 'word', word: 'camiseta' },
          { kind: 'word', word: 'zz' },
          { kind: 'measure', a: 40, b: 50 }
        ]
      },
      1
    );
    // Solo "camiseta" entra al WHERE; "zz" y la medida suman en `matched` pero no filtran
    expect(sql.where).toContain('$1');
    expect(sql.where).not.toContain('$2');
    expect(sql.matched).toContain('$2');
  });
});

describe('getAliasIndex', () => {
  it('resuelve clave, label, unidad (µm → um) y alias a la clave del atributo', async () => {
    const index = await getAliasIndex();
    expect(index.terms.get('micrones')).toBe('micrones');
    expect(index.terms.get('mic')).toBe('micrones');
    expect(index.terms.get('um')).toBe('micrones');
    expect(index.terms.get('litros')).toBe('capacidad');
    // Unidad compartida (ancho/alto/profundidad en cm): gana la de menor display_order
    expect(index.terms.get('cm')).toBe('ancho');
  });
});

describe('findPublicProducts: búsqueda', () => {
  it('sin búsqueda: search_mode null', async () => {
    const result = await findPublicProducts({ limit: 1 });
    expect(result.search_mode).toBeNull();
  });

  it('encuentra por tag del producto', async () => {
    const product = await createTestProduct({
      name: `Bolsa Residuos ${lettersSuffix()}`,
      tags: ['consorcio']
    });
    const result = await findPublicProducts({ search: 'consorcio', limit: 100 });
    expect(idsOf(result)).toContain(product.id);
    expect(result.search_mode).toBe('exact');
  });

  it('encuentra por tag de la categoría', async () => {
    const product = await createTestProduct({
      name: `Bolsa Residuos ${lettersSuffix()}`,
      categoryTags: ['consorcio']
    });
    const result = await findPublicProducts({ search: 'consorcio', limit: 100 });
    expect(idsOf(result)).toContain(product.id);
  });

  it('encuentra por tag de una categoría ancestro', async () => {
    const tag = lettersSuffix();
    const product = await createTestProduct({ name: `Bolsa Residuos ${lettersSuffix()}` });
    const parentSlug = `vitest-parent-${uniqueSuffix()}`;
    const parent = await query<{ id: string }>(
      'INSERT INTO categories (name, slug, is_active, tags) VALUES ($1, $1, true, $2) RETURNING id',
      [parentSlug, [tag]]
    );
    await query('UPDATE categories SET parent_id = $1 WHERE id = $2', [
      parent.rows[0].id,
      product.categoryId
    ]);

    const result = await findPublicProducts({ search: tag });
    expect(idsOf(result)).toEqual([product.id]);
  });

  it('medida en el nombre: "bolsas camiseta 40 x 50" (plural y separador con espacios)', async () => {
    const product = await createTestProduct({ name: `Bolsa Camiseta 40x50 ${lettersSuffix()}` });
    const result = await findPublicProducts({ search: 'bolsas camiseta 40 x 50', limit: 50 });
    expect(idsOf(result)).toContain(product.id);
    expect(result.search_mode).toBe('exact');
  });

  it('fallback "4050": "4050 camiseta" encuentra la 40x50 en modo exacto', async () => {
    const token = lettersSuffix();
    const product = await createTestProduct({ name: `Bolsa Camiseta 40x50 ${token}` });

    const broad = await findPublicProducts({ search: '4050 camiseta', limit: 50 });
    expect(idsOf(broad)).toContain(product.id);
    expect(broad.search_mode).toBe('exact');

    const narrow = await findPublicProducts({ search: `4050 camiseta ${token}` });
    expect(idsOf(narrow)).toEqual([product.id]);
    expect(narrow.total).toBe(1);
    expect(narrow.search_mode).toBe('exact');
  });

  it('medida por atributos ancho/alto, en cualquier orden', async () => {
    const token = lettersSuffix();
    const product = await createTestProduct({
      name: `Bolsa Freezer ${token}`,
      attributes: [
        { key: 'ancho', value: 25 },
        { key: 'alto', value: 35 }
      ]
    });
    for (const measure of ['25x35', '35 x 25']) {
      const result = await findPublicProducts({ search: `${token} ${measure}` });
      expect(idsOf(result)).toEqual([product.id]);
      expect(result.search_mode).toBe('exact');
    }
  });

  it('atributo micrones=20 sin "20" en el nombre: "film 20 mic" sí, "film 30 mic" no', async () => {
    const token = lettersSuffix();
    const product = await createTestProduct({
      name: `Film Stretch ${token}`,
      attributes: [{ key: 'micrones', value: 20 }]
    });

    const broad = await findPublicProducts({ search: 'film 20 mic', limit: 50 });
    expect(idsOf(broad)).toContain(product.id);
    expect(broad.search_mode).toBe('exact');

    const narrow = await findPublicProducts({ search: `film 20 mic ${token}` });
    expect(idsOf(narrow)).toEqual([product.id]);
    expect(narrow.search_mode).toBe('exact');

    // Con 30 mic no hay coincidencia exacta (el token solo existe en este producto): solo
    // aparece por el modo relajado, que el bot muestra como "no encontré exactamente eso"
    const wrong = await findPublicProducts({ search: `film 30 mic ${token}` });
    expect(wrong.search_mode).toBe('relaxed');
  });

  it('stopwords: "hola quiero bolsas camiseta" es una búsqueda exacta que lo encuentra', async () => {
    const product = await createTestProduct({ name: `Bolsa Camiseta 40x50 ${lettersSuffix()}` });
    const result = await findPublicProducts({ search: 'hola quiero bolsas camiseta', limit: 50 });
    expect(result.search_mode).toBe('exact');
    expect(idsOf(result)).toContain(product.id);
  });

  it('modo relajado: "camiseta inexistentezz" devuelve las camisetas', async () => {
    const product = await createTestProduct({ name: `Bolsa Camiseta 40x50 ${lettersSuffix()}` });
    const result = await findPublicProducts({ search: 'camiseta inexistentezz', limit: 50 });
    expect(result.search_mode).toBe('relaxed');
    expect(idsOf(result)).toContain(product.id);
  });

  it('modo relajado: primero el que coincide con más palabras', async () => {
    const token = lettersSuffix();
    const product = await createTestProduct({ name: `Bolsa Camiseta 40x50 ${token}` });
    const result = await findPublicProducts({
      search: `camiseta ${token} inexistentezz`,
      limit: 50
    });
    expect(result.search_mode).toBe('relaxed');
    expect(idsOf(result)[0]).toBe(product.id);
  });

  it('sin resultados en ningún intento: search_mode exact (relaxed solo si trajo algo)', async () => {
    const result = await findPublicProducts({ search: `${lettersSuffix()} ${lettersSuffix()}` });
    expect(result).toMatchObject({ products: [], total: 0, search_mode: 'exact' });
  });

  describe('SKU con números de 4 dígitos', () => {
    /** Producto de test cuyo SKU termina en `digits` (sigue empezando en VITEST- para el cleanup). */
    async function createWithSku(digits: string, name = `Balde ${lettersSuffix()}`) {
      const product = await createTestProduct({ name });
      const sku = `VITEST-${lettersSuffix().toUpperCase()}-${digits}`;
      await query('UPDATE products SET sku = $1 WHERE id = $2', [sku, product.id]);
      return { ...product, sku };
    }

    it('"0042" encuentra el SKU …-0042 (ceros a la izquierda) y no el …-4200', async () => {
      const withZeros = await createWithSku('0042');
      const without = await createWithSku('4200');
      const result = await findPublicProducts({ search: '0042', limit: 100 });
      expect(onlyIds(result, [withZeros.id, without.id])).toEqual([withZeros.id]);
      expect(result.search_mode).toBe('exact');
    });

    it('"<palabra> 1234" con 1234 en el SKU: modo exacto y lo encuentra', async () => {
      const token = lettersSuffix();
      const product = await createWithSku('1234', `Balde ${token}`);

      const result = await findPublicProducts({ search: `${token} 1234` });
      expect(idsOf(result)).toEqual([product.id]);
      expect(result.search_mode).toBe('exact');

      // El SKU completo tal cual se escribe ("VITEST-XXXX-1234") también es exacto
      const bySku = await findPublicProducts({ search: product.sku });
      expect(idsOf(bySku)).toEqual([product.id]);
      expect(bySku.search_mode).toBe('exact');
    });
  });

  describe('relevancia', () => {
    async function createPair() {
      const token = lettersSuffix();
      // Por nombre (featured → name ASC) "Abrojo" saldría antes que "Zeta"; la relevancia lo invierte
      const byName = await createTestProduct({ name: `Zeta Balde ${token}`, costPrice: 5000 });
      const byTag = await createTestProduct({
        name: `Abrojo ${lettersSuffix()}`,
        tags: [token],
        costPrice: 100
      });
      return { token, byName, byTag };
    }

    it('sin sort: el que coincide en el nombre sale antes que el que coincide solo por tag', async () => {
      const { token, byName, byTag } = await createPair();
      const result = await findPublicProducts({ search: token });
      expect(idsOf(result)).toEqual([byName.id, byTag.id]);
      expect(result.total).toBe(2);
    });

    it('con sort featured también ordena por relevancia', async () => {
      const { token, byName, byTag } = await createPair();
      const result = await findPublicProducts({ search: token, sort: 'featured' });
      expect(idsOf(result)).toEqual([byName.id, byTag.id]);
    });

    it('con sort explícito (price_asc) se respeta el precio', async () => {
      // El más barato es el último por nombre Y por relevancia (solo coincide por tag): si el
      // orden cayera en relevancia o en nombre, saldría segundo
      const token = lettersSuffix();
      const expensive = await createTestProduct({ name: `Abrojo Balde ${token}`, costPrice: 5000 });
      const cheap = await createTestProduct({
        name: `Zeta ${lettersSuffix()}`,
        tags: [token],
        costPrice: 100
      });
      const result = await findPublicProducts({ search: token, sort: 'price_asc' });
      expect(idsOf(result)).toEqual([cheap.id, expensive.id]);
      // Control: sin sort explícito el mismo par sale en el otro orden
      const byRelevance = await findPublicProducts({ search: token });
      expect(idsOf(byRelevance)).toEqual([expensive.id, cheap.id]);
    });

    it('la paginación respeta la relevancia y el total', async () => {
      const { token, byName, byTag } = await createPair();
      const page1 = await findPublicProducts({ search: token, limit: 1, page: 1 });
      const page2 = await findPublicProducts({ search: token, limit: 1, page: 2 });
      expect([...idsOf(page1), ...idsOf(page2)]).toEqual([byName.id, byTag.id]);
      expect(page1.total).toBe(2);
      expect(page2.total).toBe(2);
    });
  });

  describe('entradas hostiles', () => {
    it('"100%" no rompe', async () => {
      await expect(findPublicProducts({ search: '100%' })).resolves.toBeDefined();
    });

    it('% y _ se toman literales: "<token>%_" encuentra solo ese producto', async () => {
      const token = lettersSuffix();
      const product = await createTestProduct({ name: `Balde ${token}` });
      const other = await createTestProduct({ name: `Balde ${lettersSuffix()}` });
      for (const search of [`${token}%_`, `_${token}%`, `%' OR 1=1 -- ${token}`]) {
        const result = await findPublicProducts({ search, limit: 50 });
        expect(onlyIds(result, [product.id, other.id])).toEqual([product.id]);
      }
    });

    it('un comodín que llegara al SQL se escapa: "%" y "_" no coinciden con todo', async () => {
      const total = await query<{ n: string }>('SELECT COUNT(*) AS n FROM products p');
      for (const word of ['%', '_']) {
        const sql = buildSearchSql({ mode: 'exact', tokens: [{ kind: 'word', word }] }, 1);
        const matched = await query<{ n: string }>(
          `${SEARCH_WITH} SELECT COUNT(*) AS n FROM products p ${SEARCH_JOINS} WHERE ${sql.where}`,
          sql.params
        );
        expect(Number(matched.rows[0].n)).toBeLessThan(Number(total.rows[0].n));
      }
    });

    it('solo signos: se comporta como sin búsqueda (search_mode null)', async () => {
      const result = await findPublicProducts({ search: '%', limit: 1 });
      expect(result.search_mode).toBeNull();
      expect(result.total).toBeGreaterThan(0);
    });
  });
});

describe('API: searchMode en el listado del bot', () => {
  const API_KEY = 's'.repeat(64);
  let server: Server;
  let origin: string;

  beforeAll(async () => {
    env.BOT_API_KEYS.push(API_KEY);
    const app = express();
    app.use(express.json());
    app.use(camelCaseResponse);
    app.use('/api/bot', botRoutes);
    app.use('/api/catalog', catalogRoutes);
    app.use(errorHandler);
    await new Promise<void>((resolve) => {
      server = app.listen(0, resolve);
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    env.BOT_API_KEYS.splice(env.BOT_API_KEYS.indexOf(API_KEY), 1);
    await new Promise((resolve) => server.close(resolve));
  });

  interface ListBody {
    data: Array<{ id: string }>;
    pagination: unknown;
    searchMode?: string | null;
  }

  async function get(path: string) {
    const response = await fetch(`${origin}${path}`, { headers: { 'x-api-key': API_KEY } });
    return { status: response.status, body: (await response.json()) as ListBody };
  }

  it('exacto: searchMode "exact" fuera de pagination', async () => {
    const token = lettersSuffix();
    const product = await createTestProduct({ name: `Balde ${token}` });
    const { status, body } = await get(`/api/bot/catalog/products?search=${token}`);
    expect(status).toBe(200);
    expect(body.searchMode).toBe('exact');
    expect(body.data.map((p) => p.id)).toEqual([product.id]);
    expect(body.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
      hasMore: false
    });
  });

  it('relajado: searchMode "relaxed"', async () => {
    const token = lettersSuffix();
    const product = await createTestProduct({ name: `Balde ${token}` });
    const { body } = await get(
      `/api/bot/catalog/products?search=${encodeURIComponent(`${token} inexistentezz`)}`
    );
    expect(body.searchMode).toBe('relaxed');
    expect(body.data[0].id).toBe(product.id);
  });

  it('sin búsqueda: searchMode null', async () => {
    const { body } = await get('/api/bot/catalog/products?limit=1');
    expect(body).toHaveProperty('searchMode', null);
  });

  it('search=100% responde 200 en el bot y en el catálogo web', async () => {
    const bot = await get(`/api/bot/catalog/products?search=${encodeURIComponent('100%')}`);
    expect(bot.status).toBe(200);
    const web = await fetch(`${origin}/api/catalog/products?search=${encodeURIComponent('100%')}`);
    expect(web.status).toBe(200);
  });
});
