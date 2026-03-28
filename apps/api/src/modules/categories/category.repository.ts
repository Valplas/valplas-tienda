import { query } from '../../infrastructure/database/client.js';
import type { Category } from '@valplas/shared/types';
import type {
  CategoryWithChildren,
  CreateCategoryData,
  UpdateCategoryData
} from './category.types.js';

function transformCategoryRow(row: Record<string, unknown>): Category {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    description: (row.description as string | null) ?? null,
    parentId: (row.parent_id as string | null) ?? null,
    imageUrl: (row.image_url as string | null) ?? null,
    isActive: row.is_active as boolean,
    displayOrder: row.display_order as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  };
}

/**
 * Obtener todas las categorías (para construir árbol)
 */
export async function findAllCategories(): Promise<Category[]> {
  const result = await query(
    `SELECT *
     FROM categories
     WHERE deleted_at IS NULL AND is_active = true
     ORDER BY display_order ASC, name ASC`
  );

  return result.rows.map(transformCategoryRow);
}

/**
 * Buscar categoría por ID
 */
export async function findCategoryById(id: string): Promise<Category | null> {
  const result = await query('SELECT * FROM categories WHERE id = $1 AND deleted_at IS NULL', [id]);

  return result.rows[0] ? transformCategoryRow(result.rows[0]) : null;
}

/**
 * Buscar categoría por slug
 */
export async function findCategoryBySlug(slug: string): Promise<Category | null> {
  const result = await query('SELECT * FROM categories WHERE slug = $1 AND deleted_at IS NULL', [
    slug
  ]);

  return result.rows[0] ? transformCategoryRow(result.rows[0]) : null;
}

/**
 * Verificar si slug existe
 */
export async function slugExists(slug: string, excludeId?: string): Promise<boolean> {
  const conditions = ['slug = $1', 'deleted_at IS NULL'];
  const params: unknown[] = [slug];

  if (excludeId) {
    conditions.push('id != $2');
    params.push(excludeId);
  }

  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM categories WHERE ${conditions.join(' AND ')}`,
    params
  );

  return parseInt(result.rows[0].count, 10) > 0;
}

/**
 * Verificar si tiene subcategorías
 */
export async function hasChildren(id: string): Promise<boolean> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM categories
     WHERE parent_id = $1 AND deleted_at IS NULL`,
    [id]
  );

  return parseInt(result.rows[0].count, 10) > 0;
}

/**
 * Verificar si tiene productos
 */
export async function hasProducts(id: string): Promise<boolean> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM products
     WHERE category_id = $1 AND deleted_at IS NULL`,
    [id]
  );

  return parseInt(result.rows[0].count, 10) > 0;
}

/**
 * Obtener conteo de productos por categoría
 */
export async function getProductCount(id: string): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM products
     WHERE category_id = $1 AND deleted_at IS NULL AND is_active = true`,
    [id]
  );

  return parseInt(result.rows[0].count, 10);
}

/**
 * Crear categoría
 */
export async function createCategory(data: CreateCategoryData): Promise<Category> {
  const result = await query(
    `INSERT INTO categories (name, slug, description, image_url, parent_id, display_order, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      data.name,
      data.slug,
      data.description || null,
      data.imageUrl || null,
      data.parentId || null,
      data.displayOrder || 0,
      true
    ]
  );

  return transformCategoryRow(result.rows[0]);
}

/**
 * Actualizar categoría
 */
export async function updateCategory(
  id: string,
  data: UpdateCategoryData
): Promise<Category | null> {
  const updates: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    updates.push(`name = $${paramIndex}`);
    params.push(data.name);
    paramIndex++;
  }

  if (data.slug !== undefined) {
    updates.push(`slug = $${paramIndex}`);
    params.push(data.slug);
    paramIndex++;
  }

  if (data.description !== undefined) {
    updates.push(`description = $${paramIndex}`);
    params.push(data.description);
    paramIndex++;
  }

  if (data.imageUrl !== undefined) {
    updates.push(`image_url = $${paramIndex}`);
    params.push(data.imageUrl);
    paramIndex++;
  }

  if (data.parentId !== undefined) {
    updates.push(`parent_id = $${paramIndex}`);
    params.push(data.parentId);
    paramIndex++;
  }

  if (data.displayOrder !== undefined) {
    updates.push(`display_order = $${paramIndex}`);
    params.push(data.displayOrder);
    paramIndex++;
  }

  if (data.isActive !== undefined) {
    updates.push(`is_active = $${paramIndex}`);
    params.push(data.isActive);
    paramIndex++;
  }

  if (updates.length === 0) return null;

  params.push(id);

  const result = await query(
    `UPDATE categories
     SET ${updates.join(', ')}
     WHERE id = $${paramIndex} AND deleted_at IS NULL
     RETURNING *`,
    params
  );

  return result.rows[0] ? transformCategoryRow(result.rows[0]) : null;
}

/**
 * Actualizar display_order de múltiples categorías
 */
export async function updateDisplayOrders(
  categories: Array<{ id: string; displayOrder: number }>
): Promise<void> {
  // Usar transacción para actualizar todos
  for (const cat of categories) {
    await query('UPDATE categories SET display_order = $1 WHERE id = $2 AND deleted_at IS NULL', [
      cat.displayOrder,
      cat.id
    ]);
  }
}

/**
 * Soft delete categoría
 */
export async function deleteCategory(id: string): Promise<boolean> {
  const result = await query(
    'UPDATE categories SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );

  return (result.rowCount || 0) > 0;
}

/**
 * Construir árbol jerárquico de categorías
 */
export function buildCategoryTree(categories: Category[]): CategoryWithChildren[] {
  const categoryMap = new Map<string, CategoryWithChildren>();
  const rootCategories: CategoryWithChildren[] = [];

  // Inicializar mapa
  categories.forEach((cat) => {
    categoryMap.set(cat.id, { ...cat, children: [] });
  });

  // Construir árbol
  categories.forEach((cat) => {
    const category = categoryMap.get(cat.id);
    if (!category) return; // Skip if not found (shouldn't happen)

    if (cat.parentId) {
      const parent = categoryMap.get(cat.parentId);
      if (parent) {
        parent.children.push(category);
      } else {
        // Si el padre no existe o está eliminado, agregar como raíz
        rootCategories.push(category);
      }
    } else {
      rootCategories.push(category);
    }
  });

  return rootCategories;
}
