// Si aparece una FK nueva a users, el merge tiene que decidir qué hacer con ella
// (mover, borrar o ignorar) y agregarla a MERGE_HANDLED_FOREIGN_KEYS.

import { describe, it, expect } from 'vitest';
import { query } from '../../infrastructure/database/client.js';
import { MERGE_HANDLED_FOREIGN_KEYS } from '../../modules/users/user-merge.repository.js';

describe('merge — guard de foreign keys', () => {
  it('maneja todas las FKs que apuntan a users', async () => {
    const result = await query<{ fk: string }>(
      `SELECT c.conrelid::regclass::text || '.' || a.attname AS fk
       FROM pg_constraint c
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
       WHERE c.contype = 'f' AND c.confrelid = 'public.users'::regclass`
    );
    expect(result.rows.map((r) => r.fk).sort()).toEqual([...MERGE_HANDLED_FOREIGN_KEYS].sort());
  });
});
