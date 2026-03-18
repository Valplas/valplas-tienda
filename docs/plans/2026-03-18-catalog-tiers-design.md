# Catálogo Público con Tiers de Precio — Diseño

**Fecha:** 2026-03-18

## Objetivo

Construir el catálogo público de productos con precios por volumen (tiers). El precio varía según la cantidad seleccionada: cada tier define una cantidad mínima y una lista de precios con su margen. Los tiers conviven con el sistema de órdenes manuales del admin, que sigue usando `order_items.price_list_id` directamente.

---

## DB

### Nueva tabla: `product_price_tiers` (migración 032)

```sql
CREATE TABLE product_price_tiers (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id     UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price_list_id  UUID NOT NULL REFERENCES price_lists(id) ON DELETE RESTRICT,
  min_quantity   INTEGER NOT NULL CHECK (min_quantity >= 1),
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, min_quantity)
);
```

### Fórmula de precio (calculada en DB inline)

```sql
ROUND(p.cost_price::numeric * (1 + pl.margin / 100))::integer AS unit_price
```

`cost_price` y `margin` nunca se exponen al frontend público.

---

## Backend

### Módulo `catalog` (separado del módulo `products` del admin)

```
apps/api/src/modules/catalog/
├── catalog.controller.ts
├── catalog.repository.ts
└── catalog.routes.ts
```

### Endpoint

**`GET /api/catalog/products`** — público, sin autenticación

Filtros: `category_id`, `brand_id`, `search`, `page`, `limit`

Respuesta por producto:

```json
{
  "id": "...",
  "name": "AGUA 401 600 CC",
  "sku": "28853",
  "slug": "agua-401-600-cc",
  "image_url": "...",
  "available_stock": 120,
  "category": { "id": "...", "name": "Aguas" },
  "brand": { "id": "...", "name": "401" },
  "tiers": [
    { "min_quantity": 1, "unit_price": 45589 },
    { "min_quantity": 12, "unit_price": 39991 }
  ]
}
```

`cost_price` y `margin` no se incluyen en la respuesta pública.

---

## Frontend

### Tipo `ProductPublic`

```typescript
interface PriceTier {
  min_quantity: number;
  unit_price: number;
}

interface ProductPublic {
  id: string;
  sku: string;
  name: string;
  slug: string;
  image_url: string;
  available_stock: number;
  category?: { id: string; name: string };
  brand?: { id: string; name: string };
  tiers: PriceTier[];
}
```

### ProductCard rediseñada

```
┌─────────────────────────────┐
│         [imagen]            │
│                             │
│ AGUA 401 600 CC             │
│ [En stock] SKU 28853        │
│                             │
│ Precio unitario por bulto:  │
│ $ 399,91                    │
│ Precio unitario:            │
│ $ 455,89                    │
│                             │
│ PRESENTACIÓN                │
│ [1] [12]                    │
│                             │
│ [-] [1] [+]  [🛒]          │
└─────────────────────────────┘
```

**Lógica:**

- Siempre muestra el precio del tier 1 como "Precio unitario"
- Muestra el precio del tier más barato (mayor cantidad) como "Precio unitario por bulto cerrado" — solo si hay más de un tier
- Botones PRESENTACIÓN: uno por tier, muestran el `min_quantity`, el seleccionado resaltado
- Si solo hay un tier → no se muestra la sección PRESENTACIÓN
- Si no hay tiers → se muestra `base_price` como fallback
- Cantidad al carrito = `min_quantity_del_tier_seleccionado × contador`

### Casos borde

- Sin stock → botón carrito deshabilitado, badge "Sin stock"
- Sin tiers → muestra `base_price`, sin sección PRESENTACIÓN
- Un solo tier → sin sección PRESENTACIÓN

### Archivos a crear/modificar

| Archivo                                            | Acción                                  |
| -------------------------------------------------- | --------------------------------------- |
| `apps/web/src/types/index.ts`                      | Agregar `ProductPublic`, `PriceTier`    |
| `apps/web/src/lib/services/catalog.service.ts`     | Nuevo — llama a `/api/catalog/products` |
| `apps/web/src/components/product/product-card.tsx` | Reemplazar con diseño de tiers          |
| `apps/web/src/app/(public)/productos/page.tsx`     | Reconectar al nuevo servicio            |

---

## Lo que NO cambia

- Módulo `products` del admin — sin tiers, sin cambios
- `order_items.price_list_id` — el admin sigue asignando listas manualmente
- Auth, sesiones, rutas protegidas
