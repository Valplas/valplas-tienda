import { Category } from '@/types';

/**
 * Mock categories - Árbol jerárquico
 *
 * Estructura:
 * - Artículos Plásticos
 *   - Bolsas
 *   - Contenedores
 * - Productos de Limpieza
 *   - Detergentes
 *   - Desinfectantes
 *   - Limpiadores
 * - Electrodomésticos
 *   - Pequeños Electrodomésticos
 *   - Cuidado Personal
 */

export const MOCK_CATEGORIES: Category[] = [
  // ==================== ROOT CATEGORIES ====================
  {
    id: 'cat-001',
    name: 'Artículos Plásticos',
    slug: 'articulos-plasticos',
    description: 'Todo tipo de artículos plásticos para comercio y hogar',
    parent_id: null,
    image_url: '/categories/plasticos.jpg',
    is_active: true,
    display_order: 1,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'cat-002',
    name: 'Productos de Limpieza',
    slug: 'productos-limpieza',
    description: 'Productos de limpieza profesional y para el hogar',
    parent_id: null,
    image_url: '/categories/limpieza.jpg',
    is_active: true,
    display_order: 2,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'cat-003',
    name: 'Electrodomésticos',
    slug: 'electrodomesticos',
    description: 'Electrodomésticos para el hogar',
    parent_id: null,
    image_url: '/categories/electrodomesticos.jpg',
    is_active: true,
    display_order: 3,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },

  // ==================== SUBCATEGORIES - ARTÍCULOS PLÁSTICOS ====================
  {
    id: 'cat-004',
    name: 'Bolsas',
    slug: 'bolsas',
    description: 'Bolsas plásticas de todo tipo y tamaño',
    parent_id: 'cat-001',
    image_url: null,
    is_active: true,
    display_order: 1,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'cat-005',
    name: 'Contenedores',
    slug: 'contenedores',
    description: 'Contenedores y recipientes plásticos',
    parent_id: 'cat-001',
    image_url: null,
    is_active: true,
    display_order: 2,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },

  // ==================== SUBCATEGORIES - LIMPIEZA ====================
  {
    id: 'cat-006',
    name: 'Detergentes',
    slug: 'detergentes',
    description: 'Detergentes para ropa y vajilla',
    parent_id: 'cat-002',
    image_url: null,
    is_active: true,
    display_order: 1,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'cat-007',
    name: 'Desinfectantes',
    slug: 'desinfectantes',
    description: 'Desinfectantes y lavandinas',
    parent_id: 'cat-002',
    image_url: null,
    is_active: true,
    display_order: 2,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'cat-008',
    name: 'Limpiadores',
    slug: 'limpiadores',
    description: 'Limpiadores multiuso y especializados',
    parent_id: 'cat-002',
    image_url: null,
    is_active: true,
    display_order: 3,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },

  // ==================== SUBCATEGORIES - ELECTRODOMÉSTICOS ====================
  {
    id: 'cat-009',
    name: 'Pequeños Electrodomésticos',
    slug: 'pequenos-electrodomesticos',
    description: 'Licuadoras, batidoras, tostadoras, etc.',
    parent_id: 'cat-003',
    image_url: null,
    is_active: true,
    display_order: 1,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'cat-010',
    name: 'Cuidado Personal',
    slug: 'cuidado-personal',
    description: 'Secadores de pelo, planchas, afeitadoras',
    parent_id: 'cat-003',
    image_url: null,
    is_active: true,
    display_order: 2,
    created_at: '2024-01-01T10:00:00.000Z',
    updated_at: '2024-01-01T10:00:00.000Z'
  }
];
