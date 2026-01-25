import { Address } from '@/types';

/**
 * Mock addresses - Direcciones de clientes con datos argentinos reales
 */

export const MOCK_ADDRESSES: Address[] = [
  // ==================== USER 004 - Juan Pérez ====================
  {
    id: 'addr-001',
    user_id: 'user-004',
    label: 'Casa',
    street: 'Av. Corrientes',
    street_number: '1234',
    floor: '5',
    apartment: 'B',
    city: 'Buenos Aires',
    province: 'CABA',
    postcode: '1043',
    latitude: -34.6037,
    longitude: -58.3816,
    is_default: true,
    created_at: '2024-02-01T11:00:00.000Z',
    updated_at: '2024-02-01T11:00:00.000Z'
  },
  {
    id: 'addr-002',
    user_id: 'user-004',
    label: 'Trabajo',
    street: 'Av. Santa Fe',
    street_number: '3456',
    floor: '10',
    apartment: 'A',
    city: 'Buenos Aires',
    province: 'CABA',
    postcode: '1425',
    is_default: false,
    created_at: '2024-02-05T11:00:00.000Z',
    updated_at: '2024-02-05T11:00:00.000Z'
  },

  // ==================== USER 005 - Ana López ====================
  {
    id: 'addr-003',
    user_id: 'user-005',
    label: 'Casa',
    street: 'Calle Mitre',
    street_number: '567',
    city: 'La Plata',
    province: 'Buenos Aires',
    postcode: '1900',
    latitude: -34.9214,
    longitude: -57.9544,
    is_default: true,
    created_at: '2024-02-05T12:00:00.000Z',
    updated_at: '2024-02-05T12:00:00.000Z'
  },

  // ==================== USER 006 - Pedro Martínez ====================
  {
    id: 'addr-004',
    user_id: 'user-006',
    label: 'Hogar',
    street: 'Av. Vélez Sarsfield',
    street_number: '890',
    floor: '2',
    apartment: 'C',
    city: 'Córdoba',
    province: 'Córdoba',
    postcode: '5000',
    latitude: -31.4201,
    longitude: -64.1888,
    is_default: true,
    created_at: '2024-02-10T11:00:00.000Z',
    updated_at: '2024-02-10T11:00:00.000Z'
  },

  // ==================== USER 007 - Laura García ====================
  {
    id: 'addr-005',
    user_id: 'user-007',
    label: 'Casa',
    street: 'Calle San Martín',
    street_number: '2345',
    city: 'Rosario',
    province: 'Santa Fe',
    postcode: '2000',
    latitude: -32.9468,
    longitude: -60.6393,
    is_default: true,
    created_at: '2024-02-15T11:00:00.000Z',
    updated_at: '2024-02-15T11:00:00.000Z'
  },
  {
    id: 'addr-006',
    user_id: 'user-007',
    label: 'Local Comercial',
    street: 'Av. Pellegrini',
    street_number: '1500',
    city: 'Rosario',
    province: 'Santa Fe',
    postcode: '2000',
    is_default: false,
    created_at: '2024-02-16T11:00:00.000Z',
    updated_at: '2024-02-16T11:00:00.000Z'
  },

  // ==================== USER 008 - Carlos Rodríguez ====================
  {
    id: 'addr-007',
    user_id: 'user-008',
    label: 'Domicilio',
    street: 'Calle Las Heras',
    street_number: '678',
    floor: '3',
    apartment: 'D',
    city: 'Mendoza',
    province: 'Mendoza',
    postcode: '5500',
    latitude: -32.8895,
    longitude: -68.8458,
    is_default: true,
    created_at: '2024-02-20T11:00:00.000Z',
    updated_at: '2024-02-20T11:00:00.000Z'
  },

  // ==================== USER 009 - Sofía Hernández ====================
  {
    id: 'addr-008',
    user_id: 'user-009',
    label: 'Casa',
    street: 'Av. Rivadavia',
    street_number: '4567',
    floor: '8',
    apartment: 'F',
    city: 'Buenos Aires',
    province: 'CABA',
    postcode: '1406',
    latitude: -34.6158,
    longitude: -58.4333,
    is_default: true,
    created_at: '2024-02-25T11:00:00.000Z',
    updated_at: '2024-02-25T11:00:00.000Z'
  }
];
