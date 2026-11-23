import { query, transaction } from '../../infrastructure/database/client.js';
import type {
  AttributeDefinition,
  AttributeDefinitionWithCategories,
  CreateAttributeData,
  UpdateAttributeData
} from './attribute.types.js';

/** Columnas de la definición con alias `d.` (camelCase; el middleware ya convierte igual). */
const COLUMNS = `d.id, d.key, d.label, d.value_type AS "valueType", d.unit, d.options, d.aliases,
  d.display_order AS "displayOrder", d.is_active AS "isActive",
  d.created_at AS "createdAt", d.updated_at AS "updatedAt"`;

/** Lista paginada con las categorías asignadas embebidas (una sola query, sin N+1). */
export async function findAll(
  page: number,
  limit: number
): Promise<{ data: AttributeDefinitionWithCategories[]; total: number }> {
  const [list, count] = await Promise.all([
    query<AttributeDefinitionWithCategories>(
      `SELECT ${COLUMNS},
         COALESCE((
           SELECT json_agg(json_build_object('id', c.id, 'name', c.name) ORDER BY c.name)
           FROM category_attributes ca
           JOIN categories c ON c.id = ca.category_id AND c.deleted_at IS NULL
           WHERE ca.attribute_id = d.id
         ), '[]'::json) AS categories
       FROM attribute_definitions d
       ORDER BY d.display_order, d.label, d.id
       LIMIT $1 OFFSET $2`,
      [limit, (page - 1) * limit]
    ),
    query<{ count: string }>('SELECT COUNT(*) AS count FROM attribute_definitions')
  ]);
  return { data: list.rows, total: parseInt(count.rows[0].count, 10) };
}

export async function findById(id: string): Promise<AttributeDefinition | null> {
  const r = await query<AttributeDefinition>(
    `SELECT ${COLUMNS} FROM attribute_definitions d WHERE d.id = $1`,
    [id]
  );
  return r.rows[0] ?? null;
}

export async function keyExists(key: string): Promise<boolean> {
  const r = await query('SELECT 1 FROM attribute_definitions WHERE key = $1', [key]);
  return r.rows.length > 0;
}

export async function create(data: CreateAttributeData): Promise<AttributeDefinition> {
  const r = await query<AttributeDefinition>(
    `INSERT INTO attribute_definitions AS d
       (key, label, value_type, unit, options, aliases, display_order, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${COLUMNS}`,
    [
      data.key,
      data.label,
      data.value_type,
      data.unit ?? null,
      data.options ?? null,
      data.aliases,
      data.display_order,
      data.is_active
    ]
  );
  return r.rows[0];
}

export async function update(
  id: string,
  data: UpdateAttributeData
): Promise<AttributeDefinition | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const fields = [
    'label',
    'unit',
    'options',
    'aliases',
    'display_order',
    'is_active'
  ] as const satisfies readonly (keyof UpdateAttributeData)[];
  for (const field of fields) {
    if (data[field] !== undefined) {
      params.push(data[field]);
      sets.push(`${field} = $${params.length}`);
    }
  }
  params.push(id);
  const r = await query<AttributeDefinition>(
    `UPDATE attribute_definitions AS d SET ${sets.join(', ')}, updated_at = NOW()
     WHERE d.id = $${params.length} RETURNING ${COLUMNS}`,
    params
  );
  return r.rows[0] ?? null;
}

export async function hasValues(id: string): Promise<boolean> {
  const r = await query('SELECT 1 FROM product_attribute_values WHERE attribute_id = $1 LIMIT 1', [
    id
  ]);
  return r.rows.length > 0;
}

export async function remove(id: string): Promise<void> {
  await query('DELETE FROM attribute_definitions WHERE id = $1', [id]);
}

/** Ids de categorías (no borradas) que existen, de entre los recibidos. */
export async function findExistingCategoryIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const r = await query<{ id: string }>(
    'SELECT id FROM categories WHERE id = ANY($1) AND deleted_at IS NULL',
    [ids]
  );
  return r.rows.map((row) => row.id);
}

/** Reemplaza el conjunto de categorías del atributo. */
export async function replaceCategories(attributeId: string, categoryIds: string[]): Promise<void> {
  await transaction(async (client) => {
    await client.query('DELETE FROM category_attributes WHERE attribute_id = $1', [attributeId]);
    if (categoryIds.length > 0) {
      await client.query(
        `INSERT INTO category_attributes (category_id, attribute_id)
         SELECT cid, $1 FROM unnest($2::uuid[]) AS cid`,
        [attributeId, categoryIds]
      );
    }
  });
}

/**
 * Definiciones activas asignadas a la categoría o a cualquiera de sus ancestros.
 * Sin duplicados; orden: display_order de la asignación (el menor entre las que aplican),
 * luego el de la definición.
 */
export async function findForCategory(categoryId: string): Promise<AttributeDefinition[]> {
  const r = await query<AttributeDefinition>(
    `WITH RECURSIVE chain AS (
       SELECT id, parent_id, 0 AS depth FROM categories WHERE id = $1
       UNION ALL
       SELECT c.id, c.parent_id, chain.depth + 1
       FROM categories c JOIN chain ON c.id = chain.parent_id
       WHERE chain.depth < 20
     )
     SELECT ${COLUMNS}
     FROM attribute_definitions d
     JOIN (
       SELECT ca.attribute_id, MIN(ca.display_order) AS assignment_order
       FROM category_attributes ca
       WHERE ca.category_id IN (SELECT id FROM chain)
       GROUP BY ca.attribute_id
     ) a ON a.attribute_id = d.id
     WHERE d.is_active = true
     ORDER BY a.assignment_order, d.display_order, d.label, d.id`,
    [categoryId]
  );
  return r.rows;
}

export async function categoryExists(id: string): Promise<boolean> {
  const r = await query('SELECT 1 FROM categories WHERE id = $1 AND deleted_at IS NULL', [id]);
  return r.rows.length > 0;
}
