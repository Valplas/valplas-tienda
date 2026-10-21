import { randomUUID } from 'node:crypto';
import { AppError } from '../../shared/middleware/error.middleware.js';
import {
  processImage,
  type MulterFile,
  type ProcessImageOptions
} from '../../shared/middleware/image-upload.middleware.js';
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
import * as bannerRepository from './banner.repository.js';
import type { CreateBannerInput, UpdateBannerInput } from './banner.validator.js';
import type {
  AdminBanner,
  BannerImageData,
  BannerLinkTargets,
  BannerPagination
} from './banner.types.js';

type BannerVariant = 'desktop' | 'mobile';

// PC 3:1 a 2000px de ancho (≈2000×667). Celular 4:3: 1200px cubre pantallas
// de ~400px CSS con DPR 3; más grande solo pesa.
const IMAGE_LIMITS: Record<BannerVariant, ProcessImageOptions> = {
  desktop: { maxWidth: 2000, maxHeight: 2000 },
  mobile: { maxWidth: 1200, maxHeight: 1200 }
};

export interface BannerFiles {
  desktop: MulterFile;
  mobile?: MulterFile;
}

export async function listPublicBanners(pagination: BannerPagination) {
  return bannerRepository.findPublicBanners(pagination);
}

export async function listAdminBanners(pagination: BannerPagination) {
  return bannerRepository.findAdminBanners(pagination);
}

async function getAdminBannerOrThrow(id: string): Promise<AdminBanner> {
  const banner = await bannerRepository.findAdminBannerById(id);
  if (!banner) {
    throw new AppError('BANNER_NOT_FOUND', 'Banner no encontrado', 404);
  }
  return banner;
}

async function assertLinkTargetsExist(targets: Partial<BannerLinkTargets>): Promise<void> {
  if (!targets.linkCategoryId && !targets.linkBrandId && !targets.linkProductId) return;

  const found = await bannerRepository.countExistingLinkTargets(targets);
  if (targets.linkCategoryId && found.categories === 0) {
    throw new AppError('CATEGORY_NOT_FOUND', 'La categoría elegida no existe', 400);
  }
  if (targets.linkBrandId && found.brands === 0) {
    throw new AppError('BRAND_NOT_FOUND', 'La marca elegida no existe', 400);
  }
  if (targets.linkProductId && found.products === 0) {
    throw new AppError('PRODUCT_NOT_FOUND', 'El producto elegido no existe', 400);
  }
}

async function uploadBannerImage(
  bannerId: string,
  variant: BannerVariant,
  file: MulterFile
): Promise<BannerImageData> {
  const processed = await processImage(file.buffer, IMAGE_LIMITS[variant]);
  const storagePath = `banners/${bannerId}/${variant}_${buildImageFilename(processed.width, processed.height)}`;
  await uploadImageObject(storagePath, processed.buffer, 'image/webp');
  return {
    url: getPublicUrl(storagePath),
    storagePath,
    width: processed.width,
    height: processed.height
  };
}

/**
 * Sube PC + celular. Si falla a mitad de camino borra lo que alcanzó a subir
 * para no dejar objetos huérfanos.
 */
async function uploadBannerImages(bannerId: string, files: BannerFiles) {
  const desktop = await uploadBannerImage(bannerId, 'desktop', files.desktop);
  try {
    const mobile = files.mobile ? await uploadBannerImage(bannerId, 'mobile', files.mobile) : null;
    return { desktop, mobile };
  } catch (error) {
    await removeObjectsBestEffort([desktop.storagePath]);
    throw error;
  }
}

function removeObjectsBestEffort(paths: Array<string | null | undefined>): Promise<void> {
  return deleteImageObjectsBestEffort(paths, 'banners');
}

function revalidateBanners(): void {
  void revalidateWebTags([WEB_CACHE_TAGS.BANNERS]);
}

export async function createBanner(
  input: CreateBannerInput,
  files: BannerFiles,
  createdBy: string
): Promise<AdminBanner> {
  await assertLinkTargetsExist(input);

  const id = randomUUID();
  const { desktop, mobile } = await uploadBannerImages(id, files);

  try {
    await bannerRepository.insertBanner({
      id,
      ...input,
      desktop,
      mobile,
      displayOrder: await bannerRepository.getNextDisplayOrder(),
      createdBy
    });
  } catch (error) {
    await removeObjectsBestEffort([desktop.storagePath, mobile?.storagePath]);
    throw error;
  }

  revalidateBanners();
  return getAdminBannerOrThrow(id);
}

export async function updateBanner(id: string, input: UpdateBannerInput): Promise<AdminBanner> {
  const current = await getAdminBannerOrThrow(id);

  // El schema solo valida el rango si vienen ambas fechas; con una sola hay
  // que compararla contra la que ya tiene el banner.
  const startsAt = input.startsAt === undefined ? current.startsAt : input.startsAt;
  const endsAt = input.endsAt === undefined ? current.endsAt : input.endsAt;
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
    throw new AppError(
      'INVALID_DATE_RANGE',
      'La fecha "hasta" debe ser posterior a la fecha "desde"',
      400
    );
  }

  await assertLinkTargetsExist(input);
  await bannerRepository.updateBanner(id, input);

  revalidateBanners();
  return getAdminBannerOrThrow(id);
}

/**
 * Reemplaza ambas imágenes (el editor siempre produce el par PC + celular;
 * sin celular = se usa la de PC). Las viejas se borran recién después de
 * actualizar la fila.
 */
export async function replaceBannerImages(id: string, files: BannerFiles): Promise<AdminBanner> {
  const previous = await bannerRepository.findBannerStorage(id);
  if (!previous) {
    throw new AppError('BANNER_NOT_FOUND', 'Banner no encontrado', 404);
  }

  const { desktop, mobile } = await uploadBannerImages(id, files);

  let updated: boolean;
  try {
    updated = await bannerRepository.updateBannerImages(id, desktop, mobile);
  } catch (error) {
    await removeObjectsBestEffort([desktop.storagePath, mobile?.storagePath]);
    throw error;
  }

  if (!updated) {
    // Lo borraron entre la lectura y el UPDATE
    await removeObjectsBestEffort([desktop.storagePath, mobile?.storagePath]);
    throw new AppError('BANNER_NOT_FOUND', 'Banner no encontrado', 404);
  }

  await removeObjectsBestEffort([previous.desktopStoragePath, previous.mobileStoragePath]);

  revalidateBanners();
  return getAdminBannerOrThrow(id);
}

export async function reorderBanners(bannerIds: string[]): Promise<void> {
  const uniqueIds = new Set(bannerIds);
  const existingIds = await bannerRepository.findAllBannerIds();

  const sameSet =
    uniqueIds.size === bannerIds.length &&
    uniqueIds.size === existingIds.length &&
    existingIds.every((id) => uniqueIds.has(id));

  if (!sameSet) {
    throw new AppError(
      'INVALID_BANNER_IDS',
      'La lista debe incluir todos los banners exactamente una vez. Recargá la página e intentá de nuevo.',
      400
    );
  }

  await bannerRepository.reorderBanners(bannerIds);
  revalidateBanners();
}

export async function deleteBanner(id: string): Promise<void> {
  const storage = await bannerRepository.findBannerStorage(id);
  if (!storage) {
    throw new AppError('BANNER_NOT_FOUND', 'Banner no encontrado', 404);
  }

  await bannerRepository.softDeleteBanner(id);
  await removeObjectsBestEffort([storage.desktopStoragePath, storage.mobileStoragePath]);

  revalidateBanners();
}
