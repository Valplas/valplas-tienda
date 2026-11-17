import { describe, it, expect } from 'vitest';
import { normalizePhone, phoneMatchKey } from '../../shared/utils/phone.js';
import { query } from '../../infrastructure/database/client.js';

describe('normalizePhone', () => {
  it('mantiene un número ya en E.164', () => {
    expect(normalizePhone('+5491122334455')).toBe('+5491122334455');
  });

  it('normaliza formato local argentino', () => {
    expect(normalizePhone('11 4123-4567')).toBe('+541141234567');
  });

  it('acepta el wa_id de WhatsApp (dígitos con código de país, sin +)', () => {
    expect(normalizePhone('5491141234567')).toBe('+5491141234567');
  });

  it('normaliza el formato con 0 y 15 al celular con 9', () => {
    expect(normalizePhone('011 15 4123-4567')).toBe('+5491141234567');
  });

  it('devuelve null para valores inválidos', () => {
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('123')).toBeNull();
  });
});

describe('phoneMatchKey', () => {
  it('iguala el mismo celular con y sin el 9 de móvil', () => {
    expect(phoneMatchKey('+5491141234567')).toBe('+541141234567');
    expect(phoneMatchKey('+541141234567')).toBe('+541141234567');
  });

  it('coincide con la función SQL phone_match_key (migración 050)', async () => {
    const samples = ['+5491141234567', '+541141234567', '+5493511234567', '+12025550123'];
    const result = await query<{ input: string; key: string }>(
      'SELECT input, phone_match_key(input) AS key FROM unnest($1::text[]) AS input',
      [samples]
    );
    for (const row of result.rows) {
      expect(row.key).toBe(phoneMatchKey(row.input));
    }
  });
});
