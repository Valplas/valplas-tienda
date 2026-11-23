// apps/web/src/lib/services/attributes.service.ts

import { get, post, patch, put, del } from '../api';
import type {
  AttributeDefinition,
  AttributeDefinitionWithCategories,
  AttributeValueType
} from '@/types';

/** Los requests de este módulo van en snake_case (patrón de la API). */
export interface CreateAttributePayload {
  key: string;
  label: string;
  value_type: AttributeValueType;
  unit?: string | null;
  options?: string[] | null;
  aliases?: string[];
  display_order?: number;
  is_active?: boolean;
}

export interface UpdateAttributePayload {
  label?: string;
  unit?: string | null;
  options?: string[] | null;
  aliases?: string[];
  display_order?: number;
  is_active?: boolean;
}

/** Diccionario completo (el API pagina con máximo 200; el diccionario es chico). */
export async function getAttributes(): Promise<AttributeDefinitionWithCategories[]> {
  const res = await get<AttributeDefinitionWithCategories[]>('/attributes?limit=200');
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? 'Error al cargar atributos');
  }
  return res.data;
}

/** Atributos activos de una categoría y sus ancestros, ordenados. */
export async function getAttributesForCategory(categoryId: string): Promise<AttributeDefinition[]> {
  const res = await get<AttributeDefinition[]>(`/attributes/for-category/${categoryId}`);
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? 'Error al cargar atributos de la categoría');
  }
  return res.data;
}

export async function createAttribute(data: CreateAttributePayload): Promise<AttributeDefinition> {
  const res = await post<{ attribute: AttributeDefinition }>('/attributes', data);
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Error al crear atributo');
  return res.data.attribute;
}

export async function updateAttribute(
  id: string,
  data: UpdateAttributePayload
): Promise<AttributeDefinition> {
  const res = await patch<{ attribute: AttributeDefinition }>(`/attributes/${id}`, data);
  if (!res.success || !res.data)
    throw new Error(res.error?.message ?? 'Error al actualizar atributo');
  return res.data.attribute;
}

export async function deleteAttribute(id: string): Promise<void> {
  const res = await del(`/attributes/${id}`);
  if (!res.success) throw new Error(res.error?.message ?? 'Error al eliminar atributo');
}

export async function setAttributeCategories(id: string, categoryIds: string[]): Promise<void> {
  const res = await put(`/attributes/${id}/categories`, { category_ids: categoryIds });
  if (!res.success) throw new Error(res.error?.message ?? 'Error al asignar categorías');
}
