export type AttributeValueType = 'number' | 'text' | 'option';

export interface AttributeDefinition {
  id: string;
  key: string;
  label: string;
  valueType: AttributeValueType;
  unit: string | null;
  options: string[] | null;
  aliases: string[];
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AttributeCategoryRef {
  id: string;
  name: string;
}

export interface AttributeDefinitionWithCategories extends AttributeDefinition {
  categories: AttributeCategoryRef[];
}

export interface CreateAttributeData {
  key: string;
  label: string;
  value_type: AttributeValueType;
  unit?: string | null;
  options?: string[] | null;
  aliases: string[];
  display_order: number;
  is_active: boolean;
}

export interface UpdateAttributeData {
  label?: string;
  unit?: string | null;
  options?: string[] | null;
  aliases?: string[];
  display_order?: number;
  is_active?: boolean;
}

/** Valor de atributo de un producto tal como se expone en bot, catálogo público y slug. */
export interface ProductAttributeView {
  key: string;
  label: string;
  /** number para atributos de tipo number; string para text y option. */
  value: number | string;
  unit: string | null;
}

/** Valor de atributo en el detalle admin: incluye lo necesario para editarlo. */
export interface AdminProductAttribute extends ProductAttributeView {
  attributeId: string;
  valueType: AttributeValueType;
}

/** Entrada del admin al crear/actualizar un producto. */
export interface ProductAttributeInput {
  attributeId: string;
  value: string | number;
}

/** Valor ya validado, listo para persistir (exactamente uno de los dos no nulo). */
export interface ResolvedProductAttributeValue {
  attributeId: string;
  valueNumber: number | null;
  valueText: string | null;
}
