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
  first_name: string;
  last_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
  first_name: string;
  last_name: string;
}

export interface AuthSession {
  user: User;
  access_token: string;
  refresh_token: string;
}

// ============================================================================
// ADDRESSES
// ============================================================================

export interface Address {
  id: string;
  user_id: string;
  label: string; // "Casa", "Trabajo", etc.
  street: string;
  street_number: string;
  floor?: string;
  apartment?: string;
  city: string;
  province: string;
  postcode: string;
  latitude?: number;
  longitude?: number;
  place_id?: string; // Google Maps
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// CATEGORIES & BRANDS
// ============================================================================

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_id: string | null;
  image_url: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
  category_id: string;
  brand_id: string;
  base_price: number;
  cost_price: number;
  final_price: number; // Con descuentos aplicados
  stock: number;
  reserved_stock: number;
  available_stock: number; // stock - reserved_stock
  unit: string; // "unidad", "pack x 10", "caja x 50"
  weight?: number | null; // kg
  width?: number | null; // cm
  length?: number | null; // cm
  height?: number | null; // cm
  origin?: string | null;
  image_url: string;
  images: string[]; // URLs adicionales
  is_featured: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string; // Soft delete
  // Relations
  category?: Category;
  brand?: Brand;
}

export interface ProductFilters {
  category_id?: string;
  brand_id?: string;
  min_price?: number;
  max_price?: number;
  search?: string;
  is_featured?: boolean;
  is_active?: boolean;
}

// ============================================================================
// CART
// ============================================================================

export interface CartItem {
  product_id: string;
  quantity: number;
  product?: Product; // Populated for display
}

export interface Cart {
  items: CartItem[];
  subtotal: number;
  shipping_cost: number;
  total: number;
  updated_at: string;
}

// ============================================================================
// SHIPPING
// ============================================================================

export interface ShippingZone {
  id: string;
  name: string;
  province: string;
  postcodes: string[]; // e.g., ["1000-1999", "2000-2500"]
  excluded_postcodes?: string[]; // CPs específicos excluidos
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShippingRate {
  id: string;
  zone_id: string;
  carrier_name: string; // "Valplas Express", "Andreani", etc.
  min_amount: number; // Monto mínimo del carrito
  cost: number;
  estimated_days: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShippingOption {
  carrier_name: string;
  cost: number;
  estimated_days: number;
}

// ============================================================================
// ORDERS
// ============================================================================

export interface OrderItem {
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface Order {
  id: string;
  order_number: string; // VLP-YYYYMMDD-NNNN
  user_id: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  shipping_cost: number;
  total: number;
  // Shipping info
  shipping_address: Address;
  shipping_carrier: string;
  tracking_number?: string;
  // Payment info
  payment_method: string; // "mercadopago"
  payment_id?: string;
  payment_status?: string;
  // Timestamps
  created_at: string;
  updated_at: string;
  shipped_at?: string;
  delivered_at?: string;
  cancelled_at?: string;
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
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ============================================================================
// CATALOG — Public product types with price tiers
// ============================================================================

export interface PriceTier {
  min_quantity: number;
  unit_price: number; // en centavos
}

export interface ProductPublic {
  id: string;
  sku: string;
  name: string;
  slug: string;
  image_url: string | null;
  available_stock: number;
  base_price: number; // fallback si no hay tiers
  category_id: string;
  brand_id: string | null;
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  tiers: PriceTier[]; // ordenados por min_quantity ASC
}

export interface CatalogFilters {
  search?: string;
  category_id?: string;
  brand_id?: string;
  page?: number;
  limit?: number;
}

// ============================================================================
// FRONTEND-SPECIFIC TYPES
// ============================================================================

export * from './toast.types';
export * from './filter.types';
export * from './cart.types';
