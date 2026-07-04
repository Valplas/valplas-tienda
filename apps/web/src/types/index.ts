// ============================================================================
// ENUMS
// ============================================================================

export enum UserRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  DRIVER = 'driver',
  CUSTOMER = 'customer'
}

export enum OrderStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled'
}

// ============================================================================
// USER & AUTH
// ============================================================================

export interface User {
  id: string;
  email: string;
  username: string;
  phone: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LoginCredentials {
  identifier: string; // email or username
  password: string;
}

export interface RegisterData {
  email: string;
  username: string;
  password: string;
  phone: string;
  firstName: string;
  lastName: string;
}

export interface AuthSession {
  user: User;
  accessToken: string;
  refreshToken: string;
}

// ============================================================================
// ADDRESSES
// ============================================================================

export interface Address {
  id: string;
  userId: string;
  label: string; // "Casa", "Trabajo", etc.
  street: string;
  streetNumber: string;
  floor?: string;
  apartment?: string;
  city: string;
  province: string;
  postcode: string;
  latitude?: number;
  longitude?: number;
  placeId?: string; // Google Maps
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// CATEGORIES & BRANDS
// ============================================================================

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  imageUrl: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// PRODUCTS
// ============================================================================

export interface Product {
  id: string;
  sku: string;
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  brandId: string;
  basePrice: number;
  costPrice: number;
  finalPrice: number; // Con descuentos aplicados
  stock: number;
  reservedStock: number;
  availableStock: number; // stock - reservedStock
  unit: string; // "unidad", "pack x 10", "caja x 50"
  weight?: number | null; // kg
  width?: number | null; // cm
  length?: number | null; // cm
  height?: number | null; // cm
  origin?: string | null;
  imageUrl: string;
  images: string[]; // URLs adicionales
  isFeatured: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string; // Soft delete
  // Relations
  category?: Category;
  brand?: Brand;
  tiers?: PriceTier[]; // populated on product detail page
}

export interface ProductFilters {
  categoryId?: string;
  brandId?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  isFeatured?: boolean;
  isActive?: boolean;
}

// ============================================================================
// CART
// ============================================================================

export interface CartItem {
  productId: string;
  quantity: number; // cantidad de bultos
  priceListId?: string; // lista de precios del tier elegido (para la orden)
  minQuantity?: number; // unidades por bulto (1 si no hay tier)
  product?: Product; // Populated for display
}

export interface Cart {
  items: CartItem[];
  subtotal: number;
  shippingCost: number;
  total: number;
  updatedAt: string;
}

// ============================================================================
// SHIPPING
// ============================================================================

export interface ShippingZone {
  id: string;
  name: string;
  province: string;
  postcodes: string[]; // e.g., ["1000-1999", "2000-2500"]
  excludedPostcodes?: string[]; // CPs específicos excluidos
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ShippingRate {
  id: string;
  zoneId: string;
  carrierName: string; // "Valplas Express", "Andreani", etc.
  minAmount: number; // Monto mínimo del carrito
  cost: number;
  estimatedDays: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ShippingOption {
  carrierId: string;
  carrierName: string;
  cost: number;
  estimatedDays: number;
}

// ============================================================================
// ORDERS
// ============================================================================

export interface OrderItem {
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Order {
  id: string;
  orderNumber: string; // VLP-YYYYMMDD-NNNN
  userId: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  shippingCost: number;
  total: number;
  // Shipping info
  shippingAddress: Address;
  shippingCarrier: string;
  trackingNumber?: string;
  // Payment info
  paymentMethod: string; // "mercadopago"
  paymentId?: string;
  paymentStatus?: string;
  // Timestamps
  createdAt: string;
  updatedAt: string;
  shippedAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  // Relations
  user?: User;
}

// ============================================================================
// PAGINATION
// ============================================================================

export interface PaginationParams {
  page?: number;
  limit?: number;
  cursor?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page?: number;
    limit: number;
    total: number;
    totalPages?: number;
    cursor?: string;
    hasMore: boolean;
  };
}

// ============================================================================
// PRICE LISTS
// ============================================================================

export interface PriceList {
  id: string;
  name: string;
  margin: number; // e.g. 50.0 = 50%
  discount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// ============================================================================
// CATALOG — Public product types with price tiers
// ============================================================================

export interface PriceTier {
  minQuantity: number;
  unitPrice: number;
  priceListId?: string;
  priceListName?: string;
}

export interface ProductPublic {
  id: string;
  sku: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  availableStock: number;
  basePrice: number; // fallback si no hay tiers
  categoryId: string;
  brandId: string | null;
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  tiers: PriceTier[]; // ordenados por minQuantity ASC
}

export interface CatalogFilters {
  search?: string;
  categoryId?: string;
  brandId?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: import('./filter.types').SortOption;
  page?: number;
  limit?: number;
}

// ============================================================================
// FRONTEND-SPECIFIC TYPES
// ============================================================================

export * from './toast.types';
export * from './filter.types';
export * from './cart.types';
