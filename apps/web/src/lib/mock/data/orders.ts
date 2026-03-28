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
    orderNumber: 'VLP-20240215-0001',
    userId: 'user-004',
    status: OrderStatus.DELIVERED,
    items: [
      {
        productId: 'prod-001',
        productName: 'Bolsas Plásticas 40x60 cm',
        productSku: 'BP-40X60-100',
        quantity: 2,
        unitPrice: 1250,
        subtotal: 2500
      },
      {
        productId: 'prod-005',
        productName: 'Ariel Detergente Líquido 3L',
        productSku: 'DET-ARIEL-3L',
        quantity: 1,
        unitPrice: 4200,
        subtotal: 4200
      }
    ],
    subtotal: 6700,
    shippingCost: 2500,
    total: 9200,
    shippingAddress: MOCK_ADDRESSES.find((a) => a.id === 'addr-001')!,
    shippingCarrier: 'Valplas Express',
    trackingNumber: 'VLP2024021500001',
    paymentMethod: 'mercadopago',
    paymentId: 'MP-12345678',
    paymentStatus: 'approved',
    createdAt: '2024-02-15T14:30:00.000Z',
    updatedAt: '2024-02-18T10:15:00.000Z',
    shippedAt: '2024-02-16T09:00:00.000Z',
    deliveredAt: '2024-02-18T10:15:00.000Z',
    user: MOCK_USERS.find((u) => u.id === 'user-004')
  },

  // ==================== ORDEN 2 - SHIPPED ====================
  {
    id: 'order-002',
    orderNumber: 'VLP-20240220-0002',
    userId: 'user-005',
    status: OrderStatus.SHIPPED,
    items: [
      {
        productId: 'prod-013',
        productName: 'Licuadora Philips 400W',
        productSku: 'PHIL-LIC-400W',
        quantity: 1,
        unitPrice: 12500,
        subtotal: 12500
      },
      {
        productId: 'prod-008',
        productName: 'Ayudín Lavandina 2L',
        productSku: 'DES-AYU-2L',
        quantity: 2,
        unitPrice: 1500,
        subtotal: 3000
      }
    ],
    subtotal: 15500,
    shippingCost: 0, // Envío gratis por monto
    total: 15500,
    shippingAddress: MOCK_ADDRESSES.find((a) => a.id === 'addr-003')!,
    shippingCarrier: 'Valplas Express',
    trackingNumber: 'VLP2024022000002',
    paymentMethod: 'mercadopago',
    paymentId: 'MP-23456789',
    paymentStatus: 'approved',
    createdAt: '2024-02-20T16:45:00.000Z',
    updatedAt: '2024-02-21T11:00:00.000Z',
    shippedAt: '2024-02-21T11:00:00.000Z',
    user: MOCK_USERS.find((u) => u.id === 'user-005')
  },

  // ==================== ORDEN 3 - PROCESSING ====================
  {
    id: 'order-003',
    orderNumber: 'VLP-20240222-0003',
    userId: 'user-006',
    status: OrderStatus.PROCESSING,
    items: [
      {
        productId: 'prod-003',
        productName: 'Bolsas Residuo 45x60 cm',
        productSku: 'BR-45X60-1000',
        quantity: 1,
        unitPrice: 8500,
        subtotal: 8500
      },
      {
        productId: 'prod-010',
        productName: 'Magistral Limpiador Multiuso 1L',
        productSku: 'LIM-MAG-1L',
        quantity: 3,
        unitPrice: 1650,
        subtotal: 4950
      }
    ],
    subtotal: 13450,
    shippingCost: 5500,
    total: 18950,
    shippingAddress: MOCK_ADDRESSES.find((a) => a.id === 'addr-004')!,
    shippingCarrier: 'Valplas Express',
    paymentMethod: 'mercadopago',
    paymentId: 'MP-34567890',
    paymentStatus: 'approved',
    createdAt: '2024-02-22T10:20:00.000Z',
    updatedAt: '2024-02-22T15:30:00.000Z',
    user: MOCK_USERS.find((u) => u.id === 'user-006')
  },

  // ==================== ORDEN 4 - PENDING ====================
  {
    id: 'order-004',
    orderNumber: 'VLP-20240223-0004',
    userId: 'user-007',
    status: OrderStatus.PENDING,
    items: [
      {
        productId: 'prod-020',
        productName: 'Bolsas Camiseta Pack x 200',
        productSku: 'BP-CAMISETA-200',
        quantity: 5,
        unitPrice: 850,
        subtotal: 4250
      },
      {
        productId: 'prod-007',
        productName: 'Ariel Lavavajillas 500ml',
        productSku: 'DET-ARIEL-500ML',
        quantity: 2,
        unitPrice: 1200,
        subtotal: 2400
      }
    ],
    subtotal: 6650,
    shippingCost: 5500,
    total: 12150,
    shippingAddress: MOCK_ADDRESSES.find((a) => a.id === 'addr-005')!,
    shippingCarrier: 'Valplas Express',
    paymentMethod: 'mercadopago',
    paymentId: 'MP-45678901',
    paymentStatus: 'pending',
    createdAt: '2024-02-23T11:00:00.000Z',
    updatedAt: '2024-02-23T11:00:00.000Z',
    user: MOCK_USERS.find((u) => u.id === 'user-007')
  },

  // ==================== ORDEN 5 - CANCELLED ====================
  {
    id: 'order-005',
    orderNumber: 'VLP-20240218-0005',
    userId: 'user-008',
    status: OrderStatus.CANCELLED,
    items: [
      {
        productId: 'prod-014',
        productName: 'Batidora Liliana 300W',
        productSku: 'LIL-BAT-300W',
        quantity: 1,
        unitPrice: 8900,
        subtotal: 8900
      }
    ],
    subtotal: 8900,
    shippingCost: 6500,
    total: 15400,
    shippingAddress: MOCK_ADDRESSES.find((a) => a.id === 'addr-007')!,
    shippingCarrier: 'Valplas Express',
    paymentMethod: 'mercadopago',
    paymentId: 'MP-56789012',
    paymentStatus: 'cancelled',
    createdAt: '2024-02-18T09:00:00.000Z',
    updatedAt: '2024-02-18T14:00:00.000Z',
    cancelledAt: '2024-02-18T14:00:00.000Z',
    user: MOCK_USERS.find((u) => u.id === 'user-008')
  },

  // ==================== ORDEN 6 - DELIVERED ====================
  {
    id: 'order-006',
    orderNumber: 'VLP-20240210-0006',
    userId: 'user-009',
    status: OrderStatus.DELIVERED,
    items: [
      {
        productId: 'prod-016',
        productName: 'Procesadora Philips 1200W',
        productSku: 'PHIL-PRO-1200W',
        quantity: 1,
        unitPrice: 15000,
        subtotal: 15000
      },
      {
        productId: 'prod-009',
        productName: 'Ayudín Lavandina 5L',
        productSku: 'DES-AYU-5L',
        quantity: 1,
        unitPrice: 3200,
        subtotal: 3200
      }
    ],
    subtotal: 18200,
    shippingCost: 0, // Envío gratis
    total: 18200,
    shippingAddress: MOCK_ADDRESSES.find((a) => a.id === 'addr-008')!,
    shippingCarrier: 'Valplas Express',
    trackingNumber: 'VLP2024021000006',
    paymentMethod: 'mercadopago',
    paymentId: 'MP-67890123',
    paymentStatus: 'approved',
    createdAt: '2024-02-10T13:15:00.000Z',
    updatedAt: '2024-02-12T16:30:00.000Z',
    shippedAt: '2024-02-11T10:00:00.000Z',
    deliveredAt: '2024-02-12T16:30:00.000Z',
    user: MOCK_USERS.find((u) => u.id === 'user-009')
  },

  // ==================== ORDEN 7 - PROCESSING ====================
  {
    id: 'order-007',
    orderNumber: 'VLP-20240224-0007',
    userId: 'user-004',
    status: OrderStatus.PROCESSING,
    items: [
      {
        productId: 'prod-002',
        productName: 'Bolsas Plásticas 50x70 cm',
        productSku: 'BP-50X70-50',
        quantity: 3,
        unitPrice: 1800,
        subtotal: 5400
      },
      {
        productId: 'prod-011',
        productName: 'Limpiador de Vidrios 500ml',
        productSku: 'LIM-VID-500ML',
        quantity: 4,
        unitPrice: 980,
        subtotal: 3920
      },
      {
        productId: 'prod-012',
        productName: 'Limpiador de Pisos 2L',
        productSku: 'LIM-PISO-2L',
        quantity: 2,
        unitPrice: 1750,
        subtotal: 3500
      }
    ],
    subtotal: 12820,
    shippingCost: 2500,
    total: 15320,
    shippingAddress: MOCK_ADDRESSES.find((a) => a.id === 'addr-002')!,
    shippingCarrier: 'Valplas Express',
    paymentMethod: 'mercadopago',
    paymentId: 'MP-78901234',
    paymentStatus: 'approved',
    createdAt: '2024-02-24T08:45:00.000Z',
    updatedAt: '2024-02-24T12:00:00.000Z',
    user: MOCK_USERS.find((u) => u.id === 'user-004')
  },

  // ==================== ORDEN 8 - SHIPPED ====================
  {
    id: 'order-008',
    orderNumber: 'VLP-20240221-0008',
    userId: 'user-005',
    status: OrderStatus.SHIPPED,
    items: [
      {
        productId: 'prod-017',
        productName: 'Secador de Pelo Philips 2000W',
        productSku: 'PHIL-SEC-2000W',
        quantity: 1,
        unitPrice: 11200,
        subtotal: 11200
      },
      {
        productId: 'prod-006',
        productName: 'Magistral Detergente en Polvo 800g',
        productSku: 'DET-MAG-800G',
        quantity: 4,
        unitPrice: 1850,
        subtotal: 7400
      }
    ],
    subtotal: 18600,
    shippingCost: 0,
    total: 18600,
    shippingAddress: MOCK_ADDRESSES.find((a) => a.id === 'addr-003')!,
    shippingCarrier: 'Valplas Express',
    trackingNumber: 'VLP2024022100008',
    paymentMethod: 'mercadopago',
    paymentId: 'MP-89012345',
    paymentStatus: 'approved',
    createdAt: '2024-02-21T15:20:00.000Z',
    updatedAt: '2024-02-22T09:30:00.000Z',
    shippedAt: '2024-02-22T09:30:00.000Z',
    user: MOCK_USERS.find((u) => u.id === 'user-005')
  }
];
