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

// Mismo celular AMBA en todos los formatos en que aparece guardado
const SAME_NUMBER = [
  '+5491141234567', // WhatsApp / E.164 móvil
  '+541141234567', // E.164 sin 9 (cargado a mano y normalizado)
  '5491141234567', // wa_id sin +
  '1141234567', // crudo, 10 dígitos
  '11 4123-4567',
  '011 4123-4567',
  '01141234567',
  '011 15 4123-4567',
  '11 15 4123 4567',
  '0054 9 11 4123-4567'
];

describe('phoneMatchKey', () => {
  it('lleva todos los formatos del mismo número al nacional de 10 dígitos', () => {
    for (const phone of SAME_NUMBER) {
      expect(phoneMatchKey(phone), phone).toBe('1141234567');
    }
  });

  it('interior: con y sin 9 coincide; distingue números distintos', () => {
    expect(phoneMatchKey('+5493511234567')).toBe('3511234567');
    expect(phoneMatchKey('3511234567')).toBe('3511234567');
    expect(phoneMatchKey('1141234567')).not.toBe(phoneMatchKey('1141234568'));
  });

  it('no toca números de otros países', () => {
    expect(phoneMatchKey('+12025550123')).toBe('12025550123');
  });

  it('coincide con la función SQL phone_match_key (migración 052)', async () => {
    const samples = [
      ...SAME_NUMBER,
      '+5493511234567',
      '3511234567',
      '351 15 1234567',
      '41234567',
      '+12025550123',
      ''
    ];
    const result = await query<{ input: string; key: string }>(
      'SELECT input, phone_match_key(input) AS key FROM unnest($1::text[]) AS input',
      [samples]
    );
    for (const row of result.rows) {
      expect(row.key).toBe(phoneMatchKey(row.input));
    }
  });
});
