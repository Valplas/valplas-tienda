# Price Lists Feature — Design Doc

**Date:** 2026-03-04
**Status:** Approved

## Context

The existing CRM (PlastipremApi/.NET) has a `ListPrices` entity used when creating manual orders. Each order item references a price list, and the unit price is calculated as:

```
unit_price = CostPrice × (1 + Margin / 100)
revenue    = (unit_price - CostPrice) × quantity
```

The `Discount` field exists in the CRM model but is **not used in the formula** — it's stored for future use.

Since manual order entry is required in the new system, this feature must be implemented before data migration.

## Database Model

### Migration 015 — `price_lists` table

```sql
CREATE TABLE price_lists (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name      TEXT NOT NULL,
  margin    NUMERIC(10,4) NOT NULL DEFAULT 0,   -- e.g. 50.0000 = 50%
  discount  NUMERIC(10,4) NOT NULL DEFAULT 0,   -- stored, not used in formula yet
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);
```

### Migration 016 — `cost_price` on `products`

```sql
ALTER TABLE products ADD COLUMN cost_price INTEGER NOT NULL DEFAULT 0; -- cents
```

### Migration 017 — price list fields on `order_items`

```sql
ALTER TABLE order_items
  ADD COLUMN price_list_id UUID REFERENCES price_lists(id),  -- nullable (B2C orders don't use it)
  ADD COLUMN cost_price_snapshot INTEGER,                     -- cost at time of order
  ADD COLUMN revenue INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN cost_price_snapshot IS NOT NULL
      THEN (unit_price - cost_price_snapshot) * quantity
      ELSE NULL
    END
  ) STORED;
```

## API

Module: `apps/api/src/modules/price-lists/`
Auth: all endpoints require `admin` or `owner` role.

| Method   | Route                                           | Description              |
| -------- | ----------------------------------------------- | ------------------------ |
| `GET`    | `/api/price-lists`                              | List all (paginated)     |
| `POST`   | `/api/price-lists`                              | Create                   |
| `GET`    | `/api/price-lists/:id`                          | Get by ID                |
| `PATCH`  | `/api/price-lists/:id`                          | Update                   |
| `DELETE` | `/api/price-lists/:id`                          | Soft delete              |
| `GET`    | `/api/price-lists/:id/calculate?product_id=xxx` | Preview calculated price |

### `/calculate` response

```json
{
  "success": true,
  "data": {
    "cost_price": 10000,
    "margin": 50,
    "unit_price": 15000,
    "unit_price_formatted": "$150,00"
  }
}
```

### Zod validation schema

```typescript
const createPriceListSchema = z.object({
  name: z.string().min(1).max(100),
  margin: z.number().min(0).max(10000),
  discount: z.number().min(0).max(100).default(0),
  is_active: z.boolean().default(true)
});
```

## Admin UI

Route: `apps/web/src/app/admin/listas-de-precio/page.tsx`

**Table view:**

- Columns: Nombre, Margen (%), Descuento (%), Estado, Acciones
- "Nueva lista" button → opens create modal
- Row actions: Editar, Activar/Desactivar, Eliminar (with confirmation dialog)

**Create/Edit modal:**

- Fields: Nombre (required), Margen % (number ≥ 0), Descuento % (number, disabled with tooltip "reservado para uso futuro")

## Out of Scope (this iteration)

- Price calculator widget in admin UI
- Assigning default price list per customer
- Using `discount` in the price formula
