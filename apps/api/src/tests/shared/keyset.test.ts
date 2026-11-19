// apps/api/src/tests/shared/keyset.test.ts

import { describe, it, expect } from 'vitest';
import {
  encodeCursor,
  decodeCursor,
  keysetPredicate,
  sliceKeysetPage,
  tsKey
} from '../../shared/utils/keyset.js';
import { query } from '../../infrastructure/database/client.js';

describe('cursor', () => {
  it('hace round-trip de los valores', () => {
    const cursor = encodeCursor('created_desc', ['2026-10-20T03:10:00.123456Z', 'abc']);
    expect(decodeCursor(cursor, 'created_desc', 2)).toEqual(['2026-10-20T03:10:00.123456Z', 'abc']);
  });

  it('es opaco y apto para URL', () => {
    const cursor = encodeCursor('x', ['a+b/c=d']);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rechaza un cursor de otro orden', () => {
    const cursor = encodeCursor('name_asc', ['a', 'b']);
    expect(() => decodeCursor(cursor, 'created_desc', 2)).toThrowError(
      expect.objectContaining({ code: 'INVALID_CURSOR', statusCode: 400 })
    );
  });

  it('rechaza basura, cantidad de valores incorrecta y tipos no string', () => {
    expect(() => decodeCursor('no-es-base64-json', 's', 1)).toThrow();
    expect(() => decodeCursor(encodeCursor('s', ['a']), 's', 2)).toThrow();
    const nonString = Buffer.from(JSON.stringify({ s: 's', v: [1] })).toString('base64url');
    expect(() => decodeCursor(nonString, 's', 1)).toThrow();
  });
});

describe('keysetPredicate', () => {
  it('descendente usa < y casts por columna', () => {
    expect(keysetPredicate(['o.created_at', 'o.id'], 'DESC', ['timestamptz', 'uuid'], 3)).toBe(
      '(o.created_at, o.id) < ($3::timestamptz, $4::uuid)'
    );
  });

  it('ascendente usa >', () => {
    expect(keysetPredicate(['p.name', 'p.id'], 'ASC', ['text', 'uuid'], 1)).toBe(
      '(p.name, p.id) > ($1::text, $2::uuid)'
    );
  });

  it('exige columnas y tipos de igual longitud', () => {
    expect(() => keysetPredicate(['a'], 'ASC', ['text', 'uuid'], 1)).toThrow();
  });
});

describe('sliceKeysetPage', () => {
  it('detecta la fila extra como hasMore y la descarta', () => {
    expect(sliceKeysetPage([1, 2, 3], 2)).toEqual({ rows: [1, 2], hasMore: true });
    expect(sliceKeysetPage([1, 2], 2)).toEqual({ rows: [1, 2], hasMore: false });
    expect(sliceKeysetPage([], 2)).toEqual({ rows: [], hasMore: false });
  });
});

describe('tsKey (contra la DB)', () => {
  it('conserva los microsegundos y vuelve a timestamptz sin pérdida', async () => {
    const result = await query<{ key: string; same: boolean }>(
      `WITH t AS (SELECT TIMESTAMPTZ '2026-10-20 03:10:00.123456+00' AS ts)
       SELECT ${tsKey('ts')} AS key, (${tsKey('ts')})::timestamptz = ts AS same FROM t`
    );
    expect(result.rows[0].key).toBe('2026-10-20T03:10:00.123456Z');
    expect(result.rows[0].same).toBe(true);
  });
});
