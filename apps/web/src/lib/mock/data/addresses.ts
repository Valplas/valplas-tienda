import { Address } from '@/types';

/**
 * Mock addresses - Direcciones de clientes con datos argentinos reales
 */

export const MOCK_ADDRESSES: Address[] = [
  // ==================== USER 004 - Juan Pérez ====================
  {
    id: 'addr-001',
    userId: 'user-004',
    label: 'Casa',
    street: 'Av. Corrientes',
    streetNumber: '1234',
    floor: '5',
    apartment: 'B',
    city: 'Buenos Aires',
    province: 'CABA',
    postcode: '1043',
    latitude: -34.6037,
    longitude: -58.3816,
    isDefault: true,
    createdAt: '2024-02-01T11:00:00.000Z',
    updatedAt: '2024-02-01T11:00:00.000Z'
  },
  {
    id: 'addr-002',
    userId: 'user-004',
    label: 'Trabajo',
    street: 'Av. Santa Fe',
    streetNumber: '3456',
    floor: '10',
    apartment: 'A',
    city: 'Buenos Aires',
    province: 'CABA',
    postcode: '1425',
    isDefault: false,
    createdAt: '2024-02-05T11:00:00.000Z',
    updatedAt: '2024-02-05T11:00:00.000Z'
  },

  // ==================== USER 005 - Ana López ====================
  {
    id: 'addr-003',
    userId: 'user-005',
    label: 'Casa',
    street: 'Calle Mitre',
    streetNumber: '567',
    city: 'La Plata',
    province: 'Buenos Aires',
    postcode: '1900',
    latitude: -34.9214,
    longitude: -57.9544,
    isDefault: true,
    createdAt: '2024-02-05T12:00:00.000Z',
    updatedAt: '2024-02-05T12:00:00.000Z'
  },

  // ==================== USER 006 - Pedro Martínez ====================
  {
    id: 'addr-004',
    userId: 'user-006',
    label: 'Hogar',
    street: 'Av. Vélez Sarsfield',
    streetNumber: '890',
    floor: '2',
    apartment: 'C',
    city: 'Córdoba',
    province: 'Córdoba',
    postcode: '5000',
    latitude: -31.4201,
    longitude: -64.1888,
    isDefault: true,
    createdAt: '2024-02-10T11:00:00.000Z',
    updatedAt: '2024-02-10T11:00:00.000Z'
  },

  // ==================== USER 007 - Laura García ====================
  {
    id: 'addr-005',
    userId: 'user-007',
    label: 'Casa',
    street: 'Calle San Martín',
    streetNumber: '2345',
    city: 'Rosario',
    province: 'Santa Fe',
    postcode: '2000',
    latitude: -32.9468,
    longitude: -60.6393,
    isDefault: true,
    createdAt: '2024-02-15T11:00:00.000Z',
    updatedAt: '2024-02-15T11:00:00.000Z'
  },
  {
    id: 'addr-006',
    userId: 'user-007',
    label: 'Local Comercial',
    street: 'Av. Pellegrini',
    streetNumber: '1500',
    city: 'Rosario',
    province: 'Santa Fe',
    postcode: '2000',
    isDefault: false,
    createdAt: '2024-02-16T11:00:00.000Z',
    updatedAt: '2024-02-16T11:00:00.000Z'
  },

  // ==================== USER 008 - Carlos Rodríguez ====================
  {
    id: 'addr-007',
    userId: 'user-008',
    label: 'Domicilio',
    street: 'Calle Las Heras',
    streetNumber: '678',
    floor: '3',
    apartment: 'D',
    city: 'Mendoza',
    province: 'Mendoza',
    postcode: '5500',
    latitude: -32.8895,
    longitude: -68.8458,
    isDefault: true,
    createdAt: '2024-02-20T11:00:00.000Z',
    updatedAt: '2024-02-20T11:00:00.000Z'
  },

  // ==================== USER 009 - Sofía Hernández ====================
  {
    id: 'addr-008',
    userId: 'user-009',
    label: 'Casa',
    street: 'Av. Rivadavia',
    streetNumber: '4567',
    floor: '8',
    apartment: 'F',
    city: 'Buenos Aires',
    province: 'CABA',
    postcode: '1406',
    latitude: -34.6158,
    longitude: -58.4333,
    isDefault: true,
    createdAt: '2024-02-25T11:00:00.000Z',
    updatedAt: '2024-02-25T11:00:00.000Z'
  }
];
