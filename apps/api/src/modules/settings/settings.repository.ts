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

export interface StoreInfoValues {
  business_hours: string | null;
  delivery_days: string[] | null;
  delivery_zones: string[] | null;
  minimum_order: number | null;
  free_shipping_from: number | null;
  payment_methods: string[] | null;
  transfer_alias: string | null;
  transfer_cbu: string | null;
  transfer_holder: string | null;
  transfer_bank: string | null;
  pickup_address: string | null;
  price_list_url: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  additional_info: string | null;
}

export interface StoreInfoRow extends StoreInfoValues {
  updated_at: Date;
}

const STORE_INFO_COLUMNS = `business_hours, delivery_days, delivery_zones, minimum_order,
  free_shipping_from, payment_methods, transfer_alias, transfer_cbu, transfer_holder,
  transfer_bank, pickup_address, price_list_url, contact_phone, contact_email,
  additional_info, updated_at`;

export async function getStoreInfoRow(): Promise<StoreInfoRow> {
  const result = await query<StoreInfoRow>(
    `SELECT ${STORE_INFO_COLUMNS} FROM store_settings WHERE id = 1`
  );
  return result.rows[0];
}

export async function updateStoreInfoRow(
  input: StoreInfoValues,
  updatedBy: string
): Promise<StoreInfoRow> {
  const result = await query<StoreInfoRow>(
    `UPDATE store_settings SET
       business_hours = $1, delivery_days = $2, delivery_zones = $3, minimum_order = $4,
       free_shipping_from = $5, payment_methods = $6, transfer_alias = $7, transfer_cbu = $8,
       transfer_holder = $9, transfer_bank = $10, pickup_address = $11, price_list_url = $12,
       contact_phone = $13, contact_email = $14, additional_info = $15, updated_by = $16
     WHERE id = 1
     RETURNING ${STORE_INFO_COLUMNS}`,
    [
      input.business_hours,
      input.delivery_days,
      input.delivery_zones,
      input.minimum_order,
      input.free_shipping_from,
      input.payment_methods,
      input.transfer_alias,
      input.transfer_cbu,
      input.transfer_holder,
      input.transfer_bank,
      input.pickup_address,
      input.price_list_url,
      input.contact_phone,
      input.contact_email,
      input.additional_info,
      updatedBy
    ]
  );
  return result.rows[0];
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
