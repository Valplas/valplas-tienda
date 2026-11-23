import { AppError } from '../../shared/middleware/error.middleware.js';
import * as attributeRepository from './attribute.repository.js';
import type {
  AttributeDefinition,
  CreateAttributeData,
  ProductAttributeInput,
  ResolvedProductAttributeValue,
  UpdateAttributeData
} from './attribute.types.js';

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

  if (data.options && current.options) {
    const removed = current.options.filter((option) => !data.options!.includes(option));
    const inUse = await attributeRepository.findValuesInUse(id, removed);
    if (inUse.length > 0) {
      throw new AppError(
        'ATTRIBUTE_OPTION_IN_USE',
        'Hay productos con opciones que querés quitar',
        409,
        inUse
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

// ============= VALORES EN PRODUCTOS =============

const MAX_TEXT_LENGTH = 120;
/** NUMERIC(14,4): 10 dígitos enteros. */
const MAX_NUMBER = 1e10;

type ParsedValue =
  | { ok: true; value: Pick<ResolvedProductAttributeValue, 'valueNumber' | 'valueText'> }
  | { ok: false; message: string };

function parseValue(definition: AttributeDefinition, raw: unknown): ParsedValue {
  if (definition.valueType === 'number') {
    const parsed =
      typeof raw === 'number'
        ? raw
        : typeof raw === 'string' && /^-?\d+([.,]\d+)?$/.test(raw.trim())
          ? Number(raw.trim().replace(',', '.'))
          : NaN;
    if (!Number.isFinite(parsed) || Math.abs(parsed) >= MAX_NUMBER) {
      return { ok: false, message: 'Debe ser un número válido' };
    }
    return { ok: true, value: { valueNumber: parsed, valueText: null } };
  }

  const text = typeof raw === 'string' ? raw.trim() : '';
  if (text.length === 0 || text.length > MAX_TEXT_LENGTH) {
    return { ok: false, message: `Debe ser un texto de 1 a ${MAX_TEXT_LENGTH} caracteres` };
  }
  if (definition.valueType === 'option' && !definition.options?.includes(text)) {
    return { ok: false, message: 'Debe ser una de las opciones definidas' };
  }
  return { ok: true, value: { valueNumber: null, valueText: text } };
}

/**
 * Valida los valores de atributos de un producto contra sus definiciones. Rechaza atributos
 * inexistentes o inactivos, repetidos y valores que no cumplen el tipo (400
 * INVALID_ATTRIBUTE_VALUE, con el detalle por atributo).
 */
export async function resolveProductValues(
  inputs: ProductAttributeInput[]
): Promise<ResolvedProductAttributeValue[]> {
  if (inputs.length === 0) return [];
  const definitions = new Map(
    (await attributeRepository.findByIds(inputs.map((input) => input.attributeId))).map((d) => [
      d.id,
      d
    ])
  );
  const seen = new Set<string>();
  const errors: Array<{ attributeId: string; message: string }> = [];
  const resolved: ResolvedProductAttributeValue[] = [];

  for (const input of inputs) {
    const definition = definitions.get(input.attributeId);
    if (!definition || !definition.isActive) {
      errors.push({ attributeId: input.attributeId, message: 'Atributo inexistente o inactivo' });
      continue;
    }
    if (seen.has(input.attributeId)) {
      errors.push({ attributeId: input.attributeId, message: 'Atributo repetido' });
      continue;
    }
    seen.add(input.attributeId);
    const parsed = parseValue(definition, input.value);
    if (!parsed.ok) {
      errors.push({ attributeId: input.attributeId, message: parsed.message });
      continue;
    }
    resolved.push({ attributeId: input.attributeId, ...parsed.value });
  }

  if (errors.length > 0) {
    throw new AppError('INVALID_ATTRIBUTE_VALUE', 'Valores de atributos inválidos', 400, errors);
  }
  return resolved;
}
