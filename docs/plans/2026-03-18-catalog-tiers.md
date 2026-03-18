# Catálogo Público con Tiers de Precio — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Construir el módulo `catalog` con precios por volumen (tiers), y rediseñar la `ProductCard` para mostrar los tiers y el selector de presentación.

**Architecture:** Nueva tabla `product_price_tiers` vincula productos con listas de precios por cantidad mínima. El backend expone `GET /api/catalog/products` (módulo separado, sin auth) con precios calculados en SQL. El frontend reemplaza `ProductCard` con diseño de tiers y reconecta la página de catálogo al nuevo endpoint.

**Tech Stack:** PostgreSQL (cálculo de precio en SQL inline), Express, Next.js, Zustand, shadcn/ui, Tailwind

---

### Task 1: Migración DB — tabla `product_price_tiers`

**Files:**

- Create: `apps/api/src/infrastructure/database/migrations/032_create_product_price_tiers.sql`

**Step 1: Crear el archivo de migración**

```sql
-- Migration 032: Create product_price_tiers
-- Defines pricing tiers per product: each tier maps a min_quantity to a price_list.
-- Formula: unit_price = ROUND(p.cost_price::numeric * (1 + pl.margin / 100))::integer
-- Tiers coexist with manual admin orders (order_items.price_list_id is independent).

CREATE TABLE product_price_tiers (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id     UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price_list_id  UUID        NOT NULL REFERENCES price_lists(id) ON DELETE RESTRICT,
  min_quantity   INTEGER     NOT NULL CHECK (min_quantity >= 1),
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, min_quantity)
);

CREATE INDEX idx_product_price_tiers_product_id ON product_price_tiers(product_id)
  WHERE is_active = true;

CREATE TRIGGER set_product_price_tiers_updated_at
  BEFORE UPDATE ON product_price_tiers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Rollback:
-- DROP TRIGGER IF EXISTS set_product_price_tiers_updated_at ON product_price_tiers;
-- DROP TABLE IF EXISTS product_price_tiers CASCADE;
```

**Step 2: Ejecutar la migración**

```bash
cd C:/Programacion/ValplasTienda/valplas-tienda
bun db:migrate
```

Expected output:

```
▶️  Ejecutando: 032_create_product_price_tiers.sql
✅ Completada: 032_create_product_price_tiers.sql
🎉 Migraciones completadas exitosamente
```

**Step 3: Commit**

```bash
git add apps/api/src/infrastructure/database/migrations/032_create_product_price_tiers.sql
git commit -m "feat(catalog): migration to create product_price_tiers table"
```

---

### Task 2: Backend — `catalog.repository.ts`

**Files:**

- Create: `apps/api/src/modules/catalog/catalog.repository.ts`

**Step 1: Crear el archivo**

```typescript
import { query } from '../../infrastructure/database/client.js';

export interface PriceTier {
  min_quantity: number;
  unit_price: number;
}

export interface PublicProduct {
  id: string;
  sku: string;
  name: string;
  slug: string;
  image_url: string | null;
  available_stock: number;
  category_id: string;
  brand_id: string | null;
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  tiers: PriceTier[];
  base_price: number; // fallback si no hay tiers
}

export interface CatalogFilters {
  search?: string;
  category_id?: string;
  brand_id?: string;
  page?: number;
  limit?: number;
}

/**
 * Obtener productos públicos con tiers de precio calculados en DB.
 * cost_price y margin nunca se exponen al cliente.
 */
export async function findPublicProducts(
  filters: CatalogFilters
): Promise<{ products: PublicProduct[]; total: number }> {
  const { search, category_id, brand_id, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;
  const conditions: string[] = [
    'p.deleted_at IS NULL',
    'p.is_active = true',
    '(p.stock - p.reserved_stock) > 0'
  ];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (search) {
    conditions.push(
      `(unaccent(p.name) ILIKE unaccent($${paramIndex}) OR p.sku ILIKE $${paramIndex})`
    );
    params.push(`%${search}%`);
    paramIndex++;
  }

  if (category_id) {
    conditions.push(`p.category_id = $${paramIndex}`);
    params.push(category_id);
    paramIndex++;
  }

  if (brand_id) {
    conditions.push(`p.brand_id = $${paramIndex}`);
    params.push(brand_id);
    paramIndex++;
  }

  const where = conditions.join(' AND ');

  // Obtener productos con primera imagen
  const productsQuery = `
    SELECT
      p.id,
      p.sku,
      p.name,
      p.slug,
      p.base_price,
      (p.stock - p.reserved_stock) AS available_stock,
      p.category_id,
      p.brand_id,
      c.name AS category_name,
      b.name AS brand_name,
      (
        SELECT pi.url
        FROM product_images pi
        WHERE pi.product_id = p.id
        ORDER BY pi.position ASC
        LIMIT 1
      ) AS image_url
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN brands b ON b.id = p.brand_id
    WHERE ${where}
    ORDER BY p.name ASC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  params.push(limit, offset);

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM products p
    LEFT JOIN brands b ON b.id = p.brand_id
    WHERE ${where}
  `;
  const countParams = params.slice(0, paramIndex - 1);

  const [productsResult, countResult] = await Promise.all([
    query<{
      id: string;
      sku: string;
      name: string;
      slug: string;
      base_price: number;
      available_stock: number;
      category_id: string;
      brand_id: string | null;
      category_name: string | null;
      brand_name: string | null;
      image_url: string | null;
    }>(productsQuery, params),
    query<{ total: string }>(countQuery, countParams)
  ]);

  const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

  if (productsResult.rows.length === 0) {
    return { products: [], total };
  }

  const productIds = productsResult.rows.map((p) => p.id);

  // Obtener tiers para todos los productos en una sola query
  const tiersResult = await query<{
    product_id: string;
    min_quantity: number;
    unit_price: number;
  }>(
    `SELECT
      ppt.product_id,
      ppt.min_quantity,
      ROUND(p.cost_price::numeric * (1 + pl.margin / 100))::integer AS unit_price
    FROM product_price_tiers ppt
    JOIN products p ON p.id = ppt.product_id
    JOIN price_lists pl ON pl.id = ppt.price_list_id
    WHERE ppt.product_id = ANY($1)
      AND ppt.is_active = true
      AND pl.is_active = true
      AND pl.deleted_at IS NULL
    ORDER BY ppt.product_id, ppt.min_quantity ASC`,
    [productIds]
  );

  // Agrupar tiers por product_id
  const tiersByProduct = new Map<string, PriceTier[]>();
  for (const row of tiersResult.rows) {
    if (!tiersByProduct.has(row.product_id)) {
      tiersByProduct.set(row.product_id, []);
    }
    tiersByProduct.get(row.product_id)!.push({
      min_quantity: row.min_quantity,
      unit_price: row.unit_price
    });
  }

  const products: PublicProduct[] = productsResult.rows.map((row) => ({
    id: row.id,
    sku: row.sku,
    name: row.name,
    slug: row.slug,
    base_price: row.base_price,
    available_stock: row.available_stock,
    category_id: row.category_id,
    brand_id: row.brand_id,
    category: row.category_name ? { id: row.category_id, name: row.category_name } : null,
    brand: row.brand_id && row.brand_name ? { id: row.brand_id, name: row.brand_name } : null,
    image_url: row.image_url,
    tiers: tiersByProduct.get(row.id) ?? []
  }));

  return { products, total };
}
```

**Step 2: Typecheck**

```bash
cd apps/api && bun run typecheck
```

Expected: sin errores.

**Step 3: Commit**

```bash
git add apps/api/src/modules/catalog/catalog.repository.ts
git commit -m "feat(catalog): add catalog repository with tier price calculation in DB"
```

---

### Task 3: Backend — `catalog.controller.ts` + `catalog.routes.ts`

**Files:**

- Create: `apps/api/src/modules/catalog/catalog.controller.ts`
- Create: `apps/api/src/modules/catalog/catalog.routes.ts`

**Step 1: Crear el controller**

```typescript
// apps/api/src/modules/catalog/catalog.controller.ts
import type { Request, Response, NextFunction } from 'express';
import * as catalogRepository from './catalog.repository.js';
import { ApiResponseBuilder as ApiResponse } from '../../shared/utils/api-response.js';

/**
 * GET /api/catalog/products
 * Lista pública de productos con tiers de precio. Sin autenticación requerida.
 */
export async function listProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const {
      search,
      category_id,
      brand_id,
      page = '1',
      limit = '20'
    } = req.query as Record<string, string>;

    const result = await catalogRepository.findPublicProducts({
      search,
      category_id,
      brand_id,
      page: Math.max(1, parseInt(page, 10)),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10)))
    });

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    return res.json(
      ApiResponse.paginated(result.products, {
        page: pageNum,
        limit: limitNum,
        total: result.total,
        totalPages: Math.ceil(result.total / limitNum),
        hasMore: pageNum * limitNum < result.total
      })
    );
  } catch (error) {
    next(error);
  }
}
```

**Step 2: Crear las rutas**

```typescript
// apps/api/src/modules/catalog/catalog.routes.ts
import { Router } from 'express';
import * as catalogController from './catalog.controller.js';

const router = Router();

/**
 * GET /api/catalog/products
 * Productos públicos con tiers de precio. Sin autenticación.
 */
router.get('/products', catalogController.listProducts);

export default router;
```

**Step 3: Typecheck**

```bash
cd apps/api && bun run typecheck
```

**Step 4: Commit**

```bash
git add apps/api/src/modules/catalog/catalog.controller.ts apps/api/src/modules/catalog/catalog.routes.ts
git commit -m "feat(catalog): add catalog controller and routes"
```

---

### Task 4: Backend — Registrar rutas en `server.ts`

**Files:**

- Modify: `apps/api/src/server.ts`

**Step 1: Agregar import y ruta**

Buscar la sección de imports de rutas en `apps/api/src/server.ts` (cerca de `import productRoutes`) y agregar:

```typescript
import catalogRoutes from './modules/catalog/catalog.routes.js';
```

Luego, en la sección donde se montan las rutas (cerca de `app.use('/api/products', productRoutes)`), agregar:

```typescript
app.use('/api/catalog', catalogRoutes);
```

**Step 2: Verificar con curl** (con el servidor corriendo)

```bash
# En otra terminal: bun dev:api
curl http://localhost:3001/api/catalog/products
```

Expected: `{"success":true,"data":[],"pagination":{...}}` (o con productos si hay datos)

**Step 3: Typecheck**

```bash
cd apps/api && bun run typecheck
```

**Step 4: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "feat(catalog): register catalog routes in server"
```

---

### Task 5: Frontend — Tipos `ProductPublic` + `catalog.service.ts`

**Files:**

- Modify: `apps/web/src/types/index.ts`
- Create: `apps/web/src/lib/services/catalog.service.ts`

**Step 1: Agregar tipos en `apps/web/src/types/index.ts`**

Agregar al final del archivo (antes del último `export`):

```typescript
// ============================================================================
// CATALOG — Public product types with price tiers
// ============================================================================

export interface PriceTier {
  min_quantity: number;
  unit_price: number; // en centavos
}

export interface ProductPublic {
  id: string;
  sku: string;
  name: string;
  slug: string;
  image_url: string | null;
  available_stock: number;
  base_price: number; // fallback si no hay tiers
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  tiers: PriceTier[]; // ordenados por min_quantity ASC
}

export interface CatalogFilters {
  search?: string;
  category_id?: string;
  brand_id?: string;
  page?: number;
  limit?: number;
}
```

**Step 2: Crear `apps/web/src/lib/services/catalog.service.ts`**

```typescript
import { get } from '../api';
import type { ApiResponse } from '../api';
import type { ProductPublic, CatalogFilters } from '@/types';

/**
 * Obtener productos públicos con tiers de precio
 */
export async function getCatalogProducts(
  filters?: CatalogFilters
): Promise<ApiResponse<ProductPublic[]>> {
  const params = new URLSearchParams();

  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    });
  }

  const queryString = params.toString();
  const endpoint = `/catalog/products${queryString ? `?${queryString}` : ''}`;

  return get<ProductPublic[]>(endpoint);
}
```

**Step 3: Exportar desde `apps/web/src/lib/services/index.ts`**

Verificar que existe el barrel de servicios y agregar la exportación. Buscar el archivo:

```bash
ls apps/web/src/lib/services/
```

Si existe `index.ts`, agregar al final:

```typescript
export * from './catalog.service';
```

Si no existe `index.ts`, no hacer nada (el import directo funciona).

**Step 4: Typecheck**

```bash
cd apps/web && bun run typecheck
```

**Step 5: Commit**

```bash
git add apps/web/src/types/index.ts apps/web/src/lib/services/catalog.service.ts
git commit -m "feat(catalog): add ProductPublic types and catalog service"
```

---

### Task 6: Frontend — `ProductCard` rediseñada con tiers

**Files:**

- Modify: `apps/web/src/components/product/product-card.tsx`

Esta es la tarea más importante del frontend. La card nueva tiene:

- Imagen del producto (link a detalle)
- Nombre, badge de stock, SKU
- Precio por bulto (tier más barato) y precio por unidad (tier 1)
- Selector de PRESENTACIÓN (botones por tier)
- Contador de cantidad + botón agregar al carrito

**Step 1: Reemplazar el contenido completo de `product-card.tsx`**

```typescript
'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Minus, Plus, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import type { ProductPublic } from '@/types';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StockBadge } from './stock-badge';
import { formatPrice } from '@/lib/formatters';
import { useCartStore } from '@/stores/cart-store';
import { cn } from '@/lib/utils';

interface ProductCardProps {
  product: ProductPublic;
  className?: string;
}

export function ProductCard({ product, className }: ProductCardProps) {
  const [selectedTierIndex, setSelectedTierIndex] = useState(0);
  const [counter, setCounter] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const addItem = useCartStore((state) => state.addItem);

  const isOutOfStock = product.available_stock === 0;
  const hasTiers = product.tiers.length > 0;
  const hasMultipleTiers = product.tiers.length > 1;

  // Tier seleccionado actualmente
  const selectedTier = hasTiers ? product.tiers[selectedTierIndex] : null;

  // Precio unitario (tier min_quantity=1 o el primero)
  const unitPrice = hasTiers ? product.tiers[0].unit_price : product.base_price;

  // Precio por bulto (tier más barato = el último, mayor cantidad)
  const bulkTier = hasMultipleTiers ? product.tiers[product.tiers.length - 1] : null;

  const handleTierSelect = (index: number) => {
    setSelectedTierIndex(index);
    setCounter(1);
  };

  const handleDecrement = () => setCounter((c) => Math.max(1, c - 1));
  const handleIncrement = () => setCounter((c) => c + 1);

  const handleAddToCart = async () => {
    if (!selectedTier && !hasTiers) return;

    const presentation = selectedTier?.min_quantity ?? 1;
    const totalQuantity = presentation * counter;

    setIsLoading(true);
    try {
      await addItem(product.id, totalQuantity);
      toast.success('Producto agregado', {
        description: `${product.name} (x${totalQuantity}) se agregó al carrito`
      });
    } catch (error) {
      toast.error('Error al agregar', {
        description: error instanceof Error ? error.message : 'Intenta nuevamente'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className={cn('flex flex-col overflow-hidden', className)}>
      {/* Imagen */}
      <Link href={`/productos/${product.slug}`} className="block">
        <div className="relative aspect-square overflow-hidden bg-muted">
          {product.image_url ? (
            <Image
              src={product.image_url}
              alt={product.name}
              fill
              className="object-cover transition-transform hover:scale-105"
              sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted">
              <svg
                className="h-16 w-16 text-muted-foreground/40"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
          )}
        </div>
      </Link>

      <CardContent className="flex flex-1 flex-col gap-2 p-3">
        {/* Nombre */}
        <Link href={`/productos/${product.slug}`}>
          <h3 className="line-clamp-2 text-sm font-semibold leading-tight hover:text-primary">
            {product.name}
          </h3>
        </Link>

        {/* Stock + SKU */}
        <div className="flex items-center gap-2">
          <StockBadge stock={product.available_stock} />
          <span className="text-xs text-muted-foreground">SKU {product.sku}</span>
        </div>

        {/* Precios */}
        <div className="space-y-0.5">
          {bulkTier && (
            <div>
              <p className="text-xs text-muted-foreground">Precio unitario por bulto cerrado:</p>
              <p className="text-base font-bold">{formatPrice(bulkTier.unit_price / 100)}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">Precio unitario:</p>
            <p className={cn('font-semibold', bulkTier ? 'text-sm' : 'text-base font-bold')}>
              {formatPrice(unitPrice / 100)}
            </p>
          </div>
        </div>

        {/* Selector de presentación */}
        {hasMultipleTiers && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Presentación
            </p>
            <div className="flex flex-wrap gap-1.5">
              {product.tiers.map((tier, index) => (
                <button
                  key={tier.min_quantity}
                  onClick={() => handleTierSelect(index)}
                  className={cn(
                    'min-w-[2.5rem] rounded border px-2 py-1 text-sm font-medium transition-colors',
                    selectedTierIndex === index
                      ? 'border-destructive bg-destructive/5 text-destructive'
                      : 'border-muted-foreground/30 hover:border-muted-foreground'
                  )}
                >
                  {tier.min_quantity}
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      {/* Footer: contador + carrito */}
      <CardFooter className="gap-2 p-3 pt-0">
        {/* Contador */}
        <div className="flex items-center gap-1 rounded border">
          <button
            onClick={handleDecrement}
            disabled={counter <= 1 || isOutOfStock}
            className="px-2 py-1 text-sm disabled:opacity-40"
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="min-w-[1.5rem] text-center text-sm">{counter}</span>
          <button
            onClick={handleIncrement}
            disabled={isOutOfStock}
            className="px-2 py-1 text-sm disabled:opacity-40"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>

        {/* Botón carrito */}
        <Button
          onClick={handleAddToCart}
          disabled={isOutOfStock || isLoading}
          size="sm"
          className="flex-1"
        >
          <ShoppingCart className="h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}
```

**Step 2: Typecheck**

```bash
cd apps/web && bun run typecheck
```

**Step 3: Commit**

```bash
git add apps/web/src/components/product/product-card.tsx
git commit -m "feat(catalog): redesign ProductCard with price tiers and presentation selector"
```

---

### Task 7: Frontend — `ProductGrid` + página `/productos`

**Files:**

- Modify: `apps/web/src/components/product/product-grid.tsx`
- Modify: `apps/web/src/app/(public)/productos/page.tsx`

**Step 1: Actualizar `ProductGrid` para usar `ProductPublic`**

En `apps/web/src/components/product/product-grid.tsx`, cambiar el import de tipo:

```typescript
// Cambiar:
import { Product } from '@/types';

// Por:
import { ProductPublic } from '@/types';

// Cambiar la interface:
interface ProductGridProps {
  products: ProductPublic[]; // era Product[]
  className?: string;
}
```

**Step 2: Actualizar `apps/web/src/app/(public)/productos/page.tsx`**

Cambios necesarios:

1. Reemplazar el import de `getProducts` por `getCatalogProducts`
2. Cambiar el tipo `Product[]` por `ProductPublic[]`
3. Eliminar el `sortedProducts` + `sortProducts` (el sort es server-side ahora, por nombre ASC)
4. Eliminar `minPrice`/`maxPrice` del fetch (el catálogo público no filtra por precio por ahora)

Reemplazar el archivo completo:

```typescript
'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { Loader2, SlidersHorizontal } from 'lucide-react';
import type { ProductPublic, CatalogFilters } from '@/types';
import { ProductGrid, ProductFilters } from '@/components/product';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from '@/components/ui/pagination';
import { useFilterStore } from '@/stores/filter-store';
import { getCatalogProducts } from '@/lib/services/catalog.service';
import { useSearchParams } from 'next/navigation';

const ITEMS_PER_PAGE = 20;

function ProductsContent() {
  const [products, setProducts] = useState<ProductPublic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const searchParams = useSearchParams();

  const search = useFilterStore((state) => state.search);
  const categoryId = useFilterStore((state) => state.category_id);
  const brandId = useFilterStore((state) => state.brand_id);
  const setCategoryId = useFilterStore((state) => state.setCategoryId);
  const setBrandId = useFilterStore((state) => state.setBrandId);

  useEffect(() => {
    const categoryParam = searchParams.get('category_id');
    const brandParam = searchParams.get('brand_id');
    if (categoryParam) setCategoryId(categoryParam);
    if (brandParam) setBrandId(brandParam);
  }, [searchParams, setCategoryId, setBrandId]);

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const filters: CatalogFilters = {
        search: search || undefined,
        category_id: categoryId || undefined,
        brand_id: brandId || undefined,
        page: currentPage,
        limit: ITEMS_PER_PAGE
      };

      const response = await getCatalogProducts(filters);

      if (response.success && response.data) {
        setProducts(response.data);
        setTotal(response.pagination?.total ?? 0);
        setTotalPages(response.pagination?.totalPages ?? 1);
      } else {
        setProducts([]);
        setTotal(0);
        setTotalPages(1);
      }
    } catch {
      setProducts([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setIsLoading(false);
    }
  }, [search, categoryId, brandId, currentPage]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, categoryId, brandId]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Productos</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isLoading ? 'Cargando...' : `${total} productos encontrados`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="lg:hidden">
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Filtros
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-full overflow-y-auto sm:max-w-md">
                <ProductFilters />
              </SheetContent>
            </Sheet>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-20 rounded-lg border bg-card p-6">
              <ProductFilters />
            </div>
          </aside>

          <div className="space-y-6">
            {isLoading ? (
              <div className="flex min-h-[400px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <ProductGrid products={products} />

                {totalPages > 1 && (
                  <div className="flex justify-center pt-6">
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            onClick={() => handlePageChange(currentPage - 1)}
                            className={
                              currentPage === 1
                                ? 'pointer-events-none opacity-50'
                                : 'cursor-pointer'
                            }
                          />
                        </PaginationItem>

                        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                          let pageNum: number;
                          if (totalPages <= 5) pageNum = i + 1;
                          else if (currentPage <= 3) pageNum = i + 1;
                          else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                          else pageNum = currentPage - 2 + i;

                          return (
                            <PaginationItem key={pageNum}>
                              <PaginationLink
                                onClick={() => handlePageChange(pageNum)}
                                isActive={currentPage === pageNum}
                                className="cursor-pointer"
                              >
                                {pageNum}
                              </PaginationLink>
                            </PaginationItem>
                          );
                        })}

                        <PaginationItem>
                          <PaginationNext
                            onClick={() => handlePageChange(currentPage + 1)}
                            className={
                              currentPage === totalPages
                                ? 'pointer-events-none opacity-50'
                                : 'cursor-pointer'
                            }
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-8">
          <div className="flex min-h-[400px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      }
    >
      <ProductsContent />
    </Suspense>
  );
}
```

**Step 3: Typecheck**

```bash
cd apps/web && bun run typecheck
```

Corregir cualquier error. Los más comunes: `ProductSort` ya no se usa → eliminar su import. `sortProducts` ya no se usa → eliminar su import.

**Step 4: Commit**

```bash
git add apps/web/src/components/product/product-grid.tsx
git add "apps/web/src/app/(public)/productos/page.tsx"
git commit -m "feat(catalog): reconnect catalog page to public endpoint with tier support"
```

---

## Verificación final

Con backend y frontend corriendo (`bun dev`):

1. `GET http://localhost:3001/api/catalog/products` → responde con `{ success: true, data: [...], pagination: {...} }`
2. Ir a `http://localhost:3000/productos` → muestra la grilla
3. Producto sin tiers → muestra solo "Precio unitario", sin sección PRESENTACIÓN
4. Producto con 2 tiers → muestra ambos precios y botones de presentación
5. Seleccionar presentación 12, contador 2 → agrega 24 unidades al carrito
6. Producto sin stock → botón carrito deshabilitado
