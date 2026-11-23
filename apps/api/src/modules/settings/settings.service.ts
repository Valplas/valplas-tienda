import { processImage, type MulterFile } from '../../shared/middleware/image-upload.middleware.js';
import {
  uploadImageObject,
  deleteImageObjectsBestEffort,
  getPublicUrl,
  buildImageFilename
} from '../../infrastructure/external/supabase-storage.js';
import {
  revalidateWebTags,
  WEB_CACHE_TAGS
} from '../../infrastructure/external/web-revalidation.js';
import * as settingsRepository from './settings.repository.js';
import type { StoreInfoInput } from './store-info.validator.js';

// Información del negocio (bot + admin). Snake_case: la respuesta pasa por camelCaseResponse.
export interface StoreInfo {
  business_hours: string | null;
  delivery_days: string[] | null;
  delivery_zones: string[] | null;
  minimum_order: number | null;
  free_shipping_from: number | null;
  payment_methods: string[] | null;
  transfer_details: {
    alias: string | null;
    cbu: string | null;
    holder: string | null;
    bank: string | null;
  } | null;
  pickup_address: string | null;
  price_list_url: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  additional_info: string | null;
  updated_at: Date;
}

const STORE_INFO_TTL_MS = 60_000;
let storeInfoCache: { value: StoreInfo; expiresAt: number } | null = null;

function toStoreInfo(row: settingsRepository.StoreInfoRow): StoreInfo {
  const hasTransfer = Boolean(
    row.transfer_alias || row.transfer_cbu || row.transfer_holder || row.transfer_bank
  );
  return {
    business_hours: row.business_hours,
    delivery_days: row.delivery_days,
    delivery_zones: row.delivery_zones,
    minimum_order: row.minimum_order,
    free_shipping_from: row.free_shipping_from,
    payment_methods: row.payment_methods,
    transfer_details: hasTransfer
      ? {
          alias: row.transfer_alias,
          cbu: row.transfer_cbu,
          holder: row.transfer_holder,
          bank: row.transfer_bank
        }
      : null,
    pickup_address: row.pickup_address,
    price_list_url: row.price_list_url,
    contact_phone: row.contact_phone,
    contact_email: row.contact_email,
    additional_info: row.additional_info,
    updated_at: row.updated_at
  };
}

export async function getStoreInfo(): Promise<StoreInfo> {
  if (storeInfoCache && storeInfoCache.expiresAt > Date.now()) return storeInfoCache.value;
  const value = toStoreInfo(await settingsRepository.getStoreInfoRow());
  storeInfoCache = { value, expiresAt: Date.now() + STORE_INFO_TTL_MS };
  return value;
}

export async function updateStoreInfo(
  input: StoreInfoInput,
  updatedBy: string
): Promise<StoreInfo> {
  const row = await settingsRepository.updateStoreInfoRow(input, updatedBy);
  storeInfoCache = null;
  return toStoreInfo(row);
}

// El header lo muestra a ~40px de alto; 800×400 sobra para pantallas de DPR 3
// incluso con logos muy horizontales.
const LOGO_LIMITS = { maxWidth: 800, maxHeight: 400 };

export interface PublicStoreSettings {
  logoUrl: string | null;
  logoWidth: number | null;
  logoHeight: number | null;
}

export async function getPublicSettings(): Promise<PublicStoreSettings> {
  const { logo } = await settingsRepository.getStoreSettings();
  return {
    logoUrl: logo?.url ?? null,
    logoWidth: logo?.width ?? null,
    logoHeight: logo?.height ?? null
  };
}

export async function uploadLogo(
  file: MulterFile,
  updatedBy: string
): Promise<PublicStoreSettings> {
  const { logo: previous } = await settingsRepository.getStoreSettings();

  const processed = await processImage(file.buffer, LOGO_LIMITS);
  const storagePath = `store/logo/${buildImageFilename(processed.width, processed.height)}`;
  await uploadImageObject(storagePath, processed.buffer, 'image/webp');

  try {
    await settingsRepository.updateLogo(
      {
        url: getPublicUrl(storagePath),
        storagePath,
        width: processed.width,
        height: processed.height
      },
      updatedBy
    );
  } catch (error) {
    await deleteImageObjectsBestEffort([storagePath], 'settings');
    throw error;
  }

  await deleteImageObjectsBestEffort([previous?.storagePath], 'settings');
  void revalidateWebTags([WEB_CACHE_TAGS.STORE_SETTINGS]);
  return getPublicSettings();
}

export async function deleteLogo(updatedBy: string): Promise<PublicStoreSettings> {
  const { logo: previous } = await settingsRepository.getStoreSettings();
  if (previous) {
    await settingsRepository.updateLogo(null, updatedBy);
    await deleteImageObjectsBestEffort([previous.storagePath], 'settings');
    void revalidateWebTags([WEB_CACHE_TAGS.STORE_SETTINGS]);
  }
  return getPublicSettings();
}
