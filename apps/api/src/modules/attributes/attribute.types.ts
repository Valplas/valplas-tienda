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
