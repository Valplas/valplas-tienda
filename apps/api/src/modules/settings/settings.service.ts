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
