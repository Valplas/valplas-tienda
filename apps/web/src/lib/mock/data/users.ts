import { User, UserRole } from '@/types';

/**
 * Mock users data
 * Passwords (sin hashear para MVP mock):
 * - owner@valplas.net: Valplas123
 * - admin@valplas.net: Admin123
 * - Todos los customers: Customer123
 */

export const MOCK_USERS: User[] = [
  // Owner
  {
    id: 'user-001',
    email: 'owner@valplas.net',
    username: 'owner_valplas',
    phone: '+541141234567',
    first_name: 'Carlos',
    last_name: 'Fernández',
    role: UserRole.OWNER,
    is_active: true,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },

  // Admin
  {
    id: 'user-002',
    email: 'admin@valplas.net',
    username: 'admin_valplas',
    phone: '+541141234568',
    first_name: 'María',
    last_name: 'González',
    role: UserRole.ADMIN,
    is_active: true,
    created_at: '2024-01-05T10:00:00.000Z',
    updated_at: '2024-01-05T10:00:00.000Z'
  },

  // Driver
  {
    id: 'user-003',
    email: 'driver@valplas.net',
    username: 'driver_valplas',
    phone: '+541141234569',
    first_name: 'Jorge',
    last_name: 'Ramírez',
    role: UserRole.DRIVER,
    is_active: true,
    created_at: '2024-01-10T10:00:00.000Z',
    updated_at: '2024-01-10T10:00:00.000Z'
  },

  // Customers
  {
    id: 'user-004',
    email: 'cliente1@gmail.com',
    username: 'juanperez',
    phone: '+541145678901',
    first_name: 'Juan',
    last_name: 'Pérez',
    role: UserRole.CUSTOMER,
    is_active: true,
    created_at: '2024-02-01T10:00:00.000Z',
    updated_at: '2024-02-01T10:00:00.000Z'
  },
  {
    id: 'user-005',
    email: 'cliente2@gmail.com',
    username: 'analopez',
    phone: '+541145678902',
    first_name: 'Ana',
    last_name: 'López',
    role: UserRole.CUSTOMER,
    is_active: true,
    created_at: '2024-02-05T10:00:00.000Z',
    updated_at: '2024-02-05T10:00:00.000Z'
  },
  {
    id: 'user-006',
    email: 'cliente3@gmail.com',
    username: 'pedromartinez',
    phone: '+541145678903',
    first_name: 'Pedro',
    last_name: 'Martínez',
    role: UserRole.CUSTOMER,
    is_active: true,
    created_at: '2024-02-10T10:00:00.000Z',
    updated_at: '2024-02-10T10:00:00.000Z'
  },
  {
    id: 'user-007',
    email: 'cliente4@gmail.com',
    username: 'lauragarcia',
    phone: '+541145678904',
    first_name: 'Laura',
    last_name: 'García',
    role: UserRole.CUSTOMER,
    is_active: true,
    created_at: '2024-02-15T10:00:00.000Z',
    updated_at: '2024-02-15T10:00:00.000Z'
  },
  {
    id: 'user-008',
    email: 'cliente5@gmail.com',
    username: 'carlosrodriguez',
    phone: '+541145678905',
    first_name: 'Carlos',
    last_name: 'Rodríguez',
    role: UserRole.CUSTOMER,
    is_active: true,
    created_at: '2024-02-20T10:00:00.000Z',
    updated_at: '2024-02-20T10:00:00.000Z'
  },
  {
    id: 'user-009',
    email: 'cliente6@gmail.com',
    username: 'sofiahernandez',
    phone: '+541145678906',
    first_name: 'Sofía',
    last_name: 'Hernández',
    role: UserRole.CUSTOMER,
    is_active: true,
    created_at: '2024-02-25T10:00:00.000Z',
    updated_at: '2024-02-25T10:00:00.000Z'
  }
];

/**
 * Mock credentials para login
 * En MVP mock, guardamos passwords en texto plano
 * En producción, esto estaría hasheado en backend
 */
export const MOCK_CREDENTIALS: Record<string, string> = {
  'owner@valplas.net': 'Valplas123',
  owner_valplas: 'Valplas123',
  'admin@valplas.net': 'Admin123',
  admin_valplas: 'Admin123',
  'driver@valplas.net': 'Driver123',
  driver_valplas: 'Driver123',
  'cliente1@gmail.com': 'Customer123',
  juanperez: 'Customer123',
  'cliente2@gmail.com': 'Customer123',
  analopez: 'Customer123',
  'cliente3@gmail.com': 'Customer123',
  pedromartinez: 'Customer123',
  'cliente4@gmail.com': 'Customer123',
  lauragarcia: 'Customer123',
  'cliente5@gmail.com': 'Customer123',
  carlosrodriguez: 'Customer123',
  'cliente6@gmail.com': 'Customer123',
  sofiahernandez: 'Customer123'
};
