import { describe, it, expect } from 'vitest';
import {
  parseSearch,
  singularize,
  normalizeSearchText,
  SEARCH_STOPWORDS,
  type AttributeAliasIndex
} from '../../modules/catalog/search-parser.js';

// Mirrors migration 059 seed (key, unit, aliases)
const aliases: AttributeAliasIndex = {
  terms: new Map<string, string>([
    ...['micrones', 'micron', 'mic', 'micras', 'um'].map(
      (t) => [t, 'micrones'] as [string, string]
    ),
    ...['largo', 'm', 'metros', 'mts', 'mt'].map((t) => [t, 'largo'] as [string, string]),
    ...['gramaje', 'gr', 'grs', 'gramos'].map((t) => [t, 'gramaje'] as [string, string]),
    ...['capacidad', 'l', 'litros', 'lts', 'lt'].map((t) => [t, 'capacidad'] as [string, string]),
    ...['peso', 'kg'].map((t) => [t, 'peso'] as [string, string]),
    ...['ancho', 'cm'].map((t) => [t, 'ancho'] as [string, string])
  ])
};

describe('parseSearch', () => {
  it('extracts words without stopwords and the measure', () => {
    const r = parseSearch('Hola, quiero bolsas camiseta 40x50, cuánto salen?', aliases);
    expect(r.words).toEqual(['bolsas', 'camiseta']);
    expect(r.measures).toEqual([{ a: 40, b: 50 }]);
    expect(r.quantities).toEqual([]);
    expect(r.fourDigitCandidates).toEqual([]);
  });

  it.each(['40 x 50', '40×50', '40*50', '40/50', '40X50'])('measure separator %s', (input) => {
    const r = parseSearch(`bolsa ${input}`, aliases);
    expect(r.measures).toEqual([{ a: 40, b: 50 }]);
    expect(r.words).toEqual(['bolsa']);
  });

  it('parses comma decimals', () => {
    expect(parseSearch('20,5x30', aliases).measures).toEqual([{ a: 20.5, b: 30 }]);
  });

  it('does not treat a lone x-word as a separator', () => {
    const r = parseSearch('remera xl 40', aliases);
    expect(r.measures).toEqual([]);
    expect(r.words).toEqual(['remera', 'xl', '40']);
  });

  it.each(['film 20 micrones', 'film 20mic', 'film 20µm'])('quantity micrones %s', (input) => {
    const r = parseSearch(input, aliases);
    expect(r.quantities).toMatchObject([{ value: 20, attributeKey: 'micrones' }]);
    expect(r.words).toEqual(['film']);
  });

  it('maps "80 m" to largo', () => {
    const r = parseSearch('cinta 80 m', aliases);
    expect(r.quantities).toEqual([{ value: 80, attributeKey: 'largo', rawUnit: 'm' }]);
    expect(r.words).toEqual(['cinta']);
  });

  it('unit without attribute: pulgadas', () => {
    const r = parseSearch('tijera 6 pulgadas', aliases);
    expect(r.quantities).toEqual([{ value: 6, attributeKey: null, rawUnit: 'pulgadas' }]);
    expect(r.words).toEqual(['tijera']);
  });

  it('inch sign becomes pulgadas quantity', () => {
    const r = parseSearch('tijera 6"', aliases);
    expect(r.quantities).toMatchObject([{ value: 6, attributeKey: null }]);
    expect(r.words).toEqual(['tijera']);
  });

  it('bare 4-digit goes to candidates, not words', () => {
    const r = parseSearch('bolsa 4050', aliases);
    expect(r.fourDigitCandidates).toEqual([4050]);
    expect(r.fourDigitRaw).toEqual(['4050']);
    expect(r.words).toEqual(['bolsa']);
  });

  it('keeps the raw digits of a 4-digit number (leading zeros survive)', () => {
    const r = parseSearch('0042', aliases);
    expect(r.fourDigitCandidates).toEqual([42]);
    expect(r.fourDigitRaw).toEqual(['0042']);
  });

  it('keeps bare non-4-digit numbers as words', () => {
    const r = parseSearch('80x110 20 Uproll', aliases);
    expect(r.measures).toEqual([{ a: 80, b: 110 }]);
    expect(r.words).toEqual(['20', 'uproll']);
  });

  it('strips SQL wildcards and quotes', () => {
    expect(parseSearch('%_bolsa', aliases).words).toEqual(['bolsa']);
    expect(parseSearch("bol\\sa 'x' %", aliases).words).toEqual(['bol', 'sa', 'x']);
  });

  it('empty or only stopwords gives everything empty', () => {
    const empty = {
      words: [],
      measures: [],
      quantities: [],
      fourDigitCandidates: [],
      fourDigitRaw: []
    };
    expect(parseSearch('', aliases)).toEqual(empty);
    expect(parseSearch('   ', aliases)).toEqual(empty);
    expect(parseSearch('hola, quiero por favor gracias', { terms: new Map() }).words).toEqual([]);
    expect(parseSearch('Hola! buenas tardes, gracias', aliases)).toEqual({
      ...empty,
      words: []
    });
    expect(parseSearch('hola quiero gracias', aliases)).toEqual(empty);
  });
});

describe('parseSearch fix round 1', () => {
  it('drops a unit following a measure', () => {
    const r = parseSearch('bolsa 40x50 cm', aliases);
    expect(r.words).toEqual(['bolsa']);
    expect(r.measures).toEqual([{ a: 40, b: 50 }]);
    expect(r.quantities).toEqual([]);
  });

  it('removes greeting residue', () => {
    expect(parseSearch('buenas tardes, por favor bolsas', aliases).words).toEqual(['bolsas']);
    expect(parseSearch('buenos dias, buenas noches bolsas', aliases).words).toEqual(['bolsas']);
  });

  it('chained measure keeps first two dims and no x10 word', () => {
    const r = parseSearch('caja 40x50x10', aliases);
    expect(r.measures).toEqual([{ a: 40, b: 50 }]);
    expect(r.words).toEqual(['caja']);
  });

  it('caps long input quickly', () => {
    const start = Date.now();
    const r = parseSearch('bolsa 40x50 '.repeat(500), aliases);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(r.measures.length).toBeLessThanOrEqual(41);
    expect(r.words.every((w) => 'bolsa'.startsWith(w) || /^\d+$/.test(w))).toBe(true);
  });
});

describe('SEARCH_STOPWORDS', () => {
  it('includes required words', () => {
    const required =
      'hola quiero queria necesito tenes tienen hay precio precios cuanto cuesta sale salen vale de del la las el los un una unos unas para por con y o me mi que si porfa gracias buenas buen dia tarde'.split(
        ' '
      );
    for (const w of required) expect(SEARCH_STOPWORDS.has(w), w).toBe(true);
  });
});

describe('normalizeSearchText', () => {
  it('lowercases, strips accents and symbols', () => {
    expect(normalizeSearchText('  CUÁNTO  Salen?? %_ ')).toBe('cuanto salen');
  });
});

describe('singularize', () => {
  it.each([
    ['bolsas', 'bolsa'],
    ['baldes', 'balde'],
    ['rollos', 'rollo'],
    ['camisetas', 'camiseta'],
    ['cajas', 'caja'],
    ['bobinas', 'bobina'],
    ['papeles', 'papel'],
    ['cajones', 'cajon'],
    ['lentes', 'lente'],
    ['gas', 'gas'],
    ['las', 'las'],
    ['40', '40'],
    ['analisis', 'analisis']
  ])('%s -> %s', (input, expected) => {
    expect(singularize(input)).toBe(expected);
  });
});
