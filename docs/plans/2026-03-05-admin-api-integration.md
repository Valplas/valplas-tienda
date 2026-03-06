# Admin API Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all `fake_*` mock services in admin pages with real API calls, fixing type mismatches (camelCase↔snake_case) and ARS price conversion (centavos↔pesos).

**Architecture:** Extend existing `lib/services/` files with CRUD operations. Add `parsePriceInput()` to `lib/formatters.ts` and `normalizeProduct()` to `products.service.ts`. Each admin page is then updated to import from services instead of mocks — no new files, no new layers.

**Tech Stack:** Next.js App Router, `lib/api.ts` fetch client, TypeScript

---

## Context

- `apps/web/src/lib/api.ts` — HTTP client (handles Bearer token automatically)
- `apps/web/src/lib/formatters.ts` — formatting helpers (add `parsePriceInput` here)
- `apps/web/src/lib/services/` — service layer (extend existing files)
- Price-lists page is **already done** — skip it
- Products create/edit pages call real API but via raw `fetch()` — fix in Tasks 4 & 5
- All admin endpoints require `Authorization: Bearer <token>` — already handled by `lib/api.ts`
- API stores prices in centavos (integer). Frontend displays in pesos (string/number)
- API returns products with `categoryId`/`brandId`/`availableStock` (camelCase)
- Single product endpoints return `data: { product: {...} }` — must unwrap in service
- Order detail: real API has flat `shipping_street`, `shipping_city`, etc. (not nested object)
- Design doc: `docs/plans/2026-03-05-admin-api-integration-design.md`

---

## Task 1: Add `parsePriceInput` to `lib/formatters.ts`

**Files:**

- Modify: `apps/web/src/lib/formatters.ts`

**Step 1: Add `parsePriceInput` function**

Add at the end of `apps/web/src/lib/formatters.ts`:

```typescript
/**
 * Converts an Argentine price string typed by an admin user into centavos integer.
 * Rules:
 *   "100"      → 10000   (100 pesos = 10000 centavos)
 *   "12,50"    → 1250    (comma = decimal separator)
 *   "12.50"    → 1250    (dot NOT followed by exactly 3 digits = decimal)
 *   "10.000"   → 1000000 (dot followed by exactly 3 digits = thousands separator)
 *   "10000"    → 1000000 (plain integer = pesos)
 */
export function parsePriceInput(value: string): number {
  const str = value.trim().replace(/\s/g, '');
  if (!str) return 0;

  // Dot followed by exactly 3 digits = thousands separator → remove it
  // Otherwise dot = decimal separator → keep it
  const normalized = str
    .replace(/\.(\d{3})(?!\d)/g, '$1') // remove thousands dots
    .replace(',', '.'); // comma → decimal dot

  const pesos = parseFloat(normalized);
  if (isNaN(pesos)) return 0;
  return Math.round(pesos * 100);
}
```

**Step 2: Verify manually with a few cases**

The function should handle:

- `parsePriceInput("100")` → `10000`
- `parsePriceInput("12,50")` → `1250`
- `parsePriceInput("12.50")` → `1250`
- `parsePriceInput("10.000")` → `1000000`
- `parsePriceInput("10000")` → `1000000`

**Step 3: Commit**

```bash
git add apps/web/src/lib/formatters.ts
git commit -m "feat(web): add parsePriceInput helper for Argentine price conversion"
```

---

## Task 2: Extend `products.service.ts` with admin CRUD + `normalizeProduct`

**Files:**

- Modify: `apps/web/src/lib/services/products.service.ts`

**Step 1: Add `normalizeProduct` and admin functions**

Add at the end of `apps/web/src/lib/services/products.service.ts`:

```typescript
// ─── Admin helpers ────────────────────────────────────────────────────────────

// Raw shape returned by the API for a single product (camelCase mixed with snake_case)
interface RawProduct {
  id: string;
  name: string;
  slug: string;
  description?: string;
  base_price: number; // centavos
  is_active: boolean;
  categoryId?: string;
  brandId?: string;
  availableStock?: number;
  images?: Array<{ url: string; alt?: string }>;
  [key: string]: unknown;
}

/**
 * Maps API response fields to the frontend Product shape:
 * - camelCase → snake_case
 * - centavos → pesos
 * - images[0].url → image_url
 */
export function normalizeProduct(raw: RawProduct): Product {
  const basePricePesos = (raw.base_price ?? 0) / 100;
  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    description: raw.description ?? '',
    base_price: basePricePesos,
    final_price: basePricePesos,
    is_active: raw.is_active,
    category_id: raw.categoryId ?? '',
    brand_id: raw.brandId ?? '',
    available_stock: raw.availableStock ?? 0,
    image_url: raw.images?.[0]?.url ?? ''
  } as unknown as Product;
}

// ─── Admin CRUD ───────────────────────────────────────────────────────────────

export async function getAdminProducts(params?: {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  brandId?: string;
  isActive?: boolean;
}) {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.search) query.set('search', params.search);
  if (params?.categoryId) query.set('categoryId', params.categoryId);
  if (params?.brandId) query.set('brandId', params.brandId);
  if (params?.isActive !== undefined) query.set('isActive', String(params.isActive));

  const qs = query.toString();
  const res = await api.get<{ products: RawProduct[]; total: number; totalPages: number }>(
    `/products${qs ? `?${qs}` : ''}`
  );
  if (!res.success || !res.data) return { products: [], total: 0, totalPages: 0 };
  return {
    products: res.data.products.map(normalizeProduct),
    total: res.data.total,
    totalPages: res.data.totalPages
  };
}

export async function createProduct(data: {
  name: string;
  slug: string;
  description?: string;
  basePrice: number; // centavos
  categoryId: string;
  brandId: string;
  isActive?: boolean;
}) {
  const res = await api.post<{ product: RawProduct }>('/products', data);
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Error al crear producto');
  return normalizeProduct(res.data.product);
}

export async function updateProduct(
  id: string,
  data: Partial<{
    name: string;
    slug: string;
    description: string;
    basePrice: number; // centavos
    categoryId: string;
    brandId: string;
    isActive: boolean;
  }>
) {
  const res = await api.put<{ product: RawProduct }>(`/products/${id}`, data);
  if (!res.success || !res.data)
    throw new Error(res.error?.message ?? 'Error al actualizar producto');
  return normalizeProduct(res.data.product);
}

export async function deleteProduct(id: string) {
  const res = await api.del(`/products/${id}`);
  if (!res.success) throw new Error(res.error?.message ?? 'Error al eliminar producto');
}
```

Also add the import for `api` at the top of the file if not already present:

```typescript
import { api } from '@/lib/api';
```

**Step 2: Check existing imports in the file**

Read `apps/web/src/lib/services/products.service.ts` to check if `api` is already imported. If not, add the import. Also check what the `Product` type is — if the shape doesn't match, use `as unknown as Product` or adjust the return type annotation.

**Step 3: Commit**

```bash
git add apps/web/src/lib/services/products.service.ts
git commit -m "feat(web): add normalizeProduct and admin product CRUD to products service"
```

---

## Task 3: Connect products list page to real API

**Files:**

- Modify: `apps/web/src/app/admin/productos/page.tsx`

**Step 1: Replace fake imports**

Find and replace at the top of the file:

```typescript
// REMOVE lines like:
import { fake_getProducts, fake_deleteProduct, fake_deleteProducts } from '@/lib/mock/...';

// ADD:
import { getAdminProducts, deleteProduct } from '@/lib/services/products.service';
```

**Step 2: Replace fake function calls**

Search for `fake_getProducts(` and replace with `getAdminProducts(`.
Search for `fake_deleteProduct(` and replace with `deleteProduct(`.
Search for `fake_deleteProducts(` — replace with a loop calling `deleteProduct(id)` for each id:

```typescript
// Bulk delete
await Promise.all(selectedIds.map((id) => deleteProduct(id)));
```

**Step 3: Verify TypeScript compiles**

```bash
cd apps/web && bunx tsc --noEmit 2>&1 | head -50
```

Expected: no errors related to products page. Fix any type mismatches.

**Step 4: Commit**

```bash
git add apps/web/src/app/admin/productos/page.tsx
git commit -m "fix(web): connect productos admin page to real API"
```

---

## Task 4: Fix products create page (raw fetch → lib/api.ts + price conversion)

**Files:**

- Modify: `apps/web/src/app/admin/productos/nuevo/page.tsx`

**Step 1: Replace raw fetch with service call**

The current page does:

```typescript
// Current (raw fetch, no price conversion)
const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/products`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(mapToBackendFormat(formData))
});
```

Replace with:

```typescript
import { createProduct } from '@/lib/services/products.service';
import { parsePriceInput } from '@/lib/formatters';

// In the submit handler:
const centavos = parsePriceInput(String(formData.base_price));
await createProduct({
  name: formData.name,
  slug: formData.slug,
  description: formData.description,
  basePrice: centavos,
  categoryId: formData.category_id,
  brandId: formData.brand_id,
  isActive: formData.is_active
});
```

Remove: `mapToBackendFormat`, raw `fetch()` call, and manual token handling.

**Step 2: Verify TypeScript compiles**

```bash
cd apps/web && bunx tsc --noEmit 2>&1 | head -50
```

**Step 3: Commit**

```bash
git add apps/web/src/app/admin/productos/nuevo/page.tsx
git commit -m "fix(web): use service layer and price conversion in productos/nuevo"
```

---

## Task 5: Fix products edit page (raw fetch → lib/api.ts + price conversion)

**Files:**

- Modify: `apps/web/src/app/admin/productos/[id]/editar/page.tsx`

**Step 1: Replace raw fetch calls**

The current page does two raw fetch calls: one GET (load product) and one PUT (save).

Replace load:

```typescript
import { getProductById } from '@/lib/services/products.service';
import { normalizeProduct } from '@/lib/services/products.service';

// Load product
const res = await api.get<{ product: RawProduct }>(`/products/${id}`);
const product = normalizeProduct(res.data.product);
```

Replace save:

```typescript
import { updateProduct } from '@/lib/services/products.service';
import { parsePriceInput } from '@/lib/formatters';

// In the submit handler:
const centavos = parsePriceInput(String(formData.base_price));
await updateProduct(id, {
  name: formData.name,
  slug: formData.slug,
  description: formData.description,
  basePrice: centavos,
  categoryId: formData.category_id,
  brandId: formData.brand_id,
  isActive: formData.is_active
});
```

Remove: `mapToBackendFormat`, raw `fetch()` calls, manual token handling.

**Step 2: Verify TypeScript compiles**

```bash
cd apps/web && bunx tsc --noEmit 2>&1 | head -50
```

**Step 3: Commit**

```bash
git add apps/web/src/app/admin/productos/[id]/editar/page.tsx
git commit -m "fix(web): use service layer and price conversion in productos/editar"
```

---

## Task 6: Add brand CRUD to service + connect marcas page

**Files:**

- Modify: `apps/web/src/lib/services/brands.service.ts`
- Modify: `apps/web/src/app/admin/marcas/page.tsx`

**Step 1: Add admin functions to `brands.service.ts`**

Add at the end of the file:

```typescript
// ─── Admin CRUD ───────────────────────────────────────────────────────────────

export async function getAdminBrands(params?: { page?: number; limit?: number; search?: string }) {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.search) query.set('search', params.search);

  const qs = query.toString();
  const res = await api.get<{ brands: Brand[]; total: number; totalPages: number }>(
    `/brands${qs ? `?${qs}` : ''}`
  );
  if (!res.success || !res.data) return { brands: [], total: 0, totalPages: 0 };
  return res.data;
}

export async function createBrand(data: { name: string; slug: string; isActive?: boolean }) {
  const res = await api.post<{ brand: Brand }>('/brands', data);
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Error al crear marca');
  return res.data.brand;
}

export async function updateBrand(
  id: string,
  data: Partial<{ name: string; slug: string; isActive: boolean }>
) {
  const res = await api.put<{ brand: Brand }>(`/brands/${id}`, data);
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Error al actualizar marca');
  return res.data.brand;
}

export async function deleteBrand(id: string) {
  const res = await api.del(`/brands/${id}`);
  if (!res.success) throw new Error(res.error?.message ?? 'Error al eliminar marca');
}

export async function deleteBrands(ids: string[]) {
  await Promise.all(ids.map((id) => deleteBrand(id)));
}
```

Ensure `api` is imported:

```typescript
import { api } from '@/lib/api';
```

**Step 2: Connect `marcas/page.tsx`**

Replace fake imports:

```typescript
// REMOVE:
import {
  fake_getBrands,
  fake_createBrand,
  fake_updateBrand,
  fake_deleteBrands,
  fake_getBrandProductCount
} from '@/lib/mock/...';

// ADD:
import {
  getAdminBrands,
  createBrand,
  updateBrand,
  deleteBrands
} from '@/lib/services/brands.service';
```

Replace calls:

- `fake_getBrands(...)` → `getAdminBrands(...)`
- `fake_createBrand(...)` → `createBrand(...)`
- `fake_updateBrand(...)` → `updateBrand(...)`
- `fake_deleteBrands(...)` → `deleteBrands(...)`
- `fake_getBrandProductCount(...)` → remove entirely (drop the product count column from the table if shown)

**Step 3: Verify TypeScript compiles**

```bash
cd apps/web && bunx tsc --noEmit 2>&1 | head -50
```

**Step 4: Commit**

```bash
git add apps/web/src/lib/services/brands.service.ts apps/web/src/app/admin/marcas/page.tsx
git commit -m "feat(web): add brand admin CRUD and connect marcas page to real API"
```

---

## Task 7: Add category CRUD to service + connect categorias page

**Files:**

- Modify: `apps/web/src/lib/services/categories.service.ts`
- Modify: `apps/web/src/app/admin/categorias/page.tsx`

**Step 1: Add admin functions to `categories.service.ts`**

Add at the end of the file:

```typescript
// ─── Admin CRUD ───────────────────────────────────────────────────────────────

export async function createCategory(data: {
  name: string;
  slug: string;
  parentId?: string;
  isActive?: boolean;
}) {
  const res = await api.post<{ category: Category }>('/categories', data);
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Error al crear categoría');
  return res.data.category;
}

export async function updateCategory(
  id: string,
  data: Partial<{ name: string; slug: string; parentId: string; isActive: boolean }>
) {
  const res = await api.put<{ category: Category }>(`/categories/${id}`, data);
  if (!res.success || !res.data)
    throw new Error(res.error?.message ?? 'Error al actualizar categoría');
  return res.data.category;
}

export async function deleteCategory(id: string) {
  const res = await api.del(`/categories/${id}`);
  if (!res.success) throw new Error(res.error?.message ?? 'Error al eliminar categoría');
}
```

Ensure `api` is imported:

```typescript
import { api } from '@/lib/api';
```

**Step 2: Connect `categorias/page.tsx`**

Replace fake imports:

```typescript
// REMOVE:
import {
  fake_getCategories,
  fake_createCategory,
  fake_updateCategory,
  fake_deleteCategory,
  fake_getCategoryProductCount
} from '@/lib/mock/...';

// ADD:
import { getCategories } from '@/lib/services/categories.service';
import { createCategory, updateCategory, deleteCategory } from '@/lib/services/categories.service';
```

Replace calls:

- `fake_getCategories(...)` → `getCategories(...)` (already exists in the service)
- `fake_createCategory(...)` → `createCategory(...)`
- `fake_updateCategory(...)` → `updateCategory(...)`
- `fake_deleteCategory(...)` → `deleteCategory(...)`
- `fake_getCategoryProductCount(...)` → remove (drop column from table)

**Step 3: Verify TypeScript compiles**

```bash
cd apps/web && bunx tsc --noEmit 2>&1 | head -50
```

**Step 4: Commit**

```bash
git add apps/web/src/lib/services/categories.service.ts apps/web/src/app/admin/categorias/page.tsx
git commit -m "feat(web): add category admin CRUD and connect categorias page to real API"
```

---

## Task 8: Add order admin functions to service + connect pedidos pages

**Files:**

- Modify: `apps/web/src/lib/services/orders.service.ts`
- Modify: `apps/web/src/app/admin/pedidos/page.tsx`
- Modify: `apps/web/src/app/admin/pedidos/[id]/page.tsx`

**Step 1: Add admin functions to `orders.service.ts`**

Add at the end of the file:

```typescript
// ─── Admin ────────────────────────────────────────────────────────────────────

// Valid status transitions (replicates fake_getValidNextStatuses logic)
const ORDER_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: []
};

export function getValidNextStatuses(currentStatus: string): string[] {
  return ORDER_STATUS_TRANSITIONS[currentStatus] ?? [];
}

export async function getAdminOrders(params?: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}) {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.status) query.set('status', params.status);
  if (params?.search) query.set('search', params.search);

  const qs = query.toString();
  const res = await api.get<{ orders: Order[]; total: number; totalPages: number }>(
    `/orders/admin/all${qs ? `?${qs}` : ''}`
  );
  if (!res.success || !res.data) return { orders: [], total: 0, totalPages: 0 };
  return res.data;
}

export async function getAdminOrderById(id: string) {
  const res = await api.get<{ order: Order }>(`/orders/${id}`);
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Pedido no encontrado');
  return res.data.order;
}

export async function updateOrderStatus(id: string, status: string) {
  const res = await api.patch<{ order: Order }>(`/orders/${id}/status`, { status });
  if (!res.success || !res.data)
    throw new Error(res.error?.message ?? 'Error al actualizar estado');
  return res.data.order;
}
```

Ensure `api` is imported.

**Step 2: Connect `pedidos/page.tsx`**

Replace:

```typescript
// REMOVE:
import { fake_getOrders } from '@/lib/mock/...';

// ADD:
import { getAdminOrders } from '@/lib/services/orders.service';
```

Replace `fake_getOrders(...)` → `getAdminOrders(...)`.

The page shows `order.user.first_name`, `order.user.last_name`, `order.user.email`. The real API might embed user data differently — check the API response shape. If the user is not embedded, display the `user_id` or adjust the query. Look at what `GET /orders/admin/all` returns and adapt the table columns accordingly.

**Step 3: Connect `pedidos/[id]/page.tsx`**

Replace imports:

```typescript
// REMOVE:
import {
  fake_getOrderById,
  fake_updateOrderStatus,
  fake_getValidNextStatuses
} from '@/lib/mock/...';

// ADD:
import {
  getAdminOrderById,
  updateOrderStatus,
  getValidNextStatuses
} from '@/lib/services/orders.service';
```

Replace calls:

- `fake_getOrderById(id)` → `getAdminOrderById(id)`
- `fake_updateOrderStatus(id, status)` → `updateOrderStatus(id, status)`
- `fake_getValidNextStatuses(status)` → `getValidNextStatuses(status)`

**Fix shipping address shape:**

The page accesses `order.shipping_address.label`, `order.shipping_address.street`, etc. (nested object).
The real API has flat fields: `shipping_street`, `shipping_city`, `shipping_province`, `shipping_postcode`.

After fetching the order, adapt the display code:

```typescript
// Replace references like:
order.shipping_address.label
// With:
`${order.shipping_street} ${order.shipping_street_number}, ${order.shipping_city}, ${order.shipping_province} (${order.shipping_postcode})`;

// Replace:
order.shipping_address.street;
// With:
order.shipping_street;
```

Also check for `order.shipping_carrier`, `order.tracking_number`, `order.payment_status` — if these don't exist in the API, remove those display fields or show "-".

**Step 4: Verify TypeScript compiles**

```bash
cd apps/web && bunx tsc --noEmit 2>&1 | head -50
```

Fix any type errors. The `Order` type in the service may need to be extended with the flat shipping fields.

**Step 5: Commit**

```bash
git add apps/web/src/lib/services/orders.service.ts apps/web/src/app/admin/pedidos/page.tsx apps/web/src/app/admin/pedidos/[id]/page.tsx
git commit -m "feat(web): add order admin CRUD and connect pedidos pages to real API"
```

---

## Task 9: Create users service + connect usuarios page

**Files:**

- Create: `apps/web/src/lib/services/users.service.ts`
- Modify: `apps/web/src/app/admin/usuarios/page.tsx`

**Step 1: Create `apps/web/src/lib/services/users.service.ts`**

```typescript
import { api } from '@/lib/api';

export interface User {
  id: string;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  role: 'owner' | 'admin' | 'driver' | 'customer';
  is_active: boolean;
  created_at: string;
  deleted_at: string | null;
}

export async function getAdminUsers(params?: {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
}) {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.search) query.set('search', params.search);
  if (params?.role) query.set('role', params.role);

  const qs = query.toString();
  const res = await api.get<{ users: User[]; total: number; totalPages: number }>(
    `/users${qs ? `?${qs}` : ''}`
  );
  if (!res.success || !res.data) return { users: [], total: 0, totalPages: 0 };
  return res.data;
}

export async function createUser(data: {
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  password: string;
  role?: string;
  phone?: string;
}) {
  const res = await api.post<{ user: User }>('/users', data);
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Error al crear usuario');
  return res.data.user;
}

export async function updateUser(
  id: string,
  data: Partial<{
    email: string;
    username: string;
    firstName: string;
    lastName: string;
    role: string;
    phone: string;
    isActive: boolean;
  }>
) {
  const res = await api.patch<{ user: User }>(`/users/${id}`, data);
  if (!res.success || !res.data)
    throw new Error(res.error?.message ?? 'Error al actualizar usuario');
  return res.data.user;
}

export async function deleteUser(id: string) {
  const res = await api.del(`/users/${id}`);
  if (!res.success) throw new Error(res.error?.message ?? 'Error al eliminar usuario');
}
```

**Step 2: Connect `usuarios/page.tsx`**

Replace fake imports:

```typescript
// REMOVE:
import { fake_getUsers, fake_createUser, fake_updateUser, fake_deleteUser } from '@/lib/mock/...';

// ADD:
import { getAdminUsers, createUser, updateUser, deleteUser } from '@/lib/services/users.service';
```

Replace calls:

- `fake_getUsers(...)` → `getAdminUsers(...)`
- `fake_createUser(...)` → `createUser(...)`
- `fake_updateUser(...)` → `updateUser(...)`
- `fake_deleteUser(...)` → `deleteUser(...)`

**Step 3: Verify TypeScript compiles**

```bash
cd apps/web && bunx tsc --noEmit 2>&1 | head -50
```

Fix type mismatches between the fake User type and the real one.

**Step 4: Commit**

```bash
git add apps/web/src/lib/services/users.service.ts apps/web/src/app/admin/usuarios/page.tsx
git commit -m "feat(web): create users service and connect usuarios page to real API"
```

---

## Task 10: Final verification

**Step 1: Full TypeScript check**

```bash
cd apps/web && bunx tsc --noEmit 2>&1
```

Expected: 0 errors. Fix any remaining errors.

**Step 2: Dev server smoke test**

```bash
bun dev:web
```

Manually visit each admin page and verify:

- `/admin/productos` — loads product list from real API
- `/admin/productos/nuevo` — create form submits and redirects
- `/admin/productos/[id]/editar` — loads product, saves changes
- `/admin/marcas` — loads brands, CRUD works
- `/admin/categorias` — loads categories, CRUD works
- `/admin/pedidos` — loads order list from real API
- `/admin/pedidos/[id]` — loads order detail, status change works
- `/admin/usuarios` — loads users, CRUD works

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix(web): final fixes from smoke testing admin pages"
```
