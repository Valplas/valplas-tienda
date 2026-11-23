// apps/api/src/modules/orders/order.types.ts

import type { UserAddress } from '../addresses/address.types.js';
import type { ShippingCarrier } from '../shipping/shipping.types.js';
import type { User } from '../users/user.types.js';
import type { BranchSnapshot } from '../../infrastructure/external/andreani/branches.js';
import type { ShipmentWithEvents } from '../shipments/shipment.types.js';
import type { AdminShipmentView, CustomerShipmentView } from '../shipments/shipment.view.js';

export type OrderStatus =
  | 'pending_payment'
  | 'payment_confirmed'
  | 'processing'
  | 'ready_to_ship'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded'
  | 'failed';

/** Canal de venta (enum sales_channel, migración 049). */
export type SalesChannel = 'web' | 'admin' | 'whatsapp' | 'legacy';

/** Canales que crean órdenes nuevas desde la API (legacy solo viene del import del CRM). */
export type OrderChannel = Exclude<SalesChannel, 'legacy'>;

export interface Order {
  id: string;
  order_number: string;
  user_id: string;
  status: OrderStatus;
  sales_channel: SalesChannel;
  /** Clave de idempotencia de un canal externo (bot); null en web/admin. */
  client_reference: string | null;
  subtotal: number;
  shipping_cost: number;
  total: number;
  shipping_address_id: string | null;
  // Denormalized shipping address snapshot
  shipping_street: string;
  shipping_street_number: string;
  shipping_floor: string | null;
  shipping_apartment: string | null;
  shipping_city: string;
  shipping_province: string;
  shipping_postcode: string;
  shipping_notes: string | null;
  // Carrier
  shipping_carrier_id: string | null;
  carrier_name: string | null;
  // Payment
  payment_method: string | null;
  payment_id: string | null;
  paid_at: Date | null;
  // Envío / entrega
  shipping_method: 'home_delivery' | 'branch_pickup';
  /** Snapshot de la sucursal elegida. */
  pickup_branch: BranchSnapshot | null;
  recipient_document: string | null;
  tracking_number: string | null;
  shipped_at: Date | null;
  delivered_at: Date | null;
  cancelled_at: Date | null;
  // Notes
  customer_notes: string | null;
  admin_notes: string | null;
  created_at: Date;
  updated_at: Date;
  user?: Pick<User, 'id' | 'first_name' | 'last_name' | 'email' | 'phone'> | null;
  /** Presente cuando el listado se pide con includeItems (json_agg en el repo). */
  items?: OrderItemWithProduct[];
  /** Solo en listados: último envío activo del pedido (LEFT JOIN LATERAL). */
  active_shipment?: ActiveShipmentSummary | null;
}

export interface ActiveShipmentSummary {
  id: string;
  status: string;
  tracking_number: string | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  created_at: Date;
  updated_at: Date;
}

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  status: OrderStatus;
  notes: string | null;
  changed_by: string | null;
  created_at: Date;
}

export interface OrderWithDetails extends Order {
  items: OrderItemWithProduct[];
  status_history: OrderStatusHistory[];
  shipping_address?: UserAddress;
  shipping_carrier?: ShippingCarrier;
  /** El envío lo gestiona un proveedor externo: la dirección no se puede editar */
  shipping_carrier_is_external?: boolean;
  user?: Omit<User, 'passwordHash'>;
  /** Envíos del pedido, el más nuevo primero. El repositorio devuelve la fila completa. */
  shipments: ShipmentWithEvents[];
}

/** Detalle de pedido tal como sale por la API: los envíos ya proyectados según el rol. */
export type OrderDetailView = Omit<OrderWithDetails, 'shipments'> & {
  shipments: (AdminShipmentView | CustomerShipmentView)[];
};

export interface OrderItemWithProduct extends OrderItem {
  product_name: string;
  product_sku: string;
  product_image?: string;
}

export interface CreateOrderInput {
  shipping_address_id: string;
  shipping_carrier_id: string;
  payment_method: string;
  notes?: string;
  items: CreateOrderItemInput[];
  payer_identification?: { type: string; number: string };
}

export interface CreateAdminOrderInput {
  user_id: string;
  shipping_address_id?: string | null;
  items: CreateAdminOrderItemInput[];
  notes?: string;
  payment_method?: string;
}

export interface CreateAdminOrderItemInput {
  product_id: string;
  price_list_id: string;
  quantity: number;
}

export interface UpdateAdminOrderItemInput {
  product_id: string;
  price_list_id: string;
  quantity: number;
}

/**
 * keep: se mantiene el costo de envío cobrado. recalculate: se cotiza el carrier del pedido para la
 * nueva dirección (el cliente paga/recibe la diferencia).
 */
export type ShippingCostMode = 'keep' | 'recalculate';

export interface UpdateAdminOrderInput {
  /** Sin dirección se conserva la de la orden */
  shipping_address_id?: string;
  items: UpdateAdminOrderItemInput[];
  shipping_cost_mode?: ShippingCostMode;
}

export interface CreateOrderItemInput {
  product_id: string;
  quantity: number;
  price_list_id?: string;
}

export interface UpdateOrderStatusInput {
  status: OrderStatus;
  notes?: string;
  payment_id?: string;
}

export interface OrderFilters {
  user_id?: string;
  status?: OrderStatus;
  from_date?: string;
  to_date?: string;
  order_number?: string;
  search?: string;
  /** Paginación clásica (OFFSET). Si se omite, se pagina por cursor. */
  page?: number;
  /** Cursor opaco de la página anterior (paginación por cursor). */
  cursor?: string;
  limit?: number;
  includeItems?: boolean;
}

export interface OrderSummary {
  subtotal: number;
  shipping_cost: number;
  total: number;
  items_count: number;
}

// Valid status transitions
export const VALID_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ['payment_confirmed', 'cancelled', 'failed'],
  payment_confirmed: ['processing', 'refunded', 'cancelled'],
  processing: ['ready_to_ship', 'cancelled'],
  ready_to_ship: ['shipped', 'processing', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
  failed: []
};

// Status labels in Spanish
export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Pendiente de pago',
  payment_confirmed: 'Pago confirmado',
  processing: 'Procesando',
  ready_to_ship: 'Listo para enviar',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
  failed: 'Fallido'
};
