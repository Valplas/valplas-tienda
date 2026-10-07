import { describe, it, expect } from 'vitest';
import { normalizePhone } from '../../shared/utils/phone.js';

describe('normalizePhone', () => {
  it('mantiene un número ya en E.164', () => {
    expect(normalizePhone('+5491122334455')).toBe('+5491122334455');
  });

  it('normaliza formato local argentino', () => {
    expect(normalizePhone('11 4123-4567')).toBe('+541141234567');
  });

  it('devuelve null para valores inválidos', () => {
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('123')).toBeNull();
  });
});
