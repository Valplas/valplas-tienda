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
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'zone-002',
    name: 'GBA Zona Norte',
    province: 'Buenos Aires',
    postcodes: ['1600-1659'], // Vicente López, San Isidro, Tigre, etc.
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'zone-003',
    name: 'GBA Zona Sur',
    province: 'Buenos Aires',
    postcodes: ['1800-1899'], // Lomas de Zamora, Lanús, Avellaneda, etc.
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'zone-004',
    name: 'GBA Zona Oeste',
    province: 'Buenos Aires',
    postcodes: ['1700-1759'], // Morón, Hurlingham, Ituzaingó, etc.
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'zone-005',
    name: 'La Plata',
    province: 'Buenos Aires',
    postcodes: ['1900-1925'],
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'zone-006',
    name: 'Provincia de Buenos Aires Interior',
    province: 'Buenos Aires',
    postcodes: ['6000-7999'], // Mar del Plata, Tandil, Olavarría, etc.
    excluded_postcodes: ['7000'], // CP excluido de ejemplo
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'zone-007',
    name: 'Córdoba Capital',
    province: 'Córdoba',
    postcodes: ['5000-5099'],
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'zone-008',
    name: 'Rosario',
    province: 'Santa Fe',
    postcodes: ['2000-2049'],
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'zone-009',
    name: 'Mendoza Capital',
    province: 'Mendoza',
    postcodes: ['5500-5549'],
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'zone-010',
    name: 'Interior del País',
    province: 'Varias',
    postcodes: ['3000-9999'], // Resto del país
    excluded_postcodes: ['5000-5549', '2000-2049'], // Excluir zonas específicas
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  }
];

/**
 * Mock shipping rates - Tarifas por zona y monto
 */

export const MOCK_SHIPPING_RATES: ShippingRate[] = [
  // ==================== CABA ====================
  {
    id: 'rate-001',
    zone_id: 'zone-001',
    carrier_name: 'Valplas Express',
    min_amount: 0,
    cost: 2500,
    estimated_days: 1,
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'rate-002',
    zone_id: 'zone-001',
    carrier_name: 'Valplas Express',
    min_amount: 15000,
    cost: 0, // Envío gratis
    estimated_days: 1,
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },

  // ==================== GBA NORTE ====================
  {
    id: 'rate-003',
    zone_id: 'zone-002',
    carrier_name: 'Valplas Express',
    min_amount: 0,
    cost: 3000,
    estimated_days: 2,
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'rate-004',
    zone_id: 'zone-002',
    carrier_name: 'Valplas Express',
    min_amount: 20000,
    cost: 0,
    estimated_days: 2,
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },

  // ==================== GBA SUR ====================
  {
    id: 'rate-005',
    zone_id: 'zone-003',
    carrier_name: 'Valplas Express',
    min_amount: 0,
    cost: 3000,
    estimated_days: 2,
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'rate-006',
    zone_id: 'zone-003',
    carrier_name: 'Valplas Express',
    min_amount: 20000,
    cost: 0,
    estimated_days: 2,
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },

  // ==================== GBA OESTE ====================
  {
    id: 'rate-007',
    zone_id: 'zone-004',
    carrier_name: 'Valplas Express',
    min_amount: 0,
    cost: 3000,
    estimated_days: 2,
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'rate-008',
    zone_id: 'zone-004',
    carrier_name: 'Valplas Express',
    min_amount: 20000,
    cost: 0,
    estimated_days: 2,
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },

  // ==================== LA PLATA ====================
  {
    id: 'rate-009',
    zone_id: 'zone-005',
    carrier_name: 'Valplas Express',
    min_amount: 0,
    cost: 3500,
    estimated_days: 3,
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'rate-010',
    zone_id: 'zone-005',
    carrier_name: 'Valplas Express',
    min_amount: 25000,
    cost: 0,
    estimated_days: 3,
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },

  // ==================== PROVINCIA BS AS INTERIOR ====================
  {
    id: 'rate-011',
    zone_id: 'zone-006',
    carrier_name: 'Valplas Express',
    min_amount: 0,
    cost: 5000,
    estimated_days: 4,
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'rate-012',
    zone_id: 'zone-006',
    carrier_name: 'Valplas Express',
    min_amount: 30000,
    cost: 0,
    estimated_days: 4,
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },

  // ==================== CÓRDOBA ====================
  {
    id: 'rate-013',
    zone_id: 'zone-007',
    carrier_name: 'Valplas Express',
    min_amount: 0,
    cost: 5500,
    estimated_days: 5,
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'rate-014',
    zone_id: 'zone-007',
    carrier_name: 'Valplas Express',
    min_amount: 35000,
    cost: 0,
    estimated_days: 5,
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },

  // ==================== ROSARIO ====================
  {
    id: 'rate-015',
    zone_id: 'zone-008',
    carrier_name: 'Valplas Express',
    min_amount: 0,
    cost: 5500,
    estimated_days: 5,
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'rate-016',
    zone_id: 'zone-008',
    carrier_name: 'Valplas Express',
    min_amount: 35000,
    cost: 0,
    estimated_days: 5,
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },

  // ==================== MENDOZA ====================
  {
    id: 'rate-017',
    zone_id: 'zone-009',
    carrier_name: 'Valplas Express',
    min_amount: 0,
    cost: 6500,
    estimated_days: 7,
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'rate-018',
    zone_id: 'zone-009',
    carrier_name: 'Valplas Express',
    min_amount: 40000,
    cost: 0,
    estimated_days: 7,
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },

  // ==================== INTERIOR DEL PAÍS ====================
  {
    id: 'rate-019',
    zone_id: 'zone-010',
    carrier_name: 'Valplas Express',
    min_amount: 0,
    cost: 8000,
    estimated_days: 10,
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'rate-020',
    zone_id: 'zone-010',
    carrier_name: 'Valplas Express',
    min_amount: 50000,
    cost: 0,
    estimated_days: 10,
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  }
];
