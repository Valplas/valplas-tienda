import { Order, OrderStatus } from '@/types';
import { MOCK_ADDRESSES } from './addresses';
import { MOCK_USERS } from './users';

/**
 * Mock orders - Pedidos en diferentes estados
 */

export const MOCK_ORDERS: Order[] = [
  // ==================== ORDEN 1 - DELIVERED ====================
  {
    id: 'order-001',
    order_number: 'VLP-20240215-0001',
    user_id: 'user-004',
    status: OrderStatus.DELIVERED,
    items: [
      {
        product_id: 'prod-001',
        product_name: 'Bolsas Plásticas 40x60 cm',
        product_sku: 'BP-40X60-100',
        quantity: 2,
        unit_price: 1250,
        subtotal: 2500
      },
      {
        product_id: 'prod-005',
        product_name: 'Ariel Detergente Líquido 3L',
        product_sku: 'DET-ARIEL-3L',
        quantity: 1,
        unit_price: 4200,
        subtotal: 4200
      }
    ],
    subtotal: 6700,
    shipping_cost: 2500,
    total: 9200,
    shipping_address: MOCK_ADDRESSES.find((a) => a.id === 'addr-001')!,
    shipping_carrier: 'Valplas Express',
    tracking_number: 'VLP2024021500001',
    payment_method: 'mercadopago',
    payment_id: 'MP-12345678',
    payment_status: 'approved',
    created_at: '2024-02-15T14:30:00.000Z',
    updated_at: '2024-02-18T10:15:00.000Z',
    shipped_at: '2024-02-16T09:00:00.000Z',
    delivered_at: '2024-02-18T10:15:00.000Z',
    user: MOCK_USERS.find((u) => u.id === 'user-004')
  },

  // ==================== ORDEN 2 - SHIPPED ====================
  {
    id: 'order-002',
    order_number: 'VLP-20240220-0002',
    user_id: 'user-005',
    status: OrderStatus.SHIPPED,
    items: [
      {
        product_id: 'prod-013',
        product_name: 'Licuadora Philips 400W',
        product_sku: 'PHIL-LIC-400W',
        quantity: 1,
        unit_price: 12500,
        subtotal: 12500
      },
      {
        product_id: 'prod-008',
        product_name: 'Ayudín Lavandina 2L',
        product_sku: 'DES-AYU-2L',
        quantity: 2,
        unit_price: 1500,
        subtotal: 3000
      }
    ],
    subtotal: 15500,
    shipping_cost: 0, // Envío gratis por monto
    total: 15500,
    shipping_address: MOCK_ADDRESSES.find((a) => a.id === 'addr-003')!,
    shipping_carrier: 'Valplas Express',
    tracking_number: 'VLP2024022000002',
    payment_method: 'mercadopago',
    payment_id: 'MP-23456789',
    payment_status: 'approved',
    created_at: '2024-02-20T16:45:00.000Z',
    updated_at: '2024-02-21T11:00:00.000Z',
    shipped_at: '2024-02-21T11:00:00.000Z',
    user: MOCK_USERS.find((u) => u.id === 'user-005')
  },

  // ==================== ORDEN 3 - PROCESSING ====================
  {
    id: 'order-003',
    order_number: 'VLP-20240222-0003',
    user_id: 'user-006',
    status: OrderStatus.PROCESSING,
    items: [
      {
        product_id: 'prod-003',
        product_name: 'Bolsas Residuo 45x60 cm',
        product_sku: 'BR-45X60-1000',
        quantity: 1,
        unit_price: 8500,
        subtotal: 8500
      },
      {
        product_id: 'prod-010',
        product_name: 'Magistral Limpiador Multiuso 1L',
        product_sku: 'LIM-MAG-1L',
        quantity: 3,
        unit_price: 1650,
        subtotal: 4950
      }
    ],
    subtotal: 13450,
    shipping_cost: 5500,
    total: 18950,
    shipping_address: MOCK_ADDRESSES.find((a) => a.id === 'addr-004')!,
    shipping_carrier: 'Valplas Express',
    payment_method: 'mercadopago',
    payment_id: 'MP-34567890',
    payment_status: 'approved',
    created_at: '2024-02-22T10:20:00.000Z',
    updated_at: '2024-02-22T15:30:00.000Z',
    user: MOCK_USERS.find((u) => u.id === 'user-006')
  },

  // ==================== ORDEN 4 - PENDING ====================
  {
    id: 'order-004',
    order_number: 'VLP-20240223-0004',
    user_id: 'user-007',
    status: OrderStatus.PENDING,
    items: [
      {
        product_id: 'prod-020',
        product_name: 'Bolsas Camiseta Pack x 200',
        product_sku: 'BP-CAMISETA-200',
        quantity: 5,
        unit_price: 850,
        subtotal: 4250
      },
      {
        product_id: 'prod-007',
        product_name: 'Ariel Lavavajillas 500ml',
        product_sku: 'DET-ARIEL-500ML',
        quantity: 2,
        unit_price: 1200,
        subtotal: 2400
      }
    ],
    subtotal: 6650,
    shipping_cost: 5500,
    total: 12150,
    shipping_address: MOCK_ADDRESSES.find((a) => a.id === 'addr-005')!,
    shipping_carrier: 'Valplas Express',
    payment_method: 'mercadopago',
    payment_id: 'MP-45678901',
    payment_status: 'pending',
    created_at: '2024-02-23T11:00:00.000Z',
    updated_at: '2024-02-23T11:00:00.000Z',
    user: MOCK_USERS.find((u) => u.id === 'user-007')
  },

  // ==================== ORDEN 5 - CANCELLED ====================
  {
    id: 'order-005',
    order_number: 'VLP-20240218-0005',
    user_id: 'user-008',
    status: OrderStatus.CANCELLED,
    items: [
      {
        product_id: 'prod-014',
        product_name: 'Batidora Liliana 300W',
        product_sku: 'LIL-BAT-300W',
        quantity: 1,
        unit_price: 8900,
        subtotal: 8900
      }
    ],
    subtotal: 8900,
    shipping_cost: 6500,
    total: 15400,
    shipping_address: MOCK_ADDRESSES.find((a) => a.id === 'addr-007')!,
    shipping_carrier: 'Valplas Express',
    payment_method: 'mercadopago',
    payment_id: 'MP-56789012',
    payment_status: 'cancelled',
    created_at: '2024-02-18T09:00:00.000Z',
    updated_at: '2024-02-18T14:00:00.000Z',
    cancelled_at: '2024-02-18T14:00:00.000Z',
    user: MOCK_USERS.find((u) => u.id === 'user-008')
  },

  // ==================== ORDEN 6 - DELIVERED ====================
  {
    id: 'order-006',
    order_number: 'VLP-20240210-0006',
    user_id: 'user-009',
    status: OrderStatus.DELIVERED,
    items: [
      {
        product_id: 'prod-016',
        product_name: 'Procesadora Philips 1200W',
        product_sku: 'PHIL-PRO-1200W',
        quantity: 1,
        unit_price: 15000,
        subtotal: 15000
      },
      {
        product_id: 'prod-009',
        product_name: 'Ayudín Lavandina 5L',
        product_sku: 'DES-AYU-5L',
        quantity: 1,
        unit_price: 3200,
        subtotal: 3200
      }
    ],
    subtotal: 18200,
    shipping_cost: 0, // Envío gratis
    total: 18200,
    shipping_address: MOCK_ADDRESSES.find((a) => a.id === 'addr-008')!,
    shipping_carrier: 'Valplas Express',
    tracking_number: 'VLP2024021000006',
    payment_method: 'mercadopago',
    payment_id: 'MP-67890123',
    payment_status: 'approved',
    created_at: '2024-02-10T13:15:00.000Z',
    updated_at: '2024-02-12T16:30:00.000Z',
    shipped_at: '2024-02-11T10:00:00.000Z',
    delivered_at: '2024-02-12T16:30:00.000Z',
    user: MOCK_USERS.find((u) => u.id === 'user-009')
  },

  // ==================== ORDEN 7 - PROCESSING ====================
  {
    id: 'order-007',
    order_number: 'VLP-20240224-0007',
    user_id: 'user-004',
    status: OrderStatus.PROCESSING,
    items: [
      {
        product_id: 'prod-002',
        product_name: 'Bolsas Plásticas 50x70 cm',
        product_sku: 'BP-50X70-50',
        quantity: 3,
        unit_price: 1800,
        subtotal: 5400
      },
      {
        product_id: 'prod-011',
        product_name: 'Limpiador de Vidrios 500ml',
        product_sku: 'LIM-VID-500ML',
        quantity: 4,
        unit_price: 980,
        subtotal: 3920
      },
      {
        product_id: 'prod-012',
        product_name: 'Limpiador de Pisos 2L',
        product_sku: 'LIM-PISO-2L',
        quantity: 2,
        unit_price: 1750,
        subtotal: 3500
      }
    ],
    subtotal: 12820,
    shipping_cost: 2500,
    total: 15320,
    shipping_address: MOCK_ADDRESSES.find((a) => a.id === 'addr-002')!,
    shipping_carrier: 'Valplas Express',
    payment_method: 'mercadopago',
    payment_id: 'MP-78901234',
    payment_status: 'approved',
    created_at: '2024-02-24T08:45:00.000Z',
    updated_at: '2024-02-24T12:00:00.000Z',
    user: MOCK_USERS.find((u) => u.id === 'user-004')
  },

  // ==================== ORDEN 8 - SHIPPED ====================
  {
    id: 'order-008',
    order_number: 'VLP-20240221-0008',
    user_id: 'user-005',
    status: OrderStatus.SHIPPED,
    items: [
      {
        product_id: 'prod-017',
        product_name: 'Secador de Pelo Philips 2000W',
        product_sku: 'PHIL-SEC-2000W',
        quantity: 1,
        unit_price: 11200,
        subtotal: 11200
      },
      {
        product_id: 'prod-006',
        product_name: 'Magistral Detergente en Polvo 800g',
        product_sku: 'DET-MAG-800G',
        quantity: 4,
        unit_price: 1850,
        subtotal: 7400
      }
    ],
    subtotal: 18600,
    shipping_cost: 0,
    total: 18600,
    shipping_address: MOCK_ADDRESSES.find((a) => a.id === 'addr-003')!,
    shipping_carrier: 'Valplas Express',
    tracking_number: 'VLP2024022100008',
    payment_method: 'mercadopago',
    payment_id: 'MP-89012345',
    payment_status: 'approved',
    created_at: '2024-02-21T15:20:00.000Z',
    updated_at: '2024-02-22T09:30:00.000Z',
    shipped_at: '2024-02-22T09:30:00.000Z',
    user: MOCK_USERS.find((u) => u.id === 'user-005')
  }
];
