/**
 * Tipos compartidos para ordenes
 */

export type OrderStatus =
  | 'pending'
  | 'awaiting_payment'
  | 'payment_approved'
  | 'preparing'
  | 'ready_for_pickup'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  subtotal: number;
  shippingCost: number;
  discountAmount: number;
  total: number;

  // Direccion de envio (snapshot)
  shippingStreet: string | null;
  shippingStreetNumber: string | null;
  shippingFloor: string | null;
  shippingApartment: string | null;
  shippingCity: string | null;
  shippingProvince: string | null;
  shippingPostcode: string | null;

  notes: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  createdAt: string;
}

export interface CreateOrderInput {
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  shippingAddressId?: string;
  notes?: string;
}
