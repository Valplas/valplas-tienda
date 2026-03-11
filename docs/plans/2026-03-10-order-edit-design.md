# Order Edit Feature — Design

**Goal:** Allow admins to edit an existing order (items, quantities, delivery address) while it's in `processing` state, with correct stock management.

**Architecture:** New `PATCH /api/orders/admin/:id` endpoint + dedicated edit page `/admin/pedidos/[id]/editar` that reuses the product search / price list / address selection UX from the order creation page.

**Tech Stack:** Express + PostgreSQL triggers (session variable flag) + Next.js App Router

---

## Constraints

- Editing is only allowed while the order is in `processing` status.
- Admin orders are created directly at `processing` (skipping `pending_payment` and `payment_confirmed`).
- Stock for `processing` orders is fully deducted from `products.stock` (not `reserved_stock`).

---

## Backend

### Migration 020 — Fix stock trigger for `processing` + skip flag

Two changes to `handle_stock_on_item_insert()`:

1. Treat `processing` the same as `payment_confirmed` → deduct `stock` directly.
2. Check `current_setting('app.skip_stock_trigger', true)` → if `'true'`, return immediately (used during order edits to avoid double-deduction).

### Change default admin order status

`order.repository.ts` `createAdminOrder`: change hardcoded `'payment_confirmed'` → `'processing'`.

### New endpoint `PATCH /api/orders/admin/:id`

- **Auth:** `requireRole(['admin', 'owner'])`
- **Validation:** order must exist and be in `processing` state (409 otherwise)
- **Body:**
  ```json
  {
    "items": [{ "product_id": "uuid", "quantity": 3, "unit_price": 1500 }],
    "shipping_address_id": "uuid"
  }
  ```
- **Transaction logic:**
  1. `SET LOCAL app.skip_stock_trigger = 'true'`
  2. Load current order items
  3. Per product, calculate delta = `new_qty - old_qty`:
     - delta > 0 → check available stock, then `stock -= delta`
     - delta < 0 → `stock += abs(delta)`
     - product removed → `stock += old_qty`
     - product added → check available stock, then `stock -= new_qty`
  4. `DELETE FROM order_items WHERE order_id = $id`
  5. `INSERT` new items (trigger skipped)
  6. Recalculate `subtotal = sum(unit_price * quantity)`, `total = subtotal` (admin orders have no shipping cost)
  7. `UPDATE orders SET subtotal, total, shipping_street, ... WHERE id = $id`

---

## Frontend

### Detail page (`/admin/pedidos/[id]/page.tsx`)

- Add "Editar Pedido" button in the header.
- Only rendered when `order.status === 'processing'`.
- Links to `/admin/pedidos/[id]/editar`.

### Edit page (`/admin/pedidos/[id]/editar/page.tsx`)

- Loads order on mount via `getAdminOrderById(id)`.
- Pre-populates:
  - Items table with current order items (product_id, product_name, product_sku, quantity, unit_price, price_list)
  - Selected address from order's `shipping_*` fields (matched against user's addresses)
- UX reused from `nuevo/page.tsx`:
  - Product search (≥3 chars, debounce 400ms) → dropdown results
  - Click row → edit item inline
  - Price list selector per item
  - Quantity input
  - Add / Update item button
  - Delete item button per row
- Address: dropdown of user's addresses (user is fixed, cannot change)
- "Guardar cambios" → calls `adminUpdateOrder(id, { items, shipping_address_id })` → on success redirect to `/admin/pedidos/[id]`
- "Cancelar" → navigate back to `/admin/pedidos/[id]`

### Service (`orders.service.ts`)

```typescript
export async function adminUpdateOrder(
  id: string,
  data: { items: OrderItemInput[]; shipping_address_id: string }
): Promise<Order>;
```

Calls `PATCH /api/orders/admin/:id`.
