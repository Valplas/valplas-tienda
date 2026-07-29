# Direcciones en /admin/usuarios y /admin/pedidos

## Objetivo

Mostrar la dirección relevante en ambos listados del admin, sin queries N+1.

## /admin/pedidos

`orders` ya tiene el snapshot de envío desnormalizado (`shipping_street`,
`shipping_street_number`, `shipping_floor`, `shipping_apartment`,
`shipping_city`, `shipping_province`, `shipping_postcode`) en cada fila —
`findOrders` ya lo trae vía `SELECT o.*`, pero el `shipping_address` JSON
anidado solo se arma en la rama `includeItems`.

**Cambio backend** (`apps/api/src/modules/orders/order.repository.ts`):
mover el `CASE WHEN o.shipping_street IS NOT NULL THEN json_build_object(...)`
que ya existe en la rama `includeItems` también a la rama sin items, para
que el listado (`GET /orders` sin `include_items`) devuelva `shipping_address`
siempre.

**Cambio frontend** (`apps/web/src/app/admin/pedidos/page.tsx`): agregar
columna "Dirección" a la `DataTable`, usando `row.original.shippingAddress`
(ya tipado en `Order`). Formato: `"{street} {streetNumber}, {city}"`, o `—`
si no hay `shippingAddress`.

## /admin/usuarios

`findUsers` con `includeAddresses=true` ya devuelve `addresses[]` por
usuario, ordenado `is_default DESC, created_at ASC` (primera = default,
o la más vieja si no hay default). No requiere cambios de backend.

**Cambio frontend**:

- `apps/web/src/app/admin/usuarios/page.tsx`: pasar `includeAddresses: true`
  en la llamada a `getAdminUsers` (tanto en `loadUsers` como en `loadMore`).
- Agregar columna "Dirección" a la tabla usando `addresses[0]` (si existe),
  formato `"{street} {streetNumber}, {city}"`, o `—` si el usuario no tiene
  direcciones.
- El tipo de fila pasa a `AdminUserWithAddresses` (ya existe en
  `users.service.ts`).

Se descartó la variante "dirección del último pedido cuando hay 2+
direcciones" por simplicidad — decisión explícita del usuario.

## Fuera de alcance

- No se toca `UserAddressesSection` (panel de edición de direcciones).
- No se toca la lógica de selección de dirección en checkout.
