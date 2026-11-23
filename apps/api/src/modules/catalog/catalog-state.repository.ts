import { query } from '../../infrastructure/database/client.js';

export interface CatalogState {
  version: number;
  updated_at: string;
}

export interface CatalogStatus {
  version: number;
  updated_at: string;
  store_info_updated_at: string;
}

/** Versión global del catálogo (la sube bump_catalog_version(), migración 055). */
export async function getCatalogState(): Promise<CatalogState> {
  const result = await query<{ version: string; updated_at: Date }>(
    'SELECT version, updated_at FROM catalog_state WHERE id = 1'
  );
  const row = result.rows[0];
  return { version: Number(row.version), updated_at: new Date(row.updated_at).toISOString() };
}

/** Versión del catálogo + última modificación de la info de la tienda, en una sola query. */
export async function getCatalogStatus(): Promise<CatalogStatus> {
  const result = await query<{
    version: string;
    updated_at: Date;
    store_info_updated_at: Date;
  }>(
    `SELECT cs.version, cs.updated_at, ss.updated_at AS store_info_updated_at
     FROM catalog_state cs
     CROSS JOIN store_settings ss
     WHERE cs.id = 1 AND ss.id = 1`
  );
  const row = result.rows[0];
  return {
    version: Number(row.version),
    updated_at: new Date(row.updated_at).toISOString(),
    store_info_updated_at: new Date(row.store_info_updated_at).toISOString()
  };
}
