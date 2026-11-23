import { AppError } from '../../shared/middleware/error.middleware.js';
import * as attributeRepository from './attribute.repository.js';
import type { CreateAttributeData, UpdateAttributeData } from './attribute.types.js';

export async function listAttributes(page: number, limit: number) {
  return attributeRepository.findAll(page, limit);
}

export async function getAttribute(id: string) {
  const attribute = await attributeRepository.findById(id);
  if (!attribute) {
    throw new AppError('ATTRIBUTE_NOT_FOUND', 'Atributo no encontrado', 404);
  }
  return attribute;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23505';
}

export async function createAttribute(data: CreateAttributeData) {
  if (await attributeRepository.keyExists(data.key)) {
    throw new AppError('ATTRIBUTE_KEY_EXISTS', 'Ya existe un atributo con esa clave', 409);
  }
  try {
    return await attributeRepository.create(data);
  } catch (error) {
    // Carrera entre el chequeo y el INSERT
    if (isUniqueViolation(error)) {
      throw new AppError('ATTRIBUTE_KEY_EXISTS', 'Ya existe un atributo con esa clave', 409);
    }
    throw error;
  }
}

export async function updateAttribute(id: string, data: UpdateAttributeData) {
  const current = await getAttribute(id);

  if (data.options !== undefined) {
    if (current.valueType !== 'option') {
      if (data.options !== null) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Solo los atributos de tipo option admiten opciones',
          400
        );
      }
    } else if (!data.options || data.options.length === 0) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Los atributos de tipo option requieren al menos una opción',
        400
      );
    }
  }

  const updated = await attributeRepository.update(id, data);
  if (!updated) {
    throw new AppError('ATTRIBUTE_NOT_FOUND', 'Atributo no encontrado', 404);
  }
  return updated;
}

export async function deleteAttribute(id: string): Promise<void> {
  await getAttribute(id);
  if (await attributeRepository.hasValues(id)) {
    throw new AppError(
      'ATTRIBUTE_IN_USE',
      'El atributo tiene valores cargados en productos: desactivalo en lugar de eliminarlo',
      409
    );
  }
  try {
    await attributeRepository.remove(id);
  } catch (error) {
    // FK RESTRICT desde product_attribute_values (valor cargado entre el chequeo y el DELETE)
    if ((error as { code?: string } | null)?.code === '23503') {
      throw new AppError(
        'ATTRIBUTE_IN_USE',
        'El atributo tiene valores cargados en productos: desactivalo en lugar de eliminarlo',
        409
      );
    }
    throw error;
  }
}

export async function setCategories(id: string, categoryIds: string[]) {
  await getAttribute(id);
  const unique = [...new Set(categoryIds)];
  const existing = await attributeRepository.findExistingCategoryIds(unique);
  if (existing.length !== unique.length) {
    throw new AppError('CATEGORY_NOT_FOUND', 'Alguna categoría no existe', 404);
  }
  await attributeRepository.replaceCategories(id, unique);
  return { categoryIds: unique };
}

export async function listForCategory(categoryId: string) {
  if (!(await attributeRepository.categoryExists(categoryId))) {
    throw new AppError('CATEGORY_NOT_FOUND', 'Categoría no encontrada', 404);
  }
  return attributeRepository.findForCategory(categoryId);
}
