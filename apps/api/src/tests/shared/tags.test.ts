import { describe, it, expect } from 'vitest';
import { normalizeTags, MAX_TAGS, MAX_TAG_LENGTH } from '../../shared/utils/tags.js';

describe('normalizeTags', () => {
  it('minúscula, trim, colapsa espacios, sin vacíos ni duplicados', () => {
    expect(normalizeTags([' Consorcio ', 'consorcio', '', 'Bolsa  Residuo'])).toEqual([
      'consorcio',
      'bolsa residuo'
    ]);
  });

  it('conserva el orden de la primera aparición', () => {
    expect(normalizeTags(['b', 'A', 'B', 'a', 'c'])).toEqual(['b', 'a', 'c']);
  });

  it('descarta strings de solo espacios y colapsa tabs/saltos de línea', () => {
    expect(normalizeTags(['   ', '\t', 'tel\tgopor\n  x'])).toEqual(['tel gopor x']);
  });

  it('lista vacía -> vacía', () => {
    expect(normalizeTags([])).toEqual([]);
  });

  it('expone los límites', () => {
    expect(MAX_TAGS).toBe(30);
    expect(MAX_TAG_LENGTH).toBe(40);
  });

  it('trunca defensivamente a 30 tags de 40 caracteres', () => {
    const many = Array.from({ length: 40 }, (_, i) => `t${i}`);
    expect(normalizeTags(many)).toHaveLength(30);
    expect(normalizeTags(['x'.repeat(60)])[0]).toHaveLength(40);
  });
});
