import { query } from '../../infrastructure/database/client.js';

export interface StoreLogo {
  url: string;
  storagePath: string;
  width: number;
  height: number;
}

export interface StoreSettingsRow {
  logo: StoreLogo | null;
}

interface RawStoreSettings {
  logo_url: string | null;
  logo_storage_path: string | null;
  logo_width: number | null;
  logo_height: number | null;
}

// store_settings tiene una sola fila (id = 1), creada en la migración 041.
export async function getStoreSettings(): Promise<StoreSettingsRow> {
  const result = await query<RawStoreSettings>(
    `SELECT logo_url, logo_storage_path, logo_width, logo_height
     FROM store_settings
     WHERE id = 1`
  );
  const row = result.rows[0];
  if (!row?.logo_url || !row.logo_storage_path) return { logo: null };

  return {
    logo: {
      url: row.logo_url,
      storagePath: row.logo_storage_path,
      width: row.logo_width ?? 0,
      height: row.logo_height ?? 0
    }
  };
}

export async function updateLogo(logo: StoreLogo | null, updatedBy: string): Promise<void> {
  await query(
    `UPDATE store_settings
     SET logo_url = $1, logo_storage_path = $2, logo_width = $3, logo_height = $4, updated_by = $5
     WHERE id = 1`,
    [
      logo?.url ?? null,
      logo?.storagePath ?? null,
      logo?.width ?? null,
      logo?.height ?? null,
      updatedBy
    ]
  );
}
