import type { PoolClient } from 'pg';
import { query, transaction } from '../../infrastructure/database/client.js';
import { normalizeSearchText, type AttributeAliasIndex } from '../catalog/search-parser.js';
import type {
  AdminProductAttribute,
  AttributeDefinition,
  AttributeValueType,
  AttributeDefinitionWithCategories,
  CreateAttributeData,
  ProductAttributeView,
  ResolvedProductAttributeValue,
  UpdateAttributeData
} from './attribute.types.js';

const ALIAS_INDEX_TTL_MS = 60_000;
let aliasIndexCache: { index: AttributeAliasIndex; expiresAt: number } | null = null;

/** Descarta el índice de alias en caché: la próxima búsqueda lo recarga. */
export function invalidateAliasIndex(): void {
  aliasIndexCache = null;
}

/**
 * Índice término → clave de atributo para parseSearch ("20 mic" → micrones), armado con las
 * definiciones activas en UNA query y cacheado 60 s en memoria (create/update/remove lo
 * invalidan en este proceso). Términos normalizados como el texto buscado: clave, label y
 * alias; después la unidad ("µm" → "um"). Si dos atributos comparten un término gana el de
 * menor display_order, y una unidad nunca pisa una clave/label/alias ("cm" → ancho).
 */
export async function getAliasIndex(): Promise<AttributeAliasIndex> {
  if (aliasIndexCache && aliasIndexCache.expiresAt > Date.now()) return aliasIndexCache.index;

  const r = await query<{ key: string; label: string; unit: string | null; aliases: string[] }>(
    `SELECT key, label, unit, aliases FROM attribute_definitions
     WHERE is_active = true
     ORDER BY display_order, key`
  );
  const terms = new Map<string, string>();
  const add = (raw: string | null, key: string) => {
    if (!raw) return;
    const term = normalizeSearchText(raw);
    // El parser compara de a un token: términos con espacios ("g/m²" → "g m") nunca coincidirían
    if (/^[a-z0-9]+$/.test(term) && !terms.has(term)) terms.set(term, key);
  };
  for (const row of r.rows) {
    add(row.key, row.key);
    add(row.label, row.key);
    for (const alias of row.aliases ?? []) add(alias, row.key);
  }
  for (const row of r.rows) add(row.unit, row.key);

  const index: AttributeAliasIndex = { terms };
  aliasIndexCache = { index, expiresAt: Date.now() + ALIAS_INDEX_TTL_MS };
  return index;
}

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
  invalidateAliasIndex();
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
  invalidateAliasIndex();
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
  invalidateAliasIndex();
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

interface ValueRow {
  product_id: string;
  attribute_id: string;
  key: string;
  label: string;
  value_type: AttributeValueType;
  unit: string | null;
  value_number: string | null;
  value_text: string | null;
}

/**
 * Valores de varios productos con su definición ACTIVA, en UNA query, ordenados por
 * display_order y label de la definición.
 */
async function findValueRows(productIds: string[]): Promise<ValueRow[]> {
  if (productIds.length === 0) return [];
  const r = await query<ValueRow>(
    `SELECT pav.product_id, d.id AS attribute_id, d.key, d.label, d.value_type, d.unit,
            pav.value_number, pav.value_text
     FROM product_attribute_values pav
     JOIN attribute_definitions d ON d.id = pav.attribute_id AND d.is_active = true
     WHERE pav.product_id = ANY($1)
     ORDER BY pav.product_id, d.display_order, d.label, d.id`,
    [productIds]
  );
  return r.rows;
}

function toValue(row: ValueRow): number | string {
  return row.value_type === 'number' ? Number(row.value_number) : (row.value_text ?? '');
}

/** Atributos públicos por producto (productos sin valores no aparecen en el mapa). */
export async function findValuesByProductIds(
  ids: string[]
): Promise<Map<string, ProductAttributeView[]>> {
  const result = new Map<string, ProductAttributeView[]>();
  for (const row of await findValueRows(ids)) {
    const list = result.get(row.product_id) ?? [];
    list.push({ key: row.key, label: row.label, value: toValue(row), unit: row.unit });
    result.set(row.product_id, list);
  }
  return result;
}

/** Igual que findValuesByProductIds pero con attributeId y valueType (para editar en el admin). */
export async function findAdminValuesByProductId(
  productId: string
): Promise<AdminProductAttribute[]> {
  return (await findValueRows([productId])).map((row) => ({
    attributeId: row.attribute_id,
    key: row.key,
    label: row.label,
    valueType: row.value_type,
    unit: row.unit,
    value: toValue(row)
  }));
}

/** Definiciones (activas o no) de los ids recibidos. */
export async function findByIds(ids: string[]): Promise<AttributeDefinition[]> {
  if (ids.length === 0) return [];
  const r = await query<AttributeDefinition>(
    `SELECT ${COLUMNS} FROM attribute_definitions d WHERE d.id = ANY($1)`,
    [ids]
  );
  return r.rows;
}

/**
 * Reemplaza los valores del producto dentro de la transacción del llamador. Solo se pisan los
 * de definiciones activas (las inactivas no se ven ni se editan y conservan su valor).
 */
export async function replaceProductValues(
  client: PoolClient,
  productId: string,
  values: ResolvedProductAttributeValue[]
): Promise<void> {
  await client.query(
    `DELETE FROM product_attribute_values
     WHERE product_id = $1
       AND attribute_id IN (SELECT id FROM attribute_definitions WHERE is_active = true)`,
    [productId]
  );
  if (values.length === 0) return;
  await client.query(
    `INSERT INTO product_attribute_values (product_id, attribute_id, value_number, value_text)
     SELECT $1, x.attribute_id, x.value_number, x.value_text
     FROM unnest($2::uuid[], $3::numeric[], $4::text[]) AS x(attribute_id, value_number, value_text)`,
    [
      productId,
      values.map((v) => v.attributeId),
      values.map((v) => v.valueNumber),
      values.map((v) => v.valueText)
    ]
  );
}

/** Valores de texto de `values` que algún producto tiene cargados para el atributo. */
export async function findValuesInUse(attributeId: string, values: string[]): Promise<string[]> {
  if (values.length === 0) return [];
  const r = await query<{ value_text: string }>(
    `SELECT DISTINCT value_text FROM product_attribute_values
     WHERE attribute_id = $1 AND value_text = ANY($2)
     ORDER BY value_text`,
    [attributeId, values]
  );
  return r.rows.map((row) => row.value_text);
}
