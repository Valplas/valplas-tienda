# Columna Dirección en /admin/usuarios y /admin/pedidos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar dirección de envío en la tabla `/admin/pedidos` (dirección del pedido) y dirección default en la tabla `/admin/usuarios` (dirección del usuario), sin queries N+1.

**Architecture:** `orders` ya guarda un snapshot desnormalizado de la dirección de envío en columnas propias (`shipping_street`, etc.) — solo falta exponerlas también en el listado sin `includeItems`. `findUsers` con `includeAddresses=true` ya devuelve `addresses[]` ordenado con la default primero — el frontend solo toma `addresses[0]`. Ningún cambio requiere JOINs nuevos ni queries adicionales por fila.

**Tech Stack:** Express + pg (`apps/api`), Next.js App Router + TanStack Table (`apps/web`).

## Global Constraints

- Proyecto **no tiene test suite configurada** (`test` script es placeholder en `apps/api` y `apps/web`). Verificación de cada task es: `bun run typecheck` en el workspace tocado + chequeo funcional (SQL directo vía MCP para backend, dev server para frontend).
- Respuestas JSON de la API son camelCase automático (middleware) — el frontend consume `shippingAddress`, `streetNumber`, etc.
- No usar `Promise.all(items.map(...))` para cargar datos relacionados (regla del proyecto) — este plan no lo necesita, todo es una sola query por listado.
- Rama de trabajo: `feat/admin-address-columns` (ya creada, spec ya commiteado en `aa14cd5`).

---

### Task 1: Backend — incluir `shipping_address` en el listado de `/admin/pedidos` sin `includeItems`

**Files:**

- Modify: `apps/api/src/modules/orders/order.repository.ts:169-183` (rama `else` de `findOrders`)

**Interfaces:**

- Consumes: nada nuevo — usa columnas ya presentes en `orders` (`shipping_street`, `shipping_street_number`, `shipping_floor`, `shipping_apartment`, `shipping_city`, `shipping_province`, `shipping_postcode`, `shipping_address_id`).
- Produces: cada fila de `GET /orders` (sin `include_items=true`) ahora incluye `shipping_address: { id, alias, street, street_number, floor, apartment, city, province, postcode } | null` — mismo shape que ya produce la rama `includeItems` (línea 131-143) y que ya está tipado en `Order['shipping_address']`... revisar: el tipo `Order` en `apps/api/src/modules/orders/order.types.ts` no declara `shipping_address` (solo `OrderWithDetails` lo declara). No hace falta tocar el tipo — el repo ya castea con `query<Order>` de forma laxa y el `Order` de `apps/web` (`OrderShippingAddress`) es el que importa para consumo.

- [ ] **Step 1: Editar la rama `else` de `findOrders`**

Reemplazar el bloque completo (líneas 169-183):

```typescript
  } else {
    const result = await query<Order>(
      `SELECT o.*,
              CASE WHEN u.id IS NOT NULL THEN
                json_build_object('id', u.id, 'first_name', u.first_name, 'last_name', u.last_name, 'email', u.email, 'phone', u.phone)
              END as user
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       WHERE ${whereClause}
       ORDER BY o.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );
    ordersRows = result.rows;
  }
```

por:

```typescript
  } else {
    const result = await query<Order>(
      `SELECT o.*,
              CASE WHEN u.id IS NOT NULL THEN
                json_build_object('id', u.id, 'first_name', u.first_name, 'last_name', u.last_name, 'email', u.email, 'phone', u.phone)
              END as user,
              CASE WHEN o.shipping_street IS NOT NULL THEN
                json_build_object(
                  'id', COALESCE(o.shipping_address_id, o.id),
                  'alias', 'Dirección de entrega',
                  'street', o.shipping_street,
                  'street_number', o.shipping_street_number,
                  'floor', o.shipping_floor,
                  'apartment', o.shipping_apartment,
                  'city', o.shipping_city,
                  'province', o.shipping_province,
                  'postcode', o.shipping_postcode
                )
              END as shipping_address
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       WHERE ${whereClause}
       ORDER BY o.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );
    ordersRows = result.rows;
  }
```

(Es el mismo `CASE WHEN o.shipping_street...` que ya existe en la rama `includeItems`, líneas 131-143 — copiado literal.)

- [ ] **Step 2: Typecheck**

Run: `cd apps/api && bun run typecheck`
Expected: exit 0, sin errores nuevos.

- [ ] **Step 3: Verificar el shape del JSON contra la DB real**

Usar `mcp__supabase-db__execute_sql` (read-only) con una versión mínima de la query para confirmar que `shipping_address` sale con las keys esperadas en al menos un pedido real:

```sql
SELECT o.order_number,
       CASE WHEN o.shipping_street IS NOT NULL THEN
         json_build_object(
           'id', COALESCE(o.shipping_address_id, o.id),
           'alias', 'Dirección de entrega',
           'street', o.shipping_street,
           'street_number', o.shipping_street_number,
           'floor', o.shipping_floor,
           'apartment', o.shipping_apartment,
           'city', o.shipping_city,
           'province', o.shipping_province,
           'postcode', o.shipping_postcode
         )
       END as shipping_address
FROM orders o
ORDER BY o.created_at DESC
LIMIT 3;
```

Expected: 3 filas, cada una con `shipping_address` no nulo y las 8 keys esperadas.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/orders/order.repository.ts
git commit -m "feat(api): incluir shipping_address en listado de pedidos sin includeItems"
```

---

### Task 2: Frontend — columna "Dirección" en `/admin/pedidos`

**Files:**

- Modify: `apps/web/src/app/admin/pedidos/page.tsx:197-289` (array `columns`)

**Interfaces:**

- Consumes: `Order.shippingAddress?: OrderShippingAddress` (ya tipado en `apps/web/src/lib/services/orders.service.ts:19-29,50`; ahora poblado también en el listado gracias a Task 1).
- Produces: nada consumido por otra task.

- [ ] **Step 1: Agregar columna después de `status` y antes de `actions`**

En el array `columns` (dentro de `useMemo`), insertar entre la columna `status` (línea 240-244) y la columna `actions` (línea 245):

```typescript
      {
        id: 'shippingAddress',
        header: 'Dirección',
        cell: ({ row }) => {
          const addr = row.original.shippingAddress;
          if (!addr) return <span className="text-muted-foreground">—</span>;
          return (
            <span className="text-sm">
              {addr.street} {addr.streetNumber}, {addr.city}
            </span>
          );
        },
        enableSorting: false
      },
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && bun run typecheck`
Expected: exit 0.

- [ ] **Step 3: Verificación manual en dev server**

Run: `bun dev` (root) o `cd apps/web && bun dev`. Abrir `/admin/pedidos` logueado como owner/admin. Confirmar:

- Columna "Dirección" visible con `calle numero, ciudad` para pedidos existentes.
- Pedidos sin dirección (no debería haber, pero por robustez) muestran `—`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/pedidos/page.tsx
git commit -m "feat(web): columna Direccion en tabla de /admin/pedidos"
```

---

### Task 3: Frontend — columna "Dirección" en `/admin/usuarios`

**Files:**

- Modify: `apps/web/src/app/admin/usuarios/page.tsx`

**Interfaces:**

- Consumes: `AdminUserWithAddresses` (ya definido en `apps/web/src/lib/services/users.service.ts:22-36`, con `addresses: { street, streetNumber, floor, apartment, city, province, postcode, isDefault, isActive, ... }[]`, ordenado default-primero por el backend). `getAdminUsers` acepta `includeAddresses?: boolean` (ya soportado, `users.service.ts:45,58`).
- Produces: nada consumido por otra task.

- [ ] **Step 1: Importar `AdminUserWithAddresses` y tipar el state**

En `apps/web/src/app/admin/usuarios/page.tsx`, línea 27-33, cambiar el import:

```typescript
import {
  AdminUser,
  AdminUserWithAddresses,
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser
} from '@/lib/services/users.service';
```

Línea 58, cambiar el tipo del state:

```typescript
const [users, setUsers] = useState<AdminUserWithAddresses[]>([]);
```

- [ ] **Step 2: Pedir `includeAddresses: true` y castear el resultado en `loadUsers`**

En `loadUsers` (línea 82-108), en la llamada a `getAdminUsers` (línea 88-94) agregar `includeAddresses: true`:

```typescript
const result = await getAdminUsers({
  page: 1,
  limit: PAGE_SIZE,
  role: roleFilter === 'all' ? undefined : roleFilter,
  search: searchTerm || undefined,
  sort: sortBy,
  includeAddresses: true
});
```

Y en la línea 96, castear (la API union-types por `includeAddresses`, pero acá siempre pedimos `true`):

```typescript
setUsers(result.users as AdminUserWithAddresses[]);
```

- [ ] **Step 3: Mismo cambio en `loadMore`**

En `loadMore` (línea 110-136), en la llamada a `getAdminUsers` (línea 114-120) agregar `includeAddresses: true`:

```typescript
const result = await getAdminUsers({
  page: nextPage,
  limit: PAGE_SIZE,
  role: roleFilter === 'all' ? undefined : roleFilter,
  search: search || undefined,
  sort: sortBy,
  includeAddresses: true
});
```

Y en la línea 122, castear:

```typescript
setUsers((prev) => [...prev, ...(result.users as AdminUserWithAddresses[])]);
```

- [ ] **Step 4: Tipar `columns` con `AdminUserWithAddresses` y agregar la columna**

Línea 249, cambiar:

```typescript
  const columns = useMemo<ColumnDef<AdminUserWithAddresses>[]>(
```

Insertar nueva columna después de la columna `phone` (línea 277-281) y antes de `role` (línea 282-286):

```typescript
      {
        id: 'address',
        header: 'Dirección',
        cell: ({ row }) => {
          const addr = row.original.addresses?.[0];
          if (!addr) return <span className="text-muted-foreground">—</span>;
          return (
            <span className="text-sm">
              {addr.street} {addr.streetNumber}, {addr.city}
            </span>
          );
        },
        enableSorting: false
      },
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && bun run typecheck`
Expected: exit 0. Si `DataTable` o algún otro consumidor de `users` infiere el tipo estrictamente desde `AdminUser`, ajustar ahí también (revisar error de typecheck si aparece).

- [ ] **Step 6: Verificación manual en dev server**

Abrir `/admin/usuarios` logueado como owner. Confirmar:

- Columna "Dirección" visible.
- Usuario con 1 dirección: la muestra.
- Usuario con 2+ direcciones: muestra la marcada default (o la más vieja si ninguna es default).
- Usuario sin direcciones: muestra `—`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/admin/usuarios/page.tsx
git commit -m "feat(web): columna Direccion (default) en tabla de /admin/usuarios"
```

---

## Post-plan check

- [ ] `bun run typecheck` en la raíz (todos los workspaces) pasa limpio.
- [ ] Ambas tablas admin muestran la columna en dev server.
- [ ] Spec (`docs/superpowers/specs/2026-07-28-admin-address-columns-design.md`) y este plan quedan commiteados en `feat/admin-address-columns`.
