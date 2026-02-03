import { AppError } from '../../shared/middleware/error.middleware.js';
import * as categoryRepository from './category.repository.js';
import type {
  CategoryWithChildren,
  CreateCategoryData,
  UpdateCategoryData,
  ReorderCategoryData
} from './category.types.js';

export async function listCategories(): Promise<CategoryWithChildren[]> {
  const categories = await categoryRepository.findAllCategories();
  return categoryRepository.buildCategoryTree(categories);
}

export async function getCategoryById(id: string) {
  const category = await categoryRepository.findCategoryById(id);
  if (!category) {
    throw new AppError('CATEGORY_NOT_FOUND', 'Categoría no encontrada', 404);
  }

  const productCount = await categoryRepository.getProductCount(id);
  const allCategories = await categoryRepository.findAllCategories();
  const children = allCategories.filter((c) => c.parent_id === id);

  return { ...category, productCount, children };
}

export async function createCategory(data: CreateCategoryData) {
  const slugExists = await categoryRepository.slugExists(data.slug);
  if (slugExists) {
    throw new AppError('SLUG_ALREADY_EXISTS', 'El slug ya existe', 400);
  }

  if (data.parentId) {
    const parent = await categoryRepository.findCategoryById(data.parentId);
    if (!parent) {
      throw new AppError('PARENT_NOT_FOUND', 'Categoría padre no encontrada', 404);
    }
  }

  return categoryRepository.createCategory(data);
}

export async function updateCategory(id: string, data: UpdateCategoryData) {
  await getCategoryById(id);

  if (data.slug) {
    const slugExists = await categoryRepository.slugExists(data.slug, id);
    if (slugExists) {
      throw new AppError('SLUG_ALREADY_EXISTS', 'El slug ya existe', 400);
    }
  }

  if (data.parentId && data.parentId !== id) {
    const parent = await categoryRepository.findCategoryById(data.parentId);
    if (!parent) {
      throw new AppError('PARENT_NOT_FOUND', 'Categoría padre no encontrada', 404);
    }
  }

  const updated = await categoryRepository.updateCategory(id, data);
  if (!updated) {
    throw new AppError('CATEGORY_UPDATE_FAILED', 'No se pudo actualizar la categoría', 500);
  }

  return updated;
}

export async function deleteCategory(id: string): Promise<void> {
  await getCategoryById(id);

  const hasChildren = await categoryRepository.hasChildren(id);
  if (hasChildren) {
    throw new AppError(
      'CATEGORY_HAS_CHILDREN',
      'No se puede eliminar una categoría con subcategorías',
      400
    );
  }

  const hasProducts = await categoryRepository.hasProducts(id);
  if (hasProducts) {
    throw new AppError(
      'CATEGORY_HAS_PRODUCTS',
      'No se puede eliminar una categoría con productos',
      400
    );
  }

  await categoryRepository.deleteCategory(id);
}

export async function reorderCategories(categories: ReorderCategoryData[]): Promise<void> {
  await categoryRepository.updateDisplayOrders(categories);
}
