// apps/web/src/lib/services/settings.service.ts

import { get, del, postFormData } from '../api';
import { CACHE_TAGS } from '../cache-tags';
import type { StoreSettings } from '@/types';

// La API revalida el tag al cambiar el logo; el TTL es solo red de seguridad.
const SETTINGS_REVALIDATE_SECONDS = 3600;

const EMPTY_SETTINGS: StoreSettings = { logoUrl: null, logoWidth: null, logoHeight: null };

/**
 * Configuración pública de la tienda. Nunca lanza: si la API falla el header
 * muestra el nombre en texto.
 */
export async function getStoreSettings(): Promise<StoreSettings> {
  try {
    const res = await get<{ settings: StoreSettings }>('/settings', {
      silentErrors: true,
      next: { tags: [CACHE_TAGS.STORE_SETTINGS], revalidate: SETTINGS_REVALIDATE_SECONDS }
    });
    return res.success && res.data ? res.data.settings : EMPTY_SETTINGS;
  } catch (error) {
    console.error('Error loading store settings:', error);
    return EMPTY_SETTINGS;
  }
}

/** Versión para el backoffice: sin cache, para ver el estado real al editar. */
export async function getAdminStoreSettings(): Promise<StoreSettings> {
  const res = await get<{ settings: StoreSettings }>('/settings', { cache: 'no-store' });
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? 'Error al cargar la configuración');
  }
  return res.data.settings;
}

export async function uploadStoreLogo(file: File): Promise<StoreSettings> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await postFormData<{ settings: StoreSettings }>('/settings/logo', formData);
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Error al subir el logo');
  return res.data.settings;
}

export async function deleteStoreLogo(): Promise<StoreSettings> {
  const res = await del<{ settings: StoreSettings }>('/settings/logo');
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Error al quitar el logo');
  return res.data.settings;
}
