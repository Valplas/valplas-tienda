// apps/api/src/tests/users/normalize-street.test.ts
//
// normalize_street() (migración 040) es la base del matching de duplicados por dirección.

import { describe, it, expect } from 'vitest';
import { query } from '../../infrastructure/database/client.js';

describe('normalize_street', () => {
  it.each([
    ['Av. Corrientes', 'corrientes'],
    ['AVENIDA  Rivadavia', 'rivadavia'],
    ['Avda Gaona', 'gaona'],
    ['Calle San Martín', 'san martin'],
    ['Pje. Los Álamos', 'los alamos'],
    ['  Belgrano  ', 'belgrano'],
    ['Avellaneda', 'avellaneda']
  ])('normalize_street(%s) = %s', async (input, expected) => {
    const result = await query<{ n: string }>('SELECT normalize_street($1) AS n', [input]);
    expect(result.rows[0].n).toBe(expected);
  });

  it('devuelve string vacío para NULL', async () => {
    const result = await query<{ n: string }>('SELECT normalize_street(NULL) AS n');
    expect(result.rows[0].n).toBe('');
  });
});
