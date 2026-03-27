export interface ProductPriceTier {
  id: string;
  productId: string;
  priceListId: string;
  priceListName: string;
  minQuantity: number;
  unitPrice: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductPriceTierInput {
  priceListId: string;
  minQuantity: number;
}

export interface BulkAssignFilter {
  all?: boolean;
  categoryId?: string;
  brandId?: string;
}

export interface BulkPreviewRequest {
  tiers: ProductPriceTierInput[];
  filter: BulkAssignFilter;
}

export interface BulkConflict {
  productId: string;
  productName: string;
  minQuantity: number;
  existingPriceListName: string;
  newPriceListName: string;
}

export interface BulkPreviewResult {
  toAssign: { productId: string; productName: string }[];
  conflicts: BulkConflict[];
}

export interface BulkConfirmRequest {
  tiers: ProductPriceTierInput[];
  filter: BulkAssignFilter;
  conflictResolution: 'skip' | 'overwrite';
}

export interface BulkConfirmResult {
  assigned: number;
  skipped: number;
}
