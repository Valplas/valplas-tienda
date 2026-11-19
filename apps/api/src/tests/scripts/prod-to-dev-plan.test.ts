import { describe, it, expect } from 'vitest';
import {
  buildCopyPlan,
  dbIdentity,
  type SchemaSnapshot,
  type TableMeta
} from '../../infrastructure/database/scripts/prod-to-dev-plan.js';

function table(
  name: string,
  columns: Array<string | Partial<TableMeta['columns'][number]>>
): TableMeta {
  return {
    name,
    primaryKey: ['id'],
    columns: columns.map((col) =>
      typeof col === 'string'
        ? { name: col, generated: false, required: false }
        : { generated: false, required: false, name: '', ...col }
    )
  };
}

function schema(...tables: TableMeta[]): SchemaSnapshot {
  return new Map(tables.map((t) => [t.name, t]));
}

describe('buildCopyPlan', () => {
  it('copies the shared columns and lets dev-only columns take their default', () => {
    const source = schema(table('orders', ['id', 'total']));
    const target = schema(table('orders', ['id', 'total', 'sales_channel']));

    const plan = buildCopyPlan(source, target);

    expect(plan.errors).toEqual([]);
    expect(plan.copy).toEqual([
      {
        table: 'orders',
        columns: ['id', 'total'],
        defaulted: ['sales_channel'],
        primaryKey: ['id']
      }
    ]);
  });

  it('never inserts into generated columns', () => {
    const source = schema(
      table('order_items', ['id', 'qty', { name: 'revenue', generated: true }])
    );
    const target = schema(
      table('order_items', ['id', 'qty', { name: 'revenue', generated: true }])
    );

    const plan = buildCopyPlan(source, target);

    expect(plan.copy[0].columns).toEqual(['id', 'qty']);
    expect(plan.copy[0].defaulted).toEqual([]);
  });

  it('keeps schema_migrations untouched and empties refresh_tokens without copying it', () => {
    const tables = [table('schema_migrations', ['id']), table('refresh_tokens', ['id'])];
    const plan = buildCopyPlan(schema(...tables), schema(...tables));

    expect(plan.truncate).toEqual(['refresh_tokens']);
    expect(plan.copy).toEqual([]);
  });

  it('empties tables that only exist in dev', () => {
    const source = schema(table('orders', ['id']));
    const target = schema(table('orders', ['id']), table('outbound_webhook_events', ['id']));

    const plan = buildCopyPlan(source, target);

    expect(plan.errors).toEqual([]);
    expect(plan.truncate).toEqual(['orders', 'outbound_webhook_events']);
    expect(plan.targetOnly).toEqual(['outbound_webhook_events']);
    expect(plan.copy.map((c) => c.table)).toEqual(['orders']);
  });

  it('fails when prod has a table dev lacks (dev is missing migrations)', () => {
    const plan = buildCopyPlan(
      schema(table('orders', ['id']), table('coupons', ['id'])),
      schema(table('orders', ['id']))
    );

    expect(plan.errors).toEqual([expect.stringContaining('coupons')]);
  });

  it('fails when prod has a column dev lacks, instead of dropping data', () => {
    const plan = buildCopyPlan(
      schema(table('products', ['id', 'weight'])),
      schema(table('products', ['id']))
    );

    expect(plan.errors).toEqual([expect.stringContaining('products.weight')]);
  });

  it('fails when a dev-only column is NOT NULL without default', () => {
    const plan = buildCopyPlan(
      schema(table('users', ['id'])),
      schema(table('users', ['id', { name: 'tenant_id', required: true }]))
    );

    expect(plan.errors).toEqual([expect.stringContaining('users.tenant_id')]);
  });
});

describe('dbIdentity', () => {
  it('reads the Supabase project ref from the pooler user', () => {
    const id = dbIdentity(
      'postgres://postgres.abcdefghij:secret@aws-0-sa-east-1.pooler.supabase.com:5432/postgres'
    );

    expect(id.ref).toBe('abcdefghij');
  });

  it('reads the Supabase project ref from a direct connection host', () => {
    const id = dbIdentity('postgresql://postgres:secret@db.abcdefghij.supabase.co:5432/postgres');

    expect(id.ref).toBe('abcdefghij');
  });

  it('identifies the same database regardless of password or query params', () => {
    const a = dbIdentity('postgres://postgres.ref1:one@host.example.com:5432/postgres');
    const b = dbIdentity('postgres://postgres.ref1:two@HOST.example.com/postgres?sslmode=require');
    const c = dbIdentity('postgres://postgres.ref2:one@host.example.com:5432/postgres');

    expect(a.key).toBe(b.key);
    expect(a.key).not.toBe(c.key);
  });

  it('tells apart two local databases on the same host', () => {
    const a = dbIdentity('postgres://postgres:pw@localhost:5432/valplas');
    const b = dbIdentity('postgres://postgres:pw@localhost:5432/valplas_dev');

    expect(a.ref).not.toBe(b.ref);
  });

  it('never exposes the password', () => {
    const id = dbIdentity('postgres://postgres.ref1:supersecret@host.example.com:5432/postgres');

    expect(JSON.stringify(id)).not.toContain('supersecret');
  });
});
