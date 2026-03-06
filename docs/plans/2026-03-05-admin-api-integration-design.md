# Admin API Integration Design

**Goal:** Replace all `fake_*` mock services in admin pages with real API calls, fix type mismatches, and handle ARS price conversion.

**Architecture:** Extend existing `lib/services/` files with CRUD operations, add price normalization helpers, then update each admin page to use real services. No new service layers — everything stays in the existing service files.

**Tech Stack:** Next.js App Router, `lib/api.ts` fetch client, TypeScript

---

## Scope

### In scope

- `/admin/productos` — list, delete (single + bulk)
- `/admin/productos/nuevo` — create
- `/admin/productos/[id]/editar` — edit
- `/admin/marcas` — list, create, edit, delete
- `/admin/categorias` — list, create, edit, delete
- `/admin/pedidos` — list, view detail, change status
- `/admin/pedidos/[id]` — order detail with items
- `/admin/usuarios` — list, create, edit, delete
- `/admin/listas-de-precio` — list, create, edit, delete

### Out of scope

- `/admin/envios` — no migrated data, deferred
- Public catalog fixes — separate task

---

## Data Normalization

### Price conversion

- **API → display:** `centavos / 100` — use existing `formatCurrency()`
- **Form input → API:** `parsePriceInput(str)` — new helper in `lib/formatters.ts`
  - `"100"` → `10000`
  - `"12,50"` or `"12.50"` → `1250`
  - `"10.000"` or `"10000"` (ten thousand) → `1000000`
  - Rule: if dot is followed by exactly 3 digits, it's a thousands separator; otherwise decimal

### Product field mapping (API → frontend)

| API field               | Frontend field                                          |
| ----------------------- | ------------------------------------------------------- |
| `categoryId`            | `category_id`                                           |
| `brandId`               | `brand_id`                                              |
| `availableStock`        | `available_stock`                                       |
| `base_price` (centavos) | `base_price` (pesos)                                    |
| `base_price` (centavos) | `final_price` (pesos, same value until discounts exist) |
| `images[0].url`         | `image_url`                                             |

Single product endpoints return `data: { product: {...} }` — unwrap in service.

### `normalizeProduct(raw)` helper

Lives in `products.service.ts`. Called after every API response before returning to components.

---

## Services to extend

### `lib/services/products.service.ts`

Add:

- `normalizeProduct(raw)` — field mapping + centavos conversion
- `getAdminProducts(filters)` — includes inactive/deleted products
- `createProduct(data)` — sends basePrice as centavos
- `updateProduct(id, data)` — partial update
- `deleteProduct(id)` — soft delete

### `lib/services/brands.service.ts`

Add:

- `getAdminBrands()` — all brands including inactive
- `createBrand(data)`
- `updateBrand(id, data)`
- `deleteBrand(id)`
- `deleteBrands(ids)` — bulk delete (sequential API calls)

### `lib/services/categories.service.ts`

Add:

- `createCategory(data)`
- `updateCategory(id, data)`
- `deleteCategory(id)`

### `lib/services/orders.service.ts`

Add:

- `getAdminOrders(filters)` — all orders, paginated
- `getAdminOrderById(id)` — order with items
- `updateOrderStatus(id, status)`

### `lib/services/users.service.ts` (new file)

- `getAdminUsers(filters)`
- `createUser(data)`
- `updateUser(id, data)`
- `deleteUser(id)`

### `lib/services/price-lists.service.ts` (already exists, add)

- `createPriceList(data)`
- `updatePriceList(id, data)`
- `deletePriceList(id)`

---

## Admin pages update pattern

Each page follows this exact pattern:

```typescript
// BEFORE
import { fake_getProducts } from '@/lib/mock/services/fake-product-admin.service';
const response = await fake_getProducts({});

// AFTER
import { getAdminProducts } from '@/services';
const response = await getAdminProducts({});
```

Components keep the same props/interface — only the data source changes.

---

## Key constraints

- **Auth:** Admin endpoints require `Authorization: Bearer <token>` — already handled by `lib/api.ts`
- **Roles:** API enforces `admin` or `owner` role — frontend should redirect if 403
- **Pagination:** Admin lists use page-based pagination (`page`, `limit`) same as today
- **Error handling:** Keep existing toast patterns (`toast.error(...)`)
- **Mock files:** Leave `lib/mock/` untouched — don't delete them yet
