import { ShippingZone, ShippingRate } from '@/types';

/**
 * Mock shipping zones - Zonas de envío argentinas con códigos postales reales
 */

export const MOCK_SHIPPING_ZONES: ShippingZone[] = [
  {
    id: 'zone-001',
    name: 'CABA',
    province: 'CABA',
    postcodes: ['1000-1499'], // Rangos de CP de CABA
    isActive: true,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'zone-002',
    name: 'GBA Zona Norte',
    province: 'Buenos Aires',
    postcodes: ['1600-1659'], // Vicente López, San Isidro, Tigre, etc.
    isActive: true,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'zone-003',
    name: 'GBA Zona Sur',
    province: 'Buenos Aires',
    postcodes: ['1800-1899'], // Lomas de Zamora, Lanús, Avellaneda, etc.
    isActive: true,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'zone-004',
    name: 'GBA Zona Oeste',
    province: 'Buenos Aires',
    postcodes: ['1700-1759'], // Morón, Hurlingham, Ituzaingó, etc.
    isActive: true,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'zone-005',
    name: 'La Plata',
    province: 'Buenos Aires',
    postcodes: ['1900-1925'],
    isActive: true,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'zone-006',
    name: 'Provincia de Buenos Aires Interior',
    province: 'Buenos Aires',
    postcodes: ['6000-7999'], // Mar del Plata, Tandil, Olavarría, etc.
    excludedPostcodes: ['7000'], // CP excluido de ejemplo
    isActive: true,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'zone-007',
    name: 'Córdoba Capital',
    province: 'Córdoba',
    postcodes: ['5000-5099'],
    isActive: true,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'zone-008',
    name: 'Rosario',
    province: 'Santa Fe',
    postcodes: ['2000-2049'],
    isActive: true,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'zone-009',
    name: 'Mendoza Capital',
    province: 'Mendoza',
    postcodes: ['5500-5549'],
    isActive: true,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'zone-010',
    name: 'Interior del País',
    province: 'Varias',
    postcodes: ['3000-9999'], // Resto del país
    excludedPostcodes: ['5000-5549', '2000-2049'], // Excluir zonas específicas
    isActive: true,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  }
];

/**
 * Mock shipping rates - Tarifas por zona y monto
 */

export const MOCK_SHIPPING_RATES: ShippingRate[] = [
  // ==================== CABA ====================
  {
    id: 'rate-001',
    zoneId: 'zone-001',
    carrierName: 'Valplas Express',
    minAmount: 0,
    cost: 2500,
    estimatedDays: 1,
    isActive: true,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'rate-002',
    zoneId: 'zone-001',
    carrierName: 'Valplas Express',
    minAmount: 15000,
    cost: 0, // Envío gratis
    estimatedDays: 1,
    isActive: true,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },

  // ==================== GBA NORTE ====================
  {
    id: 'rate-003',
    zoneId: 'zone-002',
    carrierName: 'Valplas Express',
    minAmount: 0,
    cost: 3000,
    estimatedDays: 2,
    isActive: true,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'rate-004',
    zoneId: 'zone-002',
    carrierName: 'Valplas Express',
    minAmount: 20000,
    cost: 0,
    estimatedDays: 2,
    isActive: true,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },

  // ==================== GBA SUR ====================
  {
    id: 'rate-005',
    zoneId: 'zone-003',
    carrierName: 'Valplas Express',
    minAmount: 0,
    cost: 3000,
    estimatedDays: 2,
    isActive: true,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'rate-006',
    zoneId: 'zone-003',
    carrierName: 'Valplas Express',
    minAmount: 20000,
    cost: 0,
    estimatedDays: 2,
    isActive: true,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },

  // ==================== GBA OESTE ====================
  {
    id: 'rate-007',
    zoneId: 'zone-004',
    carrierName: 'Valplas Express',
    minAmount: 0,
    cost: 3000,
    estimatedDays: 2,
    isActive: true,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'rate-008',
    zoneId: 'zone-004',
    carrierName: 'Valplas Express',
    minAmount: 20000,
    cost: 0,
    estimatedDays: 2,
    isActive: true,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },

  // ==================== LA PLATA ====================
  {
    id: 'rate-009',
    zoneId: 'zone-005',
    carrierName: 'Valplas Express',
    minAmount: 0,
    cost: 3500,
    estimatedDays: 3,
    isActive: true,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'rate-010',
    zoneId: 'zone-005',
    carrierName: 'Valplas Express',
    minAmount: 25000,
    cost: 0,
    estimatedDays: 3,
    isActive: true,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },

  // ==================== PROVINCIA BS AS INTERIOR ====================
  {
    id: 'rate-011',
    zoneId: 'zone-006',
    carrierName: 'Valplas Express',
    minAmount: 0,
    cost: 5000,
    estimatedDays: 4,
    isActive: true,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'rate-012',
    zoneId: 'zone-006',
    carrierName: 'Valplas Express',
    minAmount: 30000,
    cost: 0,
    estimatedDays: 4,
    isActive: true,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },

  // ==================== CÓRDOBA ====================
  {
    id: 'rate-013',
    zoneId: 'zone-007',
    carrierName: 'Valplas Express',
    minAmount: 0,
    cost: 5500,
    estimatedDays: 5,
    isActive: true,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'rate-014',
    zoneId: 'zone-007',
    carrierName: 'Valplas Express',
    minAmount: 35000,
    cost: 0,
    estimatedDays: 5,
    isActive: true,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },

  // ==================== ROSARIO ====================
  {
    id: 'rate-015',
    zoneId: 'zone-008',
    carrierName: 'Valplas Express',
    minAmount: 0,
    cost: 5500,
    estimatedDays: 5,
    isActive: true,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'rate-016',
    zoneId: 'zone-008',
    carrierName: 'Valplas Express',
    minAmount: 35000,
    cost: 0,
    estimatedDays: 5,
    isActive: true,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },

  // ==================== MENDOZA ====================
  {
    id: 'rate-017',
    zoneId: 'zone-009',
    carrierName: 'Valplas Express',
    minAmount: 0,
    cost: 6500,
    estimatedDays: 7,
    isActive: true,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'rate-018',
    zoneId: 'zone-009',
    carrierName: 'Valplas Express',
    minAmount: 40000,
    cost: 0,
    estimatedDays: 7,
    isActive: true,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },

  // ==================== INTERIOR DEL PAÍS ====================
  {
    id: 'rate-019',
    zoneId: 'zone-010',
    carrierName: 'Valplas Express',
    minAmount: 0,
    cost: 8000,
    estimatedDays: 10,
    isActive: true,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'rate-020',
    zoneId: 'zone-010',
    carrierName: 'Valplas Express',
    minAmount: 50000,
    cost: 0,
    estimatedDays: 10,
    isActive: true,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  }
];
