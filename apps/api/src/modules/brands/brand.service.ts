import { AppError } from '../../shared/middleware/error.middleware.js';
import * as brandRepository from './brand.repository.js';
import type { CreateBrandData, UpdateBrandData, BrandFilters } from './brand.types.js';

export async function listBrands(filters: BrandFilters) {
  return brandRepository.findBrands(filters);
}

export async function getBrandById(id: string) {
  const brand = await brandRepository.findBrandById(id);
  if (!brand) {
    throw new AppError('BRAND_NOT_FOUND', 'Marca no encontrada', 404);
  }

  const productCount = await brandRepository.getProductCount(id);

  return { ...brand, productCount };
}

export async function getBrandBySlug(slug: string) {
  const brand = await brandRepository.findBrandBySlug(slug);
  if (!brand) {
    throw new AppError('BRAND_NOT_FOUND', 'Marca no encontrada', 404);
  }

  const productCount = await brandRepository.getProductCount(brand.id);

  return { ...brand, productCount };
}

export async function createBrand(data: CreateBrandData) {
  const slugExists = await brandRepository.slugExists(data.slug);
  if (slugExists) {
    throw new AppError('SLUG_ALREADY_EXISTS', 'El slug ya existe', 400);
  }

  return brandRepository.createBrand(data);
}

export async function updateBrand(id: string, data: UpdateBrandData) {
  await getBrandById(id);

  if (data.slug) {
    const slugExists = await brandRepository.slugExists(data.slug, id);
    if (slugExists) {
      throw new AppError('SLUG_ALREADY_EXISTS', 'El slug ya existe', 400);
    }
  }

  const updated = await brandRepository.updateBrand(id, data);
  if (!updated) {
    throw new AppError('BRAND_UPDATE_FAILED', 'No se pudo actualizar la marca', 500);
  }

  return updated;
}

export async function deleteBrand(id: string): Promise<void> {
  await getBrandById(id);

  const hasProducts = await brandRepository.hasProducts(id);
  if (hasProducts) {
    throw new AppError('BRAND_HAS_PRODUCTS', 'No se puede eliminar una marca con productos', 400);
  }

  await brandRepository.deleteBrand(id);
}
