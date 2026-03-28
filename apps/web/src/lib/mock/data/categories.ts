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
    parentId: null,
    imageUrl: '/categories/plasticos.jpg',
    isActive: true,
    displayOrder: 1,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'cat-002',
    name: 'Productos de Limpieza',
    slug: 'productos-limpieza',
    description: 'Productos de limpieza profesional y para el hogar',
    parentId: null,
    imageUrl: '/categories/limpieza.jpg',
    isActive: true,
    displayOrder: 2,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'cat-003',
    name: 'Electrodomésticos',
    slug: 'electrodomesticos',
    description: 'Electrodomésticos para el hogar',
    parentId: null,
    imageUrl: '/categories/electrodomesticos.jpg',
    isActive: true,
    displayOrder: 3,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },

  // ==================== SUBCATEGORIES - ARTÍCULOS PLÁSTICOS ====================
  {
    id: 'cat-004',
    name: 'Bolsas',
    slug: 'bolsas',
    description: 'Bolsas plásticas de todo tipo y tamaño',
    parentId: 'cat-001',
    imageUrl: null,
    isActive: true,
    displayOrder: 1,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'cat-005',
    name: 'Contenedores',
    slug: 'contenedores',
    description: 'Contenedores y recipientes plásticos',
    parentId: 'cat-001',
    imageUrl: null,
    isActive: true,
    displayOrder: 2,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },

  // ==================== SUBCATEGORIES - LIMPIEZA ====================
  {
    id: 'cat-006',
    name: 'Detergentes',
    slug: 'detergentes',
    description: 'Detergentes para ropa y vajilla',
    parentId: 'cat-002',
    imageUrl: null,
    isActive: true,
    displayOrder: 1,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'cat-007',
    name: 'Desinfectantes',
    slug: 'desinfectantes',
    description: 'Desinfectantes y lavandinas',
    parentId: 'cat-002',
    imageUrl: null,
    isActive: true,
    displayOrder: 2,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'cat-008',
    name: 'Limpiadores',
    slug: 'limpiadores',
    description: 'Limpiadores multiuso y especializados',
    parentId: 'cat-002',
    imageUrl: null,
    isActive: true,
    displayOrder: 3,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },

  // ==================== SUBCATEGORIES - ELECTRODOMÉSTICOS ====================
  {
    id: 'cat-009',
    name: 'Pequeños Electrodomésticos',
    slug: 'pequenos-electrodomesticos',
    description: 'Licuadoras, batidoras, tostadoras, etc.',
    parentId: 'cat-003',
    imageUrl: null,
    isActive: true,
    displayOrder: 1,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },
  {
    id: 'cat-010',
    name: 'Cuidado Personal',
    slug: 'cuidado-personal',
    description: 'Secadores de pelo, planchas, afeitadoras',
    parentId: 'cat-003',
    imageUrl: null,
    isActive: true,
    displayOrder: 2,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  }
];
