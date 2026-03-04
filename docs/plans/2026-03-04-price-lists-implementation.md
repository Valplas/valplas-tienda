# Price Lists Feature — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementar listas de precios completas: 3 migraciones de BD, módulo backend REST y página de administración.

**Architecture:** Sigue el patrón existente del proyecto: migrations SQL → shared types → backend (repository → service → controller → routes) → frontend (service → validation → form component → page → sidebar). Cada ítem de pedido guarda el `price_list_id` usado y un snapshot del costo; el `revenue` es una generated column de PostgreSQL.

**Tech Stack:** PostgreSQL generated columns, Express + Zod, Next.js App Router, shadcn/ui Sheet + DataTable, React Hook Form, lucide-react

---

## Task 1: Migración 015 — Tabla `price_lists`

**Files:**

- Create: `apps/api/src/infrastructure/database/migrations/015_create_price_lists.sql`

**Step 1: Crear la migración**

```sql
-- Migration: 015_create_price_lists
-- Description: Create price_lists table for B2B manual order pricing
-- Created: 2026-03-04

CREATE TABLE price_lists (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  margin     NUMERIC(10, 4) NOT NULL DEFAULT 0,   -- percentage, e.g. 50.0000 = 50%
  discount   NUMERIC(10, 4) NOT NULL DEFAULT 0,   -- stored for future use, not applied in formula
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_price_lists_active ON price_lists(is_active) WHERE deleted_at IS NULL;

CREATE TRIGGER update_price_lists_updated_at
  BEFORE UPDATE ON price_lists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Rollback SQL:
-- DROP TRIGGER IF EXISTS update_price_lists_updated_at ON price_lists;
-- DROP TABLE IF EXISTS price_lists CASCADE;
```

**Step 2: Ejecutar la migración**

```bash
cd apps/api && bun run db:migrate
```

Expected: `✅ Migration 015_create_price_lists executed successfully`

**Step 3: Verificar en la BD**

```bash
cd apps/api && bun run db:migrate
```

O conectarse a la DB y correr:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'price_lists' ORDER BY ordinal_position;
```

**Step 4: Commit**

```bash
git add apps/api/src/infrastructure/database/migrations/015_create_price_lists.sql
git commit -m "feat(db): add price_lists table migration"
```

---

## Task 2: Migración 016 — `cost_price` en `products`

**Files:**

- Create: `apps/api/src/infrastructure/database/migrations/016_add_cost_price_to_products.sql`

**Step 1: Crear la migración**

```sql
-- Migration: 016_add_cost_price_to_products
-- Description: Add cost_price column to products for price list calculations
-- Created: 2026-03-04
-- Formula: unit_price = ROUND(cost_price * (1 + margin / 100))

ALTER TABLE products ADD COLUMN cost_price INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN products.cost_price IS 'Precio de costo en centavos. Usado para calcular precio con lista de precios.';

-- Rollback SQL:
-- ALTER TABLE products DROP COLUMN IF EXISTS cost_price;
```

**Step 2: Ejecutar**

```bash
cd apps/api && bun run db:migrate
```

Expected: `✅ Migration 016_add_cost_price_to_products executed successfully`

**Step 3: Commit**

```bash
git add apps/api/src/infrastructure/database/migrations/016_add_cost_price_to_products.sql
git commit -m "feat(db): add cost_price column to products"
```

---

## Task 3: Migración 017 — Campos de lista de precios en `order_items`

**Files:**

- Create: `apps/api/src/infrastructure/database/migrations/017_add_price_list_to_order_items.sql`

**Step 1: Crear la migración**

```sql
-- Migration: 017_add_price_list_to_order_items
-- Description: Add price list tracking fields to order_items
-- Created: 2026-03-04
-- revenue is a generated column: (unit_price - cost_price_snapshot) * quantity

ALTER TABLE order_items
  ADD COLUMN price_list_id      UUID REFERENCES price_lists(id) ON DELETE SET NULL,
  ADD COLUMN cost_price_snapshot INTEGER,
  ADD COLUMN revenue            INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN cost_price_snapshot IS NOT NULL
      THEN (unit_price - cost_price_snapshot) * quantity
      ELSE NULL
    END
  ) STORED;

CREATE INDEX idx_order_items_price_list_id
  ON order_items(price_list_id)
  WHERE price_list_id IS NOT NULL;

-- Rollback SQL:
-- DROP INDEX IF EXISTS idx_order_items_price_list_id;
-- ALTER TABLE order_items
--   DROP COLUMN IF EXISTS revenue,
--   DROP COLUMN IF EXISTS cost_price_snapshot,
--   DROP COLUMN IF EXISTS price_list_id;
```

**Step 2: Ejecutar**

```bash
cd apps/api && bun run db:migrate
```

Expected: `✅ Migration 017_add_price_list_to_order_items executed successfully`

**Step 3: Commit**

```bash
git add apps/api/src/infrastructure/database/migrations/017_add_price_list_to_order_items.sql
git commit -m "feat(db): add price list fields to order_items with generated revenue column"
```

---

## Task 4: Tipo compartido `PriceList` en shared

**Files:**

- Modify: `packages/shared/src/types/product.types.ts`
- Modify: `packages/shared/src/types/index.ts` (solo si no re-exporta product.types ya)

**Step 1: Agregar el tipo al final de `packages/shared/src/types/product.types.ts`**

```typescript
export interface PriceList {
  id: string;
  name: string;
  margin: number; // e.g. 50.0 = 50%
  discount: number; // stored, not used in formula yet
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreatePriceListInput {
  name: string;
  margin: number;
  discount?: number;
  is_active?: boolean;
}

export interface UpdatePriceListInput {
  name?: string;
  margin?: number;
  discount?: number;
  is_active?: boolean;
}
```

**Step 2: Verificar que `packages/shared/src/types/index.ts` exporta product.types**

Ya contiene `export * from './product.types.js';` — no hay que tocar nada.

**Step 3: Verificar que typecheck pasa**

```bash
cd packages/shared && bun run typecheck
```

Expected: sin errores

**Step 4: Commit**

```bash
git add packages/shared/src/types/product.types.ts
git commit -m "feat(shared): add PriceList types"
```

---

## Task 5: Backend — tipos y validadores

**Files:**

- Create: `apps/api/src/modules/price-lists/price-list.types.ts`
- Create: `apps/api/src/modules/price-lists/price-list.validator.ts`

**Step 1: Crear `price-list.types.ts`**

```typescript
import type { PriceList } from '@valplas/shared/types';

export interface PriceListFilters {
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface CreatePriceListData {
  name: string;
  margin: number;
  discount: number;
  isActive: boolean;
}

export interface UpdatePriceListData {
  name?: string;
  margin?: number;
  discount?: number;
  isActive?: boolean;
}

export interface PriceListCalculation {
  costPrice: number;
  margin: number;
  unitPrice: number;
}

export type { PriceList };
```

**Step 2: Crear `price-list.validator.ts`**

```typescript
import { z } from 'zod';

export const createPriceListSchema = z.object({
  name: z.string().min(1, 'Nombre es requerido').max(100, 'Nombre no puede exceder 100 caracteres'),
  margin: z
    .number({ invalid_type_error: 'Margen debe ser un número' })
    .min(0, 'Margen no puede ser negativo')
    .max(10000, 'Margen no puede exceder 10000%'),
  discount: z
    .number({ invalid_type_error: 'Descuento debe ser un número' })
    .min(0, 'Descuento no puede ser negativo')
    .max(100, 'Descuento no puede exceder 100%')
    .default(0),
  isActive: z.boolean().default(true)
});

export const updatePriceListSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    margin: z.number().min(0).max(10000).optional(),
    discount: z.number().min(0).max(100).optional(),
    isActive: z.boolean().optional()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debe proporcionar al menos un campo para actualizar'
  });

export type CreatePriceListInput = z.infer<typeof createPriceListSchema>;
export type UpdatePriceListInput = z.infer<typeof updatePriceListSchema>;
```

**Step 3: Commit**

```bash
git add apps/api/src/modules/price-lists/
git commit -m "feat(api): add price-list types and validators"
```

---

## Task 6: Backend — repository

**Files:**

- Create: `apps/api/src/modules/price-lists/price-list.repository.ts`

**Step 1: Crear el archivo**

```typescript
import { query } from '../../infrastructure/database/client.js';
import type { PriceList } from '@valplas/shared/types';
import type {
  CreatePriceListData,
  UpdatePriceListData,
  PriceListFilters
} from './price-list.types.js';

export async function findPriceLists(filters: PriceListFilters = {}) {
  const { search, isActive, page = 1, limit = 50 } = filters;
  const offset = (page - 1) * limit;

  const conditions: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  let i = 1;

  if (search) {
    conditions.push(`name ILIKE $${i}`);
    params.push(`%${search}%`);
    i++;
  }

  if (isActive !== undefined) {
    conditions.push(`is_active = $${i}`);
    params.push(isActive);
    i++;
  }

  const where = conditions.join(' AND ');

  const [listResult, countResult] = await Promise.all([
    query<PriceList>(
      `SELECT * FROM price_lists WHERE ${where} ORDER BY name ASC LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limit, offset]
    ),
    query<{ count: string }>(`SELECT COUNT(*) as count FROM price_lists WHERE ${where}`, params)
  ]);

  return {
    data: listResult.rows,
    total: parseInt(countResult.rows[0].count, 10)
  };
}

export async function findPriceListById(id: string): Promise<PriceList | null> {
  const result = await query<PriceList>(
    'SELECT * FROM price_lists WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  return result.rows[0] || null;
}

export async function createPriceList(data: CreatePriceListData): Promise<PriceList> {
  const result = await query<PriceList>(
    `INSERT INTO price_lists (name, margin, discount, is_active)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [data.name, data.margin, data.discount, data.isActive]
  );
  return result.rows[0];
}

export async function updatePriceList(
  id: string,
  data: UpdatePriceListData
): Promise<PriceList | null> {
  const updates: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (data.name !== undefined) {
    updates.push(`name = $${i}`);
    params.push(data.name);
    i++;
  }
  if (data.margin !== undefined) {
    updates.push(`margin = $${i}`);
    params.push(data.margin);
    i++;
  }
  if (data.discount !== undefined) {
    updates.push(`discount = $${i}`);
    params.push(data.discount);
    i++;
  }
  if (data.isActive !== undefined) {
    updates.push(`is_active = $${i}`);
    params.push(data.isActive);
    i++;
  }

  if (updates.length === 0) return null;

  params.push(id);
  const result = await query<PriceList>(
    `UPDATE price_lists SET ${updates.join(', ')} WHERE id = $${i} AND deleted_at IS NULL RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

export async function deletePriceList(id: string): Promise<boolean> {
  const result = await query(
    'UPDATE price_lists SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  return (result.rowCount || 0) > 0;
}

export async function isUsedInOrders(id: string): Promise<boolean> {
  const result = await query<{ count: string }>(
    'SELECT COUNT(*) as count FROM order_items WHERE price_list_id = $1',
    [id]
  );
  return parseInt(result.rows[0].count, 10) > 0;
}
```

**Step 2: Commit**

```bash
git add apps/api/src/modules/price-lists/price-list.repository.ts
git commit -m "feat(api): add price-list repository"
```

---

## Task 7: Backend — service

**Files:**

- Create: `apps/api/src/modules/price-lists/price-list.service.ts`

**Step 1: Crear el archivo**

```typescript
import { AppError } from '../../shared/middleware/error.middleware.js';
import * as repository from './price-list.repository.js';
import { query } from '../../infrastructure/database/client.js';
import type {
  CreatePriceListData,
  UpdatePriceListData,
  PriceListFilters,
  PriceListCalculation
} from './price-list.types.js';

export async function listPriceLists(filters: PriceListFilters) {
  return repository.findPriceLists(filters);
}

export async function getPriceListById(id: string) {
  const priceList = await repository.findPriceListById(id);
  if (!priceList) {
    throw new AppError('PRICE_LIST_NOT_FOUND', 'Lista de precios no encontrada', 404);
  }
  return priceList;
}

export async function createPriceList(data: CreatePriceListData) {
  return repository.createPriceList(data);
}

export async function updatePriceList(id: string, data: UpdatePriceListData) {
  await getPriceListById(id);

  const updated = await repository.updatePriceList(id, data);
  if (!updated) {
    throw new AppError(
      'PRICE_LIST_UPDATE_FAILED',
      'No se pudo actualizar la lista de precios',
      500
    );
  }
  return updated;
}

export async function deletePriceList(id: string): Promise<void> {
  await getPriceListById(id);

  const inUse = await repository.isUsedInOrders(id);
  if (inUse) {
    throw new AppError(
      'PRICE_LIST_IN_USE',
      'No se puede eliminar una lista de precios que está en uso en pedidos',
      400
    );
  }

  await repository.deletePriceList(id);
}

export async function calculatePrice(
  priceListId: string,
  productId: string
): Promise<PriceListCalculation> {
  const priceList = await getPriceListById(priceListId);

  const result = await query<{ cost_price: number }>(
    'SELECT cost_price FROM products WHERE id = $1 AND deleted_at IS NULL',
    [productId]
  );

  if (!result.rows[0]) {
    throw new AppError('PRODUCT_NOT_FOUND', 'Producto no encontrado', 404);
  }

  const costPrice = result.rows[0].cost_price;
  const margin = Number(priceList.margin);
  // Formula from CRM: unit_price = cost_price * (1 + margin / 100)
  const unitPrice = Math.round(costPrice * (1 + margin / 100));

  return { costPrice, margin, unitPrice };
}
```

**Step 2: Commit**

```bash
git add apps/api/src/modules/price-lists/price-list.service.ts
git commit -m "feat(api): add price-list service"
```

---

## Task 8: Backend — controller y routes

**Files:**

- Create: `apps/api/src/modules/price-lists/price-list.controller.ts`
- Create: `apps/api/src/modules/price-lists/price-list.routes.ts`

**Step 1: Crear `price-list.controller.ts`**

```typescript
import type { Request, Response, NextFunction } from 'express';
import * as service from './price-list.service.js';
import { ApiResponseBuilder as ApiResponse } from '../../shared/utils/api-response.js';

export async function listPriceLists(req: Request, res: Response, next: NextFunction) {
  try {
    const { search, isActive, page = '1', limit = '50' } = req.query;

    const filters = {
      search: search as string | undefined,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      page: parseInt(page as string, 10),
      limit: Math.min(parseInt(limit as string, 10), 100)
    };

    const result = await service.listPriceLists(filters);

    return res.json(
      ApiResponse.success({
        priceLists: result.data,
        pagination: {
          page: filters.page,
          limit: filters.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / filters.limit),
          hasMore: filters.page * filters.limit < result.total
        }
      })
    );
  } catch (error) {
    next(error);
  }
}

export async function getPriceListById(req: Request, res: Response, next: NextFunction) {
  try {
    const priceList = await service.getPriceListById(req.params.id);
    return res.json(ApiResponse.success({ priceList }));
  } catch (error) {
    next(error);
  }
}

export async function createPriceList(req: Request, res: Response, next: NextFunction) {
  try {
    const priceList = await service.createPriceList(req.body);
    return res.status(201).json(ApiResponse.success({ priceList }));
  } catch (error) {
    next(error);
  }
}

export async function updatePriceList(req: Request, res: Response, next: NextFunction) {
  try {
    const priceList = await service.updatePriceList(req.params.id, req.body);
    return res.json(ApiResponse.success({ priceList }));
  } catch (error) {
    next(error);
  }
}

export async function deletePriceList(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deletePriceList(req.params.id);
    return res.json(ApiResponse.success({ message: 'Lista de precios eliminada exitosamente' }));
  } catch (error) {
    next(error);
  }
}

export async function calculatePrice(req: Request, res: Response, next: NextFunction) {
  try {
    const { product_id } = req.query;

    if (!product_id || typeof product_id !== 'string') {
      return res.status(400).json(ApiResponse.error('VALIDATION_ERROR', 'product_id es requerido'));
    }

    const result = await service.calculatePrice(req.params.id, product_id);

    return res.json(ApiResponse.success(result));
  } catch (error) {
    next(error);
  }
}
```

**Step 2: Crear `price-list.routes.ts`**

```typescript
import { Router } from 'express';
import * as controller from './price-list.controller.js';
import { validate } from '../../shared/middleware/validation.middleware.js';
import { authMiddleware, requireRole } from '../../shared/middleware/auth.middleware.js';
import { createPriceListSchema, updatePriceListSchema } from './price-list.validator.js';

const router = Router();

// GET /:id/calculate DEBE ir antes que /:id para no confundirse
router.get(
  '/:id/calculate',
  authMiddleware,
  requireRole(['admin', 'owner']),
  controller.calculatePrice
);

router.get('/', authMiddleware, requireRole(['admin', 'owner']), controller.listPriceLists);
router.get('/:id', authMiddleware, requireRole(['admin', 'owner']), controller.getPriceListById);
router.post(
  '/',
  authMiddleware,
  requireRole(['admin', 'owner']),
  validate(createPriceListSchema),
  controller.createPriceList
);
router.patch(
  '/:id',
  authMiddleware,
  requireRole(['admin', 'owner']),
  validate(updatePriceListSchema),
  controller.updatePriceList
);
router.delete('/:id', authMiddleware, requireRole(['admin', 'owner']), controller.deletePriceList);

export default router;
```

**Step 3: Commit**

```bash
git add apps/api/src/modules/price-lists/price-list.controller.ts apps/api/src/modules/price-lists/price-list.routes.ts
git commit -m "feat(api): add price-list controller and routes"
```

---

## Task 9: Registrar la ruta en server.ts

**Files:**

- Modify: `apps/api/src/server.ts`

**Step 1: Agregar el import** (junto a los demás imports de routes, línea ~89)

```typescript
import priceListRoutes from './modules/price-lists/price-list.routes.js';
```

**Step 2: Registrar la ruta** (junto a los demás `app.use`, después de brandRoutes)

```typescript
app.use('/api/price-lists', priceListRoutes);
```

**Step 3: Verificar que el servidor arranca sin errores**

```bash
cd apps/api && bun run dev
```

Expected: servidor arranca en el puerto configurado sin errores de TypeScript.

**Step 4: Probar el endpoint manualmente**

```bash
# Necesitás un token de admin. Si tenés uno:
curl http://localhost:3001/api/price-lists \
  -H "Authorization: Bearer TU_TOKEN"
# Expected: { success: true, data: { priceLists: [], pagination: {...} } }
```

**Step 5: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "feat(api): register price-lists routes"
```

---

## Task 10: Frontend — servicio API

**Files:**

- Create: `apps/web/src/lib/services/price-lists.service.ts`

**Step 1: Crear el archivo**

```typescript
import { get, post, patch, del } from '../api';
import type { ApiResponse } from '../api';
import type { PriceList } from '@/types';

export interface PriceListsResponse {
  priceLists: PriceList[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export interface PriceCalculationResult {
  costPrice: number;
  margin: number;
  unitPrice: number;
}

export async function getPriceLists(params?: {
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}): Promise<ApiResponse<PriceListsResponse>> {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.isActive !== undefined) query.set('isActive', String(params.isActive));
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));

  const qs = query.toString();
  return get<PriceListsResponse>(`/price-lists${qs ? `?${qs}` : ''}`);
}

export async function getPriceListById(id: string): Promise<ApiResponse<{ priceList: PriceList }>> {
  return get<{ priceList: PriceList }>(`/price-lists/${id}`);
}

export async function createPriceList(data: {
  name: string;
  margin: number;
  discount?: number;
  isActive?: boolean;
}): Promise<ApiResponse<{ priceList: PriceList }>> {
  return post<{ priceList: PriceList }>('/price-lists', data);
}

export async function updatePriceList(
  id: string,
  data: Partial<{ name: string; margin: number; discount: number; isActive: boolean }>
): Promise<ApiResponse<{ priceList: PriceList }>> {
  return patch<{ priceList: PriceList }>(`/price-lists/${id}`, data);
}

export async function deletePriceList(id: string): Promise<ApiResponse<{ message: string }>> {
  return del<{ message: string }>(`/price-lists/${id}`);
}

export async function calculatePrice(
  priceListId: string,
  productId: string
): Promise<ApiResponse<PriceCalculationResult>> {
  return get<PriceCalculationResult>(
    `/price-lists/${priceListId}/calculate?product_id=${productId}`
  );
}
```

**Step 2: Verificar typecheck del frontend**

```bash
cd apps/web && bun run typecheck
```

Expected: sin errores

**Step 3: Commit**

```bash
git add apps/web/src/lib/services/price-lists.service.ts
git commit -m "feat(web): add price-lists API service"
```

---

## Task 11: Frontend — validación del formulario

**Files:**

- Create: `apps/web/src/lib/validations/price-list.ts`

**Step 1: Crear el archivo**

```typescript
import { z } from 'zod';

export const priceListSchema = z.object({
  name: z.string().min(1, 'Nombre es requerido').max(100, 'Máximo 100 caracteres'),
  margin: z
    .number({ invalid_type_error: 'Debe ser un número' })
    .min(0, 'No puede ser negativo')
    .max(10000, 'Máximo 10000%'),
  discount: z
    .number({ invalid_type_error: 'Debe ser un número' })
    .min(0, 'No puede ser negativo')
    .max(100, 'Máximo 100%')
    .default(0),
  is_active: z.boolean()
});

export type PriceListFormData = z.infer<typeof priceListSchema>;
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/validations/price-list.ts
git commit -m "feat(web): add price-list form validation schema"
```

---

## Task 12: Frontend — componente formulario

**Files:**

- Create: `apps/web/src/components/admin/price-list-form.tsx`

**Step 1: Crear el archivo**

```tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { priceListSchema, type PriceListFormData } from '@/lib/validations/price-list';
import type { PriceList } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';

interface PriceListFormProps {
  priceList?: PriceList;
  onSubmit: (data: PriceListFormData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function PriceListForm({ priceList, onSubmit, onCancel, isLoading }: PriceListFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue
  } = useForm<PriceListFormData>({
    resolver: zodResolver(priceListSchema),
    defaultValues: priceList
      ? {
          name: priceList.name,
          margin: priceList.margin,
          discount: priceList.discount,
          is_active: priceList.is_active
        }
      : { name: '', margin: 0, discount: 0, is_active: true }
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Nombre */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="name">
          Nombre <span className="text-red-500">*</span>
        </Label>
        <Input
          id="name"
          {...register('name')}
          placeholder="Ej: Lista Mayorista A"
          disabled={isLoading}
        />
        {errors.name && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.name.message}</p>
        )}
      </div>

      {/* Margen */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="margin">
          Margen (%) <span className="text-red-500">*</span>
        </Label>
        <Input
          id="margin"
          type="number"
          step="0.01"
          min="0"
          {...register('margin', { valueAsNumber: true })}
          placeholder="50"
          disabled={isLoading}
        />
        {errors.margin && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.margin.message}</p>
        )}
        <p className="text-xs text-muted-foreground">Precio final = Costo × (1 + Margen / 100)</p>
      </div>

      {/* Descuento (deshabilitado) */}
      <div className="space-y-2 relative pb-5">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="discount" className="text-muted-foreground">
            Descuento (%)
          </Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Guardado para uso futuro. No se aplica en la fórmula actual.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Input
          id="discount"
          type="number"
          step="0.01"
          min="0"
          max="100"
          {...register('discount', { valueAsNumber: true })}
          placeholder="0"
          disabled={true}
          className="opacity-50 cursor-not-allowed"
        />
      </div>

      {/* Activa */}
      <div className="flex items-center space-x-2">
        <Checkbox
          id="is_active"
          checked={watch('is_active')}
          onCheckedChange={(checked) => setValue('is_active', !!checked)}
          disabled={isLoading}
        />
        <Label htmlFor="is_active" className="cursor-pointer">
          Lista activa
        </Label>
      </div>

      {/* Acciones */}
      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Guardando...' : priceList ? 'Actualizar' : 'Crear'}
        </Button>
      </div>
    </form>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/admin/price-list-form.tsx
git commit -m "feat(web): add PriceListForm component"
```

---

## Task 13: Frontend — página admin

**Files:**

- Create: `apps/web/src/app/admin/listas-de-precio/page.tsx`

**Step 1: Crear el archivo**

```tsx
'use client';

import { useState, useEffect } from 'react';
import type { PriceList } from '@/types';
import {
  getPriceLists,
  createPriceList,
  updatePriceList,
  deletePriceList
} from '@/lib/services/price-lists.service';
import { DataTable, createCheckboxColumn } from '@/components/admin/data-table';
import { PriceListForm } from '@/components/admin/price-list-form';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ColumnDef } from '@tanstack/react-table';
import { Edit, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { PriceListFormData } from '@/lib/validations/price-list';

export default function ListasDePrecioPage() {
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<PriceList | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const res = await getPriceLists({ limit: 100 });
      if (res.success && res.data) {
        setPriceLists(res.data.priceLists);
      }
    } catch {
      toast.error('Error al cargar listas de precios');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = () => {
    setSelected(undefined);
    setSheetOpen(true);
  };
  const handleEdit = (pl: PriceList) => {
    setSelected(pl);
    setSheetOpen(true);
  };

  const handleSubmit = async (data: PriceListFormData) => {
    setIsSubmitting(true);
    try {
      if (selected) {
        await updatePriceList(selected.id, {
          name: data.name,
          margin: data.margin,
          discount: data.discount,
          isActive: data.is_active
        });
        toast.success('Lista de precios actualizada');
      } else {
        await createPriceList({
          name: data.name,
          margin: data.margin,
          discount: data.discount,
          isActive: data.is_active
        });
        toast.success('Lista de precios creada');
      }
      setSheetOpen(false);
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al guardar';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (items: PriceList[]) => {
    try {
      await Promise.all(items.map((pl) => deletePriceList(pl.id)));
      toast.success(
        `${items.length} lista${items.length > 1 ? 's' : ''} eliminada${items.length > 1 ? 's' : ''}`
      );
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al eliminar';
      toast.error(message);
    }
  };

  const columns: ColumnDef<PriceList>[] = [
    createCheckboxColumn<PriceList>(),
    {
      accessorKey: 'name',
      header: 'Nombre',
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>
    },
    {
      accessorKey: 'margin',
      header: 'Margen',
      cell: ({ row }) => <span>{Number(row.original.margin).toFixed(2)}%</span>
    },
    {
      accessorKey: 'discount',
      header: 'Descuento',
      cell: ({ row }) => (
        <span className="text-muted-foreground">{Number(row.original.discount).toFixed(2)}%</span>
      )
    },
    {
      accessorKey: 'is_active',
      header: 'Estado',
      cell: ({ row }) =>
        row.original.is_active ? (
          <Badge variant="default" className="bg-green-500">
            Activa
          </Badge>
        ) : (
          <Badge variant="outline">Inactiva</Badge>
        )
    },
    {
      id: 'actions',
      header: 'Acciones',
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" onClick={() => handleEdit(row.original)}>
          <Edit className="h-4 w-4" />
        </Button>
      ),
      enableSorting: false
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Listas de Precio</h1>
          <p className="text-muted-foreground">Gestión de listas de precios para pedidos</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva Lista
        </Button>
      </div>

      <DataTable
        data={priceLists}
        columns={columns}
        searchKey="name"
        searchPlaceholder="Buscar por nombre..."
        onDelete={handleDelete}
        isLoading={isLoading}
        getRowId={(row) => row.id}
        getRowName={(row) => row.name}
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-[480px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selected ? 'Editar Lista de Precio' : 'Nueva Lista de Precio'}</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <PriceListForm
              priceList={selected}
              onSubmit={handleSubmit}
              onCancel={() => setSheetOpen(false)}
              isLoading={isSubmitting}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
```

**Step 2: Verificar que la página compila sin errores**

```bash
cd apps/web && bun run typecheck
```

Expected: sin errores

**Step 3: Commit**

```bash
git add apps/web/src/app/admin/listas-de-precio/page.tsx
git commit -m "feat(web): add price lists admin page"
```

---

## Task 14: Agregar ítem al sidebar

**Files:**

- Modify: `apps/web/src/components/admin/admin-sidebar.tsx`

**Step 1: Agregar el import del ícono** (en el bloque de imports de lucide-react, línea ~9)

Agregar `Percent` a los imports existentes:

```typescript
import {
  LayoutDashboard,
  Package,
  FolderTree,
  Tag,
  ShoppingCart,
  Truck,
  Users,
  Percent, // ← agregar
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
```

**Step 2: Agregar el item al array `navItems`** (después del item de Marcas, línea ~49)

```typescript
  {
    title: 'Listas de Precio',
    href: '/admin/listas-de-precio',
    icon: Percent,
    roles: [UserRole.ADMIN, UserRole.OWNER]
  },
```

**Step 3: Verificar que arranca el frontend sin errores**

```bash
cd apps/web && bun run dev
```

Navegar a `http://localhost:3000/admin` y verificar que aparece "Listas de Precio" en el sidebar.

**Step 4: Commit**

```bash
git add apps/web/src/components/admin/admin-sidebar.tsx
git commit -m "feat(web): add price-lists nav item to admin sidebar"
```

---

## Verificación final

```bash
# Typecheck completo
bun typecheck

# Arrancar todo
bun dev

# Flujo manual a verificar:
# 1. Login como admin/owner
# 2. Navegar a /admin/listas-de-precio
# 3. Crear una lista con nombre "Mayorista A", margen 50%
# 4. Verificar que aparece en la tabla con estado Activa
# 5. Editar y cambiar el margen a 60%
# 6. Eliminar la lista (debe funcionar si no hay pedidos usando esa lista)
```
