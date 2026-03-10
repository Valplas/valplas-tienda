# Order Edit Feature — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow admins to edit an existing order's items and delivery address while it is in `processing` state, with correct stock management.

**Architecture:** New `PATCH /api/orders/admin/:id` endpoint with in-transaction stock diffing + dedicated Next.js edit page at `/admin/pedidos/[id]/editar` that reuses product-search/price-list/address-selection UX from the order creation page.

**Tech Stack:** PostgreSQL triggers (session variable skip), Express + Zod, Next.js App Router, shadcn/ui, Zustand-free local state.

---

## Context

- `apps/api/src/modules/orders/` — order domain (controller, domain, repository, types, validators, routes)
- `apps/api/src/infrastructure/database/migrations/` — SQL migrations (numbered, auto-discovered)
- `apps/web/src/app/admin/pedidos/nuevo/page.tsx` — reference for the form UX to replicate
- `apps/web/src/lib/services/orders.service.ts` — frontend API wrapper
- Current default status for admin-created orders: `'payment_confirmed'` (must change to `'processing'`)
- Stock trigger `handle_stock_on_item_insert` (migration 019) currently deducts stock only for `payment_confirmed`; must also handle `processing` and support a skip flag

---

## Task 1: Migration 020 — fix stock trigger for `processing` + skip flag

**Files:**

- Create: `apps/api/src/infrastructure/database/migrations/020_fix_stock_trigger_processing.sql`

**Step 1: Create the migration file**

```sql
-- Migration: 020_fix_stock_trigger_processing
-- Description:
-- 1. Treat 'processing' same as 'payment_confirmed' in handle_stock_on_item_insert
--    (admin orders are now created at 'processing' status)
-- 2. Add app.skip_stock_trigger session variable support so the edit endpoint
--    can manage stock manually without double-deduction
-- Created: 2026-03-10

CREATE OR REPLACE FUNCTION handle_stock_on_item_insert()
RETURNS TRIGGER AS $$
DECLARE
  order_status TEXT;
  available_stock INTEGER;
BEGIN
  -- Skip if called from admin order edit (stock handled manually in that path)
  IF current_setting('app.skip_stock_trigger', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Get the order status
  SELECT status INTO order_status
  FROM orders
  WHERE id = NEW.order_id;

  -- Lock the product row to prevent race conditions
  SELECT (stock - reserved_stock) INTO available_stock
  FROM products
  WHERE id = NEW.product_id
  FOR UPDATE;

  -- Check if there's enough available stock
  IF available_stock < NEW.quantity THEN
    RAISE EXCEPTION 'Stock insuficiente para el producto %. Disponible: %, Solicitado: %',
      NEW.product_id, available_stock, NEW.quantity
      USING ERRCODE = 'check_violation';
  END IF;

  IF order_status = 'payment_confirmed' OR order_status = 'processing' THEN
    -- Deduct stock directly (payment already confirmed / admin order)
    UPDATE products
    SET stock = stock - NEW.quantity
    WHERE id = NEW.product_id;
  ELSE
    -- Normal order pending payment: only reserve stock
    UPDATE products
    SET reserved_stock = reserved_stock + NEW.quantity
    WHERE id = NEW.product_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Rollback SQL (commented for reference)
-- Restore the version from migration 019_fix_stock_triggers.sql
```

**Step 2: Run the migration**

```bash
cd apps/api && bun db:migrate
```

Expected output: `✅ Completada: 020_fix_stock_trigger_processing.sql`

**Step 3: Commit**

```bash
git add apps/api/src/infrastructure/database/migrations/020_fix_stock_trigger_processing.sql
git commit -m "fix(db): add processing status and skip flag to stock insert trigger"
```

---

## Task 2: Change default admin order status + store shipping_address_id

**Files:**

- Modify: `apps/api/src/modules/orders/order.repository.ts` (lines ~285–335, `createAdminOrder` function)

**Step 1: Change `'payment_confirmed'` → `'processing'` and add `shipping_address_id` to the INSERT**

Find the `createAdminOrder` function. The INSERT currently has:

```typescript
'payment_confirmed',   // status
```

And does NOT include `shipping_address_id`.

Replace the INSERT statement with:

```typescript
const orderResult = await client.query<Order>(
  `INSERT INTO orders (
        order_number, user_id, status, subtotal, shipping_cost, total,
        shipping_address_id,
        shipping_street, shipping_street_number, shipping_floor, shipping_apartment,
        shipping_city, shipping_province, shipping_postcode,
        payment_method, customer_notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
  [
    orderNumber,
    data.user_id,
    'processing',
    data.subtotal,
    0,
    data.total,
    data.shipping_address_id,
    data.shipping_street,
    data.shipping_street_number,
    data.shipping_floor ?? null,
    data.shipping_apartment ?? null,
    data.shipping_city,
    data.shipping_province,
    data.shipping_postcode,
    data.payment_method ?? 'manual',
    data.notes ?? null
  ]
);
```

Also update the status history INSERT below it from `'payment_confirmed'` to `'processing'`:

```typescript
await client.query(
  `INSERT INTO order_status_history (order_id, status, notes, changed_by)
       VALUES ($1, $2, $3, $4)`,
  [order.id, 'processing', 'Orden creada por administrador', adminId]
);
```

**Step 2: Verify TypeScript compiles**

```bash
cd apps/api && bun typecheck
```

Expected: no errors.

**Step 3: Commit**

```bash
git add apps/api/src/modules/orders/order.repository.ts
git commit -m "fix(orders): set admin order default status to processing and store shipping_address_id"
```

---

## Task 3: Backend types + validator for updateAdminOrder

**Files:**

- Modify: `apps/api/src/modules/orders/order.types.ts`
- Modify: `apps/api/src/modules/orders/order.validators.ts`

**Step 1: Add `UpdateAdminOrderInput` to `order.types.ts`**

At the end of the file, after `CreateAdminOrderItemInput`, add:

```typescript
export interface UpdateAdminOrderInput {
  shipping_address_id: string;
  items: CreateAdminOrderItemInput[];
}
```

**Step 2: Add `updateAdminOrderSchema` to `order.validators.ts`**

At the end of the file, add:

```typescript
export const updateAdminOrderSchema = z.object({
  shipping_address_id: z.string().uuid(),
  items: z.array(createAdminOrderItemSchema).min(1)
});
```

**Step 3: Verify TypeScript**

```bash
cd apps/api && bun typecheck
```

**Step 4: Commit**

```bash
git add apps/api/src/modules/orders/order.types.ts apps/api/src/modules/orders/order.validators.ts
git commit -m "feat(orders): add UpdateAdminOrderInput type and validator"
```

---

## Task 4: Repository — `updateAdminOrder` function

**Files:**

- Modify: `apps/api/src/modules/orders/order.repository.ts`

**Step 1: Add the `UpdateAdminOrderData` interface and `updateAdminOrder` function at the end of the file**

```typescript
interface UpdateAdminOrderData {
  items: Array<{
    product_id: string;
    product_name: string;
    product_sku: string;
    quantity: number;
    unit_price: number;
  }>;
  shipping_street: string;
  shipping_street_number: string;
  shipping_floor?: string | null;
  shipping_apartment?: string | null;
  shipping_city: string;
  shipping_province: string;
  shipping_postcode: string;
  shipping_address_id: string;
}

export async function updateAdminOrder(
  orderId: string,
  data: UpdateAdminOrderData
): Promise<Order | null> {
  return transaction(async (client) => {
    // Disable stock trigger — we handle stock manually in this function
    await client.query("SET LOCAL app.skip_stock_trigger = 'true'");

    // Lock the order row and verify status
    const orderResult = await client.query<Order>('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [
      orderId
    ]);
    const order = orderResult.rows[0];
    if (!order || order.status !== 'processing') return null;

    // Load current items to calculate stock deltas
    const currentItemsResult = await client.query<{ product_id: string; quantity: number }>(
      'SELECT product_id, quantity FROM order_items WHERE order_id = $1',
      [orderId]
    );

    // Build old and new quantity maps (product_id → total qty)
    const oldMap = new Map<string, number>();
    for (const item of currentItemsResult.rows) {
      oldMap.set(item.product_id, (oldMap.get(item.product_id) ?? 0) + item.quantity);
    }
    const newMap = new Map<string, number>();
    for (const item of data.items) {
      newMap.set(item.product_id, (newMap.get(item.product_id) ?? 0) + item.quantity);
    }

    // Apply stock deltas for every product involved
    const allProductIds = new Set([...oldMap.keys(), ...newMap.keys()]);
    for (const productId of allProductIds) {
      const oldQty = oldMap.get(productId) ?? 0;
      const newQty = newMap.get(productId) ?? 0;
      const delta = newQty - oldQty;

      if (delta === 0) continue;

      if (delta > 0) {
        // Need additional stock — check availability first
        const stockResult = await client.query<{ available: number }>(
          'SELECT (stock - reserved_stock) AS available FROM products WHERE id = $1 FOR UPDATE',
          [productId]
        );
        const available = stockResult.rows[0]?.available ?? 0;
        if (available < delta) {
          throw new Error(
            `Stock insuficiente para producto ${productId}. Disponible: ${available}, necesario: ${delta}`
          );
        }
        await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [
          delta,
          productId
        ]);
      } else {
        // Release stock back (delta is negative)
        await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [
          -delta,
          productId
        ]);
      }
    }

    // Replace order items
    await client.query('DELETE FROM order_items WHERE order_id = $1', [orderId]);

    for (const item of data.items) {
      await client.query(
        `INSERT INTO order_items
           (order_id, product_id, product_name, product_sku, quantity, unit_price, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          orderId,
          item.product_id,
          item.product_name,
          item.product_sku,
          item.quantity,
          item.unit_price,
          Math.round(item.unit_price * item.quantity * 100) / 100
        ]
      );
    }

    // Recalculate totals
    const subtotal =
      Math.round(data.items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0) * 100) /
      100;

    // Update the order record
    const updatedResult = await client.query<Order>(
      `UPDATE orders
       SET subtotal = $1, total = $1,
           shipping_address_id = $2,
           shipping_street = $3, shipping_street_number = $4,
           shipping_floor = $5, shipping_apartment = $6,
           shipping_city = $7, shipping_province = $8, shipping_postcode = $9,
           updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [
        subtotal,
        data.shipping_address_id,
        data.shipping_street,
        data.shipping_street_number,
        data.shipping_floor ?? null,
        data.shipping_apartment ?? null,
        data.shipping_city,
        data.shipping_province,
        data.shipping_postcode,
        orderId
      ]
    );

    return updatedResult.rows[0] ?? null;
  });
}
```

**Step 2: Verify TypeScript**

```bash
cd apps/api && bun typecheck
```

**Step 3: Commit**

```bash
git add apps/api/src/modules/orders/order.repository.ts
git commit -m "feat(orders): add updateAdminOrder repository function with stock diffing"
```

---

## Task 5: Domain + controller + route for `updateAdminOrder`

**Files:**

- Modify: `apps/api/src/modules/orders/order.domain.ts`
- Modify: `apps/api/src/modules/orders/order.controller.ts`
- Modify: `apps/api/src/modules/orders/order.routes.ts`

**Step 1: Add domain function to `order.domain.ts`**

Add the import at the top (already has `findProductById`). Add after `createAdminOrder`:

```typescript
/**
 * Update order items and/or address (admin only, processing status only)
 */
export async function updateAdminOrder(
  orderId: string,
  data: UpdateAdminOrderInput
): Promise<OrderWithDetails> {
  const order = await orderRepository.findOrderById(orderId);
  if (!order) throw new Error('Orden no encontrada');
  if (order.status !== 'processing') {
    throw new Error('Solo se pueden editar órdenes en estado "En proceso"');
  }

  // Validate address is active
  const address = await addressRepository.findAddressById(data.shipping_address_id);
  if (!address || !address.is_active) {
    throw new Error('Dirección de envío inválida');
  }

  // Validate + enrich items with name/sku from DB
  const enrichedItems = [];
  for (const item of data.items) {
    const product = await findProductById(item.product_id);
    if (!product || !product.is_active) {
      throw new Error(`Producto ${item.product_id} no encontrado o inactivo`);
    }
    enrichedItems.push({
      product_id: item.product_id,
      product_name: product.name,
      product_sku: product.sku,
      quantity: item.quantity,
      unit_price: item.unit_price
    });
  }

  const updated = await orderRepository.updateAdminOrder(orderId, {
    items: enrichedItems,
    shipping_address_id: data.shipping_address_id,
    shipping_street: address.street,
    shipping_street_number: address.street_number,
    shipping_floor: address.floor ?? null,
    shipping_apartment: address.apartment ?? null,
    shipping_city: address.city,
    shipping_province: address.province,
    shipping_postcode: address.postcode
  });

  if (!updated) throw new Error('Error al actualizar pedido');

  const orderWithDetails = await orderRepository.findOrderWithDetails(orderId);
  if (!orderWithDetails) throw new Error('Error al obtener pedido actualizado');
  return orderWithDetails;
}
```

Also add `UpdateAdminOrderInput` to the import from `order.types.js`:

```typescript
import type {
  Order,
  OrderWithDetails,
  CreateOrderInput,
  CreateAdminOrderInput,
  UpdateAdminOrderInput, // ← add this
  UpdateOrderStatusInput,
  OrderFilters
} from './order.types.js';
```

**Step 2: Add controller function to `order.controller.ts`**

Add after `createAdminOrder`:

```typescript
/**
 * Update order items and/or address (admin only, processing status only)
 */
export async function updateAdminOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await orderDomain.updateAdminOrder(req.params.id, req.body);
    return res.json(ApiResponse.success(order));
  } catch (error) {
    next(error);
  }
}
```

**Step 3: Add route to `order.routes.ts`**

Add the import for the new validator:

```typescript
import {
  createOrderSchema,
  createAdminOrderSchema,
  updateAdminOrderSchema, // ← add this
  updateOrderStatusSchema,
  listOrdersSchema,
  adminListOrdersSchema
} from './order.validators.js';
```

Add the route after `router.post('/admin/create', ...)`:

```typescript
/**
 * @swagger
 * /api/orders/admin/{id}:
 *   patch:
 *     summary: Update order items and address (admin only, processing status only)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 */
router.patch(
  '/admin/:id',
  requireRole(['admin', 'owner']),
  validate(updateAdminOrderSchema, 'body'),
  orderController.updateAdminOrder
);
```

**Step 4: Verify TypeScript**

```bash
cd apps/api && bun typecheck
```

**Step 5: Commit**

```bash
git add apps/api/src/modules/orders/order.domain.ts \
        apps/api/src/modules/orders/order.controller.ts \
        apps/api/src/modules/orders/order.routes.ts
git commit -m "feat(orders): add PATCH /orders/admin/:id endpoint to edit order items and address"
```

---

## Task 6: Frontend service — `adminUpdateOrder`

**Files:**

- Modify: `apps/web/src/lib/services/orders.service.ts`

**Step 1: Add the function at the end of the file**

```typescript
export interface AdminUpdateOrderItem {
  product_id: string;
  quantity: number;
  unit_price: number;
}

export async function adminUpdateOrder(
  id: string,
  data: {
    shipping_address_id: string;
    items: AdminUpdateOrderItem[];
  }
): Promise<Order> {
  const res = await patch<Order>(`/orders/admin/${id}`, data);
  if (!res.success || !res.data)
    throw new Error(res.error?.message ?? 'Error al actualizar pedido');
  return res.data;
}
```

**Step 2: Verify TypeScript**

```bash
cd apps/web && bun typecheck
```

**Step 3: Commit**

```bash
git add apps/web/src/lib/services/orders.service.ts
git commit -m "feat(web): add adminUpdateOrder service function"
```

---

## Task 7: Detail page — "Editar Pedido" button

**Files:**

- Modify: `apps/web/src/app/admin/pedidos/[id]/page.tsx`

**Step 1: Add `Pencil` to the lucide imports**

The current import line is:

```typescript
import { ArrowLeft, Package, User, MapPin, CreditCard, Truck } from 'lucide-react';
```

Change to:

```typescript
import { ArrowLeft, Package, Pencil, User, MapPin, CreditCard, Truck } from 'lucide-react';
```

**Step 2: Add the edit button in the header section**

Find the header `<div className="flex items-center gap-4">`. It currently ends with `<OrderStatusBadge status={order.status} />`. Add the edit button between the flex-1 title div and the badge:

```tsx
<div className="flex items-center gap-4">
  <Button variant="ghost" size="icon" asChild>
    <Link href="/admin/pedidos">
      <ArrowLeft className="h-5 w-5" />
    </Link>
  </Button>
  <div className="flex-1">
    <h1 className="text-3xl font-bold">Pedido {order.order_number}</h1>
    <p className="text-muted-foreground">
      Creado el {dayjs(order.created_at).format('DD/MM/YYYY [a las] HH:mm')}
    </p>
  </div>
  {order.status === 'processing' && (
    <Button variant="outline" asChild>
      <Link href={`/admin/pedidos/${order.id}/editar`}>
        <Pencil className="h-4 w-4 mr-2" />
        Editar Pedido
      </Link>
    </Button>
  )}
  <OrderStatusBadge status={order.status} />
</div>
```

**Step 3: Verify TypeScript**

```bash
cd apps/web && bun typecheck
```

**Step 4: Commit**

```bash
git add apps/web/src/app/admin/pedidos/[id]/page.tsx
git commit -m "feat(web): add edit button on order detail page for processing orders"
```

---

## Task 8: New edit page `/admin/pedidos/[id]/editar`

**Files:**

- Create: `apps/web/src/app/admin/pedidos/[id]/editar/page.tsx`

This page is very similar to `nuevo/page.tsx` but:

- No user search — user is fixed from the order
- Addresses are loaded from the order's `user_id`
- Items are pre-populated from `order.items`
- On submit calls `adminUpdateOrder` instead of `adminCreateOrder`

**Step 1: Create the directory**

```bash
mkdir -p apps/web/src/app/admin/pedidos/[id]/editar
```

Wait — brackets in directory names work on Linux/Mac but can cause issues on Windows. On Windows with bash (MINGW), use:

```bash
mkdir -p "apps/web/src/app/admin/pedidos/[id]/editar"
```

**Step 2: Create `page.tsx`**

```tsx
'use client';

import { useState, useCallback, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { ArrowLeft, Search, Trash2, Plus, Loader2, MapPin, Package, Pencil } from 'lucide-react';
import { getAdminUserAddresses } from '@/lib/services/addresses.service';
import { getAdminProducts } from '@/lib/services/products.service';
import { getPriceLists, calculatePrice } from '@/lib/services/price-lists.service';
import { getAdminOrderById, adminUpdateOrder } from '@/lib/services/orders.service';
import { formatCurrency } from '@/lib/utils';
import type { Address } from '@/lib/services/addresses.service';
import type { PriceList } from '@/types';

interface OrderItem {
  product_id: string;
  product_name: string;
  product_sku: string;
  available_stock: number;
  price_list_id: string;
  price_list_name: string;
  unit_price: number;
  quantity: number;
}

interface ProductSearchResult {
  id: string;
  name: string;
  sku: string;
  available_stock: number;
}

export default function EditarPedidoPage({
  params: paramsPromise
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(paramsPromise);
  const router = useRouter();

  // Page state
  const [isLoadingOrder, setIsLoadingOrder] = useState(true);
  const [orderNumber, setOrderNumber] = useState('');
  const [userId, setUserId] = useState('');

  // Address
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false);

  // Products
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<ProductSearchResult[]>([]);
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null);
  const [selectedPriceListId, setSelectedPriceListId] = useState('');
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [quantity, setQuantity] = useState(1);
  const [isCalculatingPrice, setIsCalculatingPrice] = useState(false);

  // Order items
  const [items, setItems] = useState<OrderItem[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Submit
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load order + addresses + price lists on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoadingOrder(true);
      try {
        const [order, priceListsRes] = await Promise.all([
          getAdminOrderById(id),
          getPriceLists({ isActive: true, limit: 100 })
        ]);

        if (cancelled) return;

        if (order.status !== 'processing') {
          toast.error('Este pedido ya no se puede editar');
          router.push(`/admin/pedidos/${id}`);
          return;
        }

        setOrderNumber(order.order_number);
        setUserId(order.user_id);

        if (priceListsRes.success && priceListsRes.data) {
          setPriceLists(priceListsRes.data.priceLists);
        }

        // Load user addresses
        setIsLoadingAddresses(true);
        const addrs = await getAdminUserAddresses(order.user_id);
        if (!cancelled) {
          const active = addrs.filter((a) => a.is_active);
          setAddresses(active);

          // Pre-select address matching the order's shipping fields
          const match = active.find(
            (a) =>
              a.street === order.shipping_address?.street &&
              a.street_number === order.shipping_address?.street_number &&
              a.postcode === order.shipping_address?.postcode
          );
          if (match) setSelectedAddressId(match.id);
          else if (active.length === 1) setSelectedAddressId(active[0].id);
        }

        // Pre-populate items with available_stock = current qty (conservative)
        // Backend validates on save; +qty accounts for releasing those units on edit
        const preloaded: OrderItem[] = order.items.map((item) => ({
          product_id: item.product_id,
          product_name: item.product_name,
          product_sku: item.product_sku,
          available_stock: item.quantity + 999, // conservative upper bound, backend validates
          price_list_id: '',
          price_list_name: '',
          unit_price: item.unit_price,
          quantity: item.quantity
        }));
        if (!cancelled) setItems(preloaded);
      } catch {
        if (!cancelled) {
          toast.error('Error al cargar pedido');
          router.push('/admin/pedidos');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingOrder(false);
          setIsLoadingAddresses(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  // Search products with debounce (min 3 chars)
  const searchProducts = useCallback(async (search: string) => {
    if (search.trim().length < 3) {
      setProductResults([]);
      return;
    }
    setIsSearchingProducts(true);
    try {
      const { products } = await getAdminProducts({ search, limit: 20 });
      setProductResults(
        products.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          available_stock: p.available_stock ?? 0
        }))
      );
    } finally {
      setIsSearchingProducts(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchProducts(productSearch), 400);
    return () => clearTimeout(timer);
  }, [productSearch, searchProducts]);

  // Calculate price when product or price list changes
  useEffect(() => {
    if (!selectedProduct?.id || !selectedPriceListId) {
      setUnitPrice(0);
      return;
    }
    setIsCalculatingPrice(true);
    calculatePrice(selectedPriceListId, selectedProduct.id)
      .then((res) => {
        if (res.success && res.data) setUnitPrice(res.data.unitPrice);
      })
      .catch(() => setUnitPrice(0))
      .finally(() => setIsCalculatingPrice(false));
  }, [selectedProduct?.id, selectedPriceListId]);

  const handleSelectProduct = useCallback((product: ProductSearchResult) => {
    setSelectedProduct(product);
    setProductSearch('');
    setProductResults([]);
    setSelectedPriceListId('');
    setUnitPrice(0);
    setQuantity(1);
  }, []);

  const handleEditItem = useCallback(
    (index: number) => {
      const item = items[index];
      setEditingIndex(index);
      setSelectedProduct({
        id: item.product_id,
        name: item.product_name,
        sku: item.product_sku,
        available_stock: item.available_stock
      });
      setSelectedPriceListId(item.price_list_id);
      setUnitPrice(item.unit_price);
      setQuantity(item.quantity);
      setProductSearch('');
      setProductResults([]);
    },
    [items]
  );

  const handleAddItem = useCallback(() => {
    if (!selectedProduct || unitPrice <= 0) {
      toast.error('Seleccioná un producto con precio válido');
      return;
    }
    if (quantity < 1) {
      toast.error('La cantidad debe ser al least 1');
      return;
    }

    const priceList = priceLists.find((p) => p.id === selectedPriceListId);
    const newItem: OrderItem = {
      product_id: selectedProduct.id,
      product_name: selectedProduct.name,
      product_sku: selectedProduct.sku,
      available_stock: selectedProduct.available_stock,
      price_list_id: selectedPriceListId,
      price_list_name: priceList?.name ?? '',
      unit_price: unitPrice,
      quantity
    };

    if (editingIndex !== null) {
      setItems((prev) => prev.map((item, i) => (i === editingIndex ? newItem : item)));
      setEditingIndex(null);
    } else {
      const existingIndex = items.findIndex((i) => i.product_id === selectedProduct.id);
      if (existingIndex >= 0) {
        setItems((prev) =>
          prev.map((item, i) =>
            i === existingIndex ? { ...item, quantity: item.quantity + quantity } : item
          )
        );
      } else {
        setItems((prev) => [...prev, newItem]);
      }
    }

    setSelectedProduct(null);
    setSelectedPriceListId('');
    setUnitPrice(0);
    setQuantity(1);
  }, [selectedProduct, selectedPriceListId, unitPrice, quantity, items, priceLists, editingIndex]);

  const handleRemoveItem = useCallback(
    (index: number) => {
      if (editingIndex === index) {
        setEditingIndex(null);
        setSelectedProduct(null);
        setSelectedPriceListId('');
        setUnitPrice(0);
        setQuantity(1);
      }
      setItems((prev) => prev.filter((_, i) => i !== index));
    },
    [editingIndex]
  );

  const subtotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);

  const handleSubmit = useCallback(async () => {
    if (!selectedAddressId) {
      toast.error('Seleccioná una dirección de entrega');
      return;
    }
    if (items.length === 0) {
      toast.error('El pedido debe tener al menos un producto');
      return;
    }

    setIsSubmitting(true);
    try {
      await adminUpdateOrder(id, {
        shipping_address_id: selectedAddressId,
        items: items.map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          unit_price: i.unit_price
        }))
      });
      toast.success('Pedido actualizado correctamente');
      router.push(`/admin/pedidos/${id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al actualizar pedido');
    } finally {
      setIsSubmitting(false);
    }
  }, [id, selectedAddressId, items, router]);

  const selectedAddress = addresses.find((a) => a.id === selectedAddressId);

  if (isLoadingOrder) {
    return (
      <div className="space-y-6 max-w-4xl">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/admin/pedidos/${id}`}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Editar Pedido {orderNumber}
          </h1>
          <p className="text-muted-foreground mt-1">
            Modificá los productos y la dirección de entrega
          </p>
        </div>
      </div>

      {/* Address selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4" />
            Dirección de entrega
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingAddresses ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando direcciones...
            </div>
          ) : addresses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Este usuario no tiene direcciones registradas.
            </p>
          ) : (
            <div className="space-y-2">
              <Select value={selectedAddressId} onValueChange={setSelectedAddressId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccioná una dirección" />
                </SelectTrigger>
                <SelectContent>
                  {addresses.map((addr) => (
                    <SelectItem key={addr.id} value={addr.id}>
                      {addr.street} {addr.street_number}
                      {addr.floor ? `, Piso ${addr.floor}` : ''}
                      {addr.apartment ? ` ${addr.apartment}` : ''} — {addr.city} ({addr.postcode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedAddress && (
                <p className="text-xs text-muted-foreground">
                  {selectedAddress.street} {selectedAddress.street_number}
                  {selectedAddress.floor ? `, Piso ${selectedAddress.floor}` : ''}
                  {selectedAddress.apartment ? ` ${selectedAddress.apartment}` : ''},{' '}
                  {selectedAddress.city}, {selectedAddress.province} ({selectedAddress.postcode})
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Products */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4" />
            Productos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Product search */}
          <div className="space-y-3">
            <Label>Buscar producto</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Nombre, SKU o código..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="pl-9"
              />
              {isSearchingProducts && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {productResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-52 overflow-y-auto">
                  {productResults.map((p) => (
                    <button
                      key={p.id}
                      className="w-full text-left px-4 py-2 hover:bg-muted transition-colors border-b last:border-0"
                      onClick={() => handleSelectProduct(p)}
                    >
                      <div className="font-medium">{p.name}</div>
                      <div className="text-sm text-muted-foreground">
                        SKU: {p.sku} | Stock disponible: {p.available_stock}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected product form */}
            {selectedProduct && (
              <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
                <div>
                  <div className="font-medium">{selectedProduct.name}</div>
                  <div className="text-sm text-muted-foreground">
                    SKU: {selectedProduct.sku} | Stock disponible:{' '}
                    <span className="font-semibold">{selectedProduct.available_stock}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-sm">Lista de precios</Label>
                    <Select value={selectedPriceListId} onValueChange={setSelectedPriceListId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {priceLists.map((pl) => (
                          <SelectItem key={pl.id} value={pl.id}>
                            {pl.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-sm">Precio unitario</Label>
                    <div className="h-10 flex items-center px-3 border rounded-md bg-background text-sm">
                      {isCalculatingPrice ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : unitPrice > 0 ? (
                        <span className="font-medium">{formatCurrency(unitPrice)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-sm">Cantidad</Label>
                    <Input
                      type="number"
                      min={1}
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    />
                  </div>
                </div>

                {unitPrice > 0 && (
                  <div className="flex items-center justify-between text-sm border-t pt-2">
                    <span className="text-muted-foreground">Subtotal:</span>
                    <span className="font-semibold text-base">
                      {formatCurrency(unitPrice * quantity)}
                    </span>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button className="flex-1" onClick={handleAddItem} disabled={unitPrice <= 0}>
                    <Plus className="h-4 w-4 mr-2" />
                    {editingIndex !== null ? 'Actualizar ítem' : 'Agregar al pedido'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedProduct(null);
                      setSelectedPriceListId('');
                      setUnitPrice(0);
                      setQuantity(1);
                      setEditingIndex(null);
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Items table */}
          {items.length > 0 && (
            <div className="space-y-2">
              <Label>
                Productos del pedido{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  (hacé clic para editar)
                </span>
              </Label>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-center w-20">Cant.</TableHead>
                      <TableHead className="text-right">P. Unit.</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, i) => (
                      <TableRow
                        key={i}
                        className={`cursor-pointer hover:bg-muted/50 ${editingIndex === i ? 'bg-blue-50 dark:bg-blue-950/20' : ''}`}
                        onClick={() => editingIndex !== i && handleEditItem(i)}
                      >
                        <TableCell>
                          <div className="font-medium text-sm">{item.product_name}</div>
                          <div className="text-xs text-muted-foreground">{item.product_sku}</div>
                        </TableCell>
                        <TableCell className="text-center">{item.quantity}</TableCell>
                        <TableCell className="text-right text-sm">
                          {formatCurrency(item.unit_price)}
                        </TableCell>
                        <TableCell className="text-right font-medium text-sm">
                          {formatCurrency(item.unit_price * item.quantity)}
                        </TableCell>
                        <TableCell>
                          <div
                            className="flex gap-1 justify-end"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleEditItem(i)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleRemoveItem(i)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end text-sm">
                <span className="text-muted-foreground mr-4">Total:</span>
                <span className="font-bold text-base">{formatCurrency(subtotal)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => router.push(`/admin/pedidos/${id}`)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={isSubmitting || items.length === 0 || !selectedAddressId}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                'Guardar cambios'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 3: Verify TypeScript**

```bash
cd apps/web && bun typecheck
```

**Step 4: Commit**

```bash
git add "apps/web/src/app/admin/pedidos/[id]/editar/page.tsx"
git commit -m "feat(web): add order edit page at /admin/pedidos/[id]/editar"
```

---

## Manual Testing Checklist

After all tasks are complete, verify:

1. **Stock trigger fix (Task 1):**
   - Create a new admin order → check that `products.stock` decreases by the ordered quantities
   - Previously it went to `reserved_stock`, now it should go to `stock`

2. **New order status (Task 2):**
   - Create a new admin order → order list should show status "En proceso" (`processing`)
   - Detail page should show "Editar Pedido" button

3. **Edit page (Task 8):**
   - Navigate to an order in `processing` state
   - Click "Editar Pedido" → lands on edit page
   - Address dropdown is pre-selected (if address matches)
   - Existing items are shown in the table
   - Click an item row → loads into form for editing
   - Change quantity → save → stock adjusted correctly
   - Add new product → save → stock deducted for new product
   - Remove product → save → stock restored for removed product
   - Change address → save → order shows new address in detail page
   - Save → redirected to detail page with "Pedido actualizado correctamente" toast

4. **Edit blocked for non-processing orders:**
   - Open an order in `ready_to_ship` → no "Editar Pedido" button visible
   - Direct navigation to `/admin/pedidos/{id}/editar` → redirected to detail with error toast
