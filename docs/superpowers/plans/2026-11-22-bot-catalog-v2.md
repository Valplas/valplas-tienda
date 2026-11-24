# Catálogo v2 (presentaciones, atributos, tags, búsqueda, info del negocio) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover al backend toda la lógica que hoy duplica el bot de WhatsApp (combinación de presentaciones, búsqueda, datos del negocio) y mostrar en la web los mismos nombres de presentación y atributos.

**Architecture:** Migraciones nuevas 054–060 (nunca editar existentes). Funciones puras testeables para lo que tiene reglas (`describePresentations`, `planUnits`, `parseSearch`, `trimDeep`), consumidas por los módulos existentes (`catalog`, `bot`, `orders`, `cart`, `products`, `settings`) y un módulo nuevo `attributes`. Todo lo nuevo en `/api/bot` es aditivo. La web consume los campos derivados que devuelve la API.

**Tech Stack:** Express 5 + TS, `pg` contra Supabase, Zod 4, Vitest (contra la dev DB), Next.js 16 + shadcn/ui + React Hook Form.

**Spec:** `docs/superpowers/specs/2026-11-22-bot-catalog-v2-design.md` (leerlo antes de cada parte).

## Global Constraints

- Rama `feature/bot-catalog-v2`. **Un PR por Parte** contra `develop` (Parte 1 → 5, en orden). Nunca commitear en `develop`/`main`.
- Migraciones nuevas desde `054`; rollback SQL comentado al final de cada una; nunca editar una existente.
- Requests en snake_case en `/api/bot`; el admin de productos/tiers manda camelCase (patrón existente de `product.validator.ts` y `price-tier.validator.ts`): respetar el patrón de cada módulo. Respuestas: el middleware las pasa a camelCase.
- Nunca exponer `cost_price`, `margin` ni `price_list.name` en endpoints públicos o del bot.
- Sin N+1: datos relacionados con `WHERE x = ANY($1)` o `json_agg`.
- Precio de bulto siempre `computeBundlePrice(unitPrice, bundleSize)` (`apps/api/src/modules/orders/order-pricing.ts`), subtotal de línea `Math.trunc(bundlePrice × quantity × 100) / 100`.
- Formato ARS: `$46.980`, `$5.872,50` (punto de miles, coma decimal, sin decimales si son ,00).
- Contrato `/api/bot`: campos nuevos opcionales; único cambio de significado: `purchasable` considera stock.
- Botones con fetch/mutación: estado de carga local + `Loader2` + disabled (CLAUDE.md).
- Toda ruta nueva o modificada lleva su bloque `@swagger` (patrón de `bot.routes.ts`).
- Antes de cada commit: `git diff --staged` sin secrets; conventional commits; trailer de atribución de la sesión.
- Verificación API: `cd apps/api && bun run typecheck && bun run lint && bunx vitest run <archivos>`; web: `cd apps/web && bun run typecheck && bun run lint && bun run build` (la web no tiene tests).
- Las migraciones se aplican a mano a la dev DB con `cd apps/api && bun db:migrate` (staging usa la misma DB). Nunca contra prod.

## Review Focus

1. **Express 5 `req.query` es un getter que re-parsea en cada acceso:** mutarlo no sirve; el trim de query tiene que ir en el `query parser` de la app. Test en Task 1.
2. **Cliente que pide más unidades que el stock con el formato `units`, mezclado con líneas del formato viejo del mismo producto:** el stock se suma entre todas las líneas del producto. Test en Task 10.
3. **Producto sin unidad cargada y sin label en los tiers (todo el catálogo actual):** las respuestas deben verse igual que hoy ("Unidad", "Bulto x10"), sin `null` en textos. Test en Task 7.
4. **Búsqueda con texto crudo del cliente (signos, mayúsculas, acentos, "hola quiero…") y con `%`/`_`:** sin errores SQL, sin comodines inyectados, stopwords descartadas. Test en Task 20 y 21.
5. **Bump de versión en sentencias que no tocan filas y en cambios que no pasan por `products`:** `UPDATE … WHERE false` no bumpea; cambiar el margen de una lista o borrar un tier sí. Test en Task 4.

---

# Parte 1 — Base chica (PR 1)

### Task 1: Trim global de inputs

**Files:**

- Create: `apps/api/src/shared/middleware/trim-strings.middleware.ts`
- Modify: `apps/api/src/server.ts` (registrar después de `express.urlencoded`, línea ~73; `app.set('query parser', …)` antes de las rutas)
- Test: `apps/api/src/tests/shared/trim-strings.test.ts`

**Interfaces:**

- Produces: `trimDeep(value: unknown, isSkippedKey?: (key: string) => boolean): unknown`; `trimStrings: RequestHandler`; `trimmedQueryParser(str: string): Record<string, unknown>`; `TRIM_EXCLUDED_PATHS = ['/api/payments/webhook', '/api/webhooks/']`.

- [ ] **Step 1: Tests que fallan**

```ts
it('trimDeep recorta strings anidados y arrays', () => {
  expect(trimDeep({ a: '  x ', b: [' y '], c: { d: ' z' }, n: 1 })).toEqual({
    a: 'x',
    b: ['y'],
    c: { d: 'z' },
    n: 1
  });
});
it('no toca claves con password (cualquier mayúscula)', () => {
  const skip = (k: string) => /password/i.test(k);
  expect(trimDeep({ password: ' p ', newPassword: ' q ', name: ' n ' }, skip)).toEqual({
    password: ' p ',
    newPassword: ' q ',
    name: 'n'
  });
});
it('trimStrings recorta req.body y llama next', () => {
  const req = { originalUrl: '/api/products', body: { name: ' Bolsa ' } } as Request;
  const next = vi.fn();
  trimStrings(req, {} as Response, next);
  expect(req.body).toEqual({ name: 'Bolsa' });
  expect(next).toHaveBeenCalledOnce();
});
it('trimStrings no toca webhooks', () => {
  const req = { originalUrl: '/api/payments/webhook?id=1', body: { a: ' x ' } } as Request;
  trimStrings(req, {} as Response, vi.fn());
  expect(req.body).toEqual({ a: ' x ' });
});
it('trimmedQueryParser recorta valores', () => {
  expect(trimmedQueryParser('search=%20%20bolsa%20&tags=%20a&tags=b%20')).toEqual({
    search: 'bolsa',
    tags: ['a', 'b']
  });
});
it('integración: ?search=%20bolsa%20 devuelve lo mismo que ?search=bolsa', async () => {
  /* supertest a GET /api/catalog/products, comparar pagination.total */
});
```

- [ ] **Step 2: Correr y ver fallar** — `bunx vitest run src/tests/shared/trim-strings.test.ts` → FAIL (módulo no existe).
- [ ] **Step 3: Implementar.** `trimStrings` reemplaza `req.body = trimDeep(req.body, k => /password/i.test(k))` salvo si `req.path` empieza con algún `TRIM_EXCLUDED_PATHS` (usar `req.originalUrl` sin query). `trimmedQueryParser` = `trimDeep(querystring.parse(str))` con `node:querystring` (mismo parser "simple" que Express 5 trae por defecto). En `server.ts`: `app.set('query parser', trimmedQueryParser)`.
- [ ] **Step 4: Correr** el test nuevo + `src/tests/shared/csrf.test.ts` + `src/tests/auth` → PASS (login con contraseña no cambia).
- [ ] **Step 5: Commit** `feat(api): trim string inputs globally (body and query), except passwords and webhooks`

### Task 2: Limpieza de nombres existentes (migración 054)

**Files:**

- Create: `apps/api/src/infrastructure/database/migrations/054_trim_catalog_names.sql`

- [ ] **Step 1: Dry-run** contra la dev DB (script temporal en el scratchpad, no en el repo) contando:
      `SELECT count(*) FROM products WHERE name <> regexp_replace(btrim(name), '\s+', ' ', 'g')` (ídem `categories`, `brands`; `products.sku <> btrim(sku)`). Anotar los números en el mensaje del PR.
- [ ] **Step 2: Migración** con los 4 `UPDATE … SET name = regexp_replace(btrim(name), '\s+', ' ', 'g') WHERE name <> …` (y `sku = btrim(sku)`). Rollback comentado: "irreversible (datos); no aplica".
- [ ] **Step 3: Aplicar** `bun db:migrate` → la query del Step 1 devuelve 0 en las cuatro.
- [ ] **Step 4: Commit** `chore(db): trim and collapse whitespace in catalog names (054)`

### Task 3: Productos sin stock en el catálogo del bot

**Files:**

- Modify: `apps/api/src/modules/catalog/catalog.repository.ts` (`CatalogFilters` + condición de stock en `findPublicProducts`)
- Modify: `apps/api/src/modules/bot/bot.validators.ts` (`catalogProductsQuerySchema`)
- Modify: `apps/api/src/modules/bot/bot.mappers.ts` (`BotProduct`, `toBotProduct`)
- Modify: `apps/api/src/modules/bot/bot.routes.ts` (Swagger de `GET /catalog/products`)
- Test: `apps/api/src/tests/bot/bot.catalog.test.ts` (nuevo)

**Interfaces:**

- Produces: `CatalogFilters.include_out_of_stock?: boolean`; `BotProduct.in_stock: boolean`; `purchasable = presentations.length > 0 && available_stock > 0`.

- [ ] **Step 1: Tests que fallan** (producto de test: activo, con tier, `stock = reserved_stock`; crear con helper nuevo `createTestProduct({ stock: 0 })` en `tests/helpers.ts` — SKU `VITEST-<suffix>`, categoría `vitest-<suffix>`; sumar a `tests/setup.ts` el borrado `DELETE FROM products WHERE sku LIKE 'VITEST-%'` **antes** del de categorías):
  - sin parámetro el producto no aparece en `GET /api/bot/catalog/products?search=<nombre>`;
  - con `include_out_of_stock=true` aparece con `availableStock: 0`, `inStock: false`, `purchasable: false`;
  - `GET /api/bot/catalog/products/:id` de ese producto → `purchasable: false`;
  - `POST /api/bot/quote` con ese producto → `problems[0].code === 'INSUFFICIENT_STOCK'`.
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar.** Schema: `include_out_of_stock: z.enum(['true','false']).transform(v => v === 'true').optional()` (mismo criterio que `queryBoolean` de products: `z.coerce.boolean` invierte `'false'`). Repo: la condición `(p.stock - p.reserved_stock) > 0` se agrega solo si `!include_out_of_stock`.
- [ ] **Step 4: Correr** el test + `src/tests/catalog/catalog.repository.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(bot): include_out_of_stock param, inStock flag, purchasable considers stock`

### Task 4: Versión global del catálogo (migración 055 + `GET /catalog/status`)

**Files:**

- Create: `apps/api/src/infrastructure/database/migrations/055_create_catalog_state.sql`
- Create: `apps/api/src/modules/catalog/catalog-state.repository.ts`
- Modify: `apps/api/src/modules/bot/bot.domain.ts`, `bot.controller.ts`, `bot.routes.ts` (ruta `GET /catalog/status` antes de `/catalog/products/:id`)
- Test: `apps/api/src/tests/catalog/catalog-state.test.ts`

**Interfaces:**

- Produces: SQL `bump_catalog_version()`; `getCatalogState(): Promise<{ version: number; updated_at: string }>`; bot `GET /api/bot/catalog/status` → `{ catalogVersion, catalogUpdatedAt, storeInfoUpdatedAt }` (`storeInfoUpdatedAt` = `store_settings.updated_at`).
- Task 4b (migración 056) reemplaza los triggers de sentencia por constraint triggers diferidos (`<tabla>_catalog_bump`, `AFTER INSERT OR UPDATE OR DELETE … DEFERRABLE INITIALLY DEFERRED FOR EACH ROW`) con flag por transacción; Task 17 agrega ese mismo trigger a las tablas de atributos.

- [ ] **Step 1: Tests que fallan** (leer `version` antes y después):
  - `UPDATE price_lists SET margin = margin WHERE id = <lista de test>` → version +1 (al menos);
  - borrar un tier de test (`createTestTier` + `deleteTestTiers`) → version aumenta;
  - `UPDATE products SET name = name WHERE false` → version igual;
  - `GET /api/bot/catalog/status` con API key → 200 con los 3 campos, `catalogVersion` número.
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Migración.** Tabla `catalog_state (id SMALLINT PK DEFAULT 1 CHECK (id = 1), version BIGINT NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`, fila inicial, `ENABLE ROW LEVEL SECURITY` (patrón 044/051). Función:

```sql
CREATE FUNCTION bump_catalog_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM changed_rows) THEN RETURN NULL; END IF;
  UPDATE catalog_state SET version = version + 1, updated_at = NOW() WHERE id = 1;
  RETURN NULL;
END $$;
```

Por cada tabla (`products`, `product_price_tiers`, `price_lists`, `categories`, `brands`, `product_images`) tres triggers de sentencia, porque una transition table admite un solo evento: `AFTER INSERT … REFERENCING NEW TABLE AS changed_rows`, `AFTER UPDATE … REFERENCING NEW TABLE AS changed_rows`, `AFTER DELETE … REFERENCING OLD TABLE AS changed_rows`, todos `FOR EACH STATEMENT EXECUTE FUNCTION bump_catalog_version()`. Nombres `<tabla>_catalog_bump_ins|upd|del`. Rollback comentado con los `DROP TRIGGER`, `DROP FUNCTION`, `DROP TABLE`.
Comentario en la migración: el `UPDATE` de `catalog_state` toma el lock de la fila hasta el commit, así que dos transacciones que tocan el catálogo (p. ej. dos órdenes reservando stock) se serializan en ese punto; aceptable con el volumen actual.

- [ ] **Step 4: Aplicar** migración; **correr** el test + `src/tests/orders` (crear órdenes sigue andando) → PASS.
- [ ] **Step 5: Commit** `feat(catalog): global catalog version bumped by statement triggers + bot status endpoint`

### Task 5: Docs y PR de la Parte 1

**Files:** Modify `docs/BOT_API.md` (sección catálogo: `include_out_of_stock`, `inStock`, nuevo significado de `purchasable`, `GET /catalog/status` con regla "comparar `catalogVersion` por distinto"), `apps/api/src/modules/bot/bot.routes.ts` (Swagger ya hecho en 3–4).

- [ ] **Step 1:** `cd apps/api && bun run typecheck && bun run lint && bunx vitest run` → todo verde (anotar fallas preexistentes según memoria de CI si las hay).
- [ ] **Step 2: Commit** `docs(bot): out-of-stock catalog, purchasable change, catalog status`
- [ ] **Step 3:** push + PR "Catálogo v2 · Parte 1" contra `develop` (solo cuando el usuario lo pida).

---

# Parte 2 — Presentaciones (PR 2)

### Task 6: Campos de unidad y nombre de presentación (migración 057 + admin API)

**Files:**

- Create: `apps/api/src/infrastructure/database/migrations/057_add_presentation_fields.sql`
- Modify: `apps/api/src/modules/products/product.validator.ts`, `product.types.ts`, `product.repository.ts` (`createProduct`, `updateProduct`, `transformProductRow`, `PRICE_TIERS_SQL`)
- Modify: `apps/api/src/modules/products/price-tiers/price-tier.validator.ts`, `price-tier.types.ts`, `price-tier.repository.ts` (`replaceProductTiers`, `findTiersByProductId`)
- Test: `apps/api/src/tests/products/product-presentation-fields.test.ts`

**Interfaces:**

- Produces (DB): `products.unit_label VARCHAR(30)`, `products.unit_content_quantity NUMERIC(12,3) CHECK (> 0)`, `products.unit_content_label VARCHAR(40)`, CHECK `(unit_content_quantity IS NULL) = (unit_content_label IS NULL)`; `product_price_tiers.label VARCHAR(40)`; `order_items.presentation_label_snapshot VARCHAR(120)`. Todo NULL.
- Produces (API admin, camelCase): `unitLabel?: string | null`, `unitContentQuantity?: number | null`, `unitContentLabel?: string | null` en create/update de producto; `label?: string | null` en cada tier de `replaceProductTiersSchema` (y en bulk, opcional). `ProductWithDetails` suma `unitLabel`, `unitContentQuantity`, `unitContentLabel`; `priceTiers[]` suma `label: string | null`.

- [ ] **Step 1: Tests que fallan:** PUT producto de test con los 3 campos → GET admin los devuelve; mandar solo `unitContentQuantity` → 400; replace tiers con `label: 'Bulto'` → `findTiersByProductId` lo devuelve; strings vacíos `''` se guardan como `null`.
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar** migración (rollback comentado) + Zod (`z.string().max(30).nullable().optional()`, `''` → `null` con `.transform`) + refine "contenido completo o vacío" + repositorio.
- [ ] **Step 4: Aplicar migración; correr** el test + `src/tests/products` → PASS.
- [ ] **Step 5: Commit** `feat(products): sales unit and presentation label fields (057)`

### Task 7: `describePresentations` (función pura)

**Files:**

- Create: `apps/api/src/modules/catalog/presentation.ts`
- Test: `apps/api/src/tests/catalog/presentation.test.ts`

**Interfaces:**

- Produces:

```ts
export interface SalesUnit {
  label: string | null;
  contentQuantity: number | null;
  contentLabel: string | null;
}
export interface TierForDisplay {
  priceListId: string;
  minQuantity: number;
  unitPrice: number;
  label: string | null;
}
export interface PresentationView {
  priceListId: string;
  bundleSize: number;
  unitPrice: number;
  bundlePrice: number;
  label: string;
  contains: string | null;
  savingsPercent: number;
  description: string;
}
export function formatArs(amount: number): string;
export function pluralizeUnit(label: string, count: number): string;
export function describePresentations(unit: SalesUnit, tiers: TierForDisplay[]): PresentationView[]; // ordenadas por bundleSize ASC
export function productSummary(name: string, views: PresentationView[]): string | null; // null sin presentaciones
export function presentationSnapshot(view: PresentationView): string; // `${label} · ${contains}` o solo `${label}`, máx 120
```

- [ ] **Step 1: Tests que fallan** (valores del spec):
  - `formatArs(46980) === '$46.980'`, `formatArs(5872.5) === '$5.872,50'`;
  - `pluralizeUnit('paquete', 10) === 'paquetes'`, `('unidad', 2) === 'unidades'`, `('kg', 5) === 'kg'`, `('rollo', 1) === 'rollo'`;
  - con unidad `{label:'paquete', contentQuantity:100, contentLabel:'bolsas'}` y tiers 1 ($5.872,50, label `'Paquete'`) y 10 ($4.698, label `'Bulto'`): descriptions exactas `"Paquete de 100 bolsas: $5.872,50"` y `"Bulto de 10 paquetes (1.000 bolsas): $46.980 ($4.698 c/paquete, 20% menos)"`, `savingsPercent` 0 y 20, `contains` `"100 bolsas"` y `"10 paquetes (1.000 bolsas)"`;
  - sin unidad y sin labels (catálogo actual): labels `"Unidad"` y `"Bulto x10"`, descriptions `"Unidad: $5.872,50"` y `"Bulto x10: $46.980 ($4.698 c/u, 20% menos)"`, `contains` null;
  - unidad sin contenido (`{label:'rollo'}`), tier 1 sin label → label `"Rollo"`;
  - `productSummary('Bolsa', views)` empieza con `"Bolsa viene en: "` y une descriptions con `"; "`;
  - `presentationSnapshot` del bulto con unidad → `"Bulto · 10 paquetes (1.000 bolsas)"`; sin unidad → `"Bulto x10"`.
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar.** `savingsPercent = Math.floor((1 - unitPrice / base.unitPrice) * 100)` contra el de menor `minQuantity` (0 si es la base o si da negativo). Plural: termina en vocal → `+s`; consonante → `+es`; invariables `['kg','g','m','mts','cm','mm','lt','l','ml','cc']`. "de N <unidad plural>" usa `pluralizeUnit(unit.label ?? 'unidad', n)`; el total de contenido = `n × contentQuantity` formateado con punto de miles.
- [ ] **Step 4: Correr** → PASS.
- [ ] **Step 5: Commit** `feat(catalog): describePresentations with labels, contents, savings and ARS text`

### Task 8: Presentaciones descriptas en bot, catálogo público, producto por slug y carrito

**Files:**

- Modify: `apps/api/src/modules/catalog/catalog.repository.ts` (`PublicProduct` suma `unit: SalesUnit`; tiers suman `label`; query de detalle trae los 3 campos de unidad)
- Modify: `apps/api/src/modules/bot/bot.mappers.ts` (`toBotProduct`: `unit`, `presentations` desde `describePresentations`, `summary`)
- Modify: `apps/api/src/modules/products/product.service.ts` (`toPublicProduct`: `priceTiers` → `PresentationView[]` + `unit`)
- Modify: `apps/api/src/modules/cart/cart.repository.ts` (`TierInfo` suma `label`; `getProductsForCart` trae unidad) y `cart.service.ts` (cada ítem suma `presentationLabel: string`, `presentationContains: string | null`)
- Test: `apps/api/src/tests/bot/bot.catalog.test.ts`, `src/tests/products/product-public.test.ts`, `src/tests/cart/*` (extender)

**Interfaces:**

- Consumes: Task 7.
- Produces (bot): `BotProduct.unit: { label: string; contains: { quantity: number; of: string } | null } | null`, `BotProduct.summary: string | null`, `BotPresentation` = campos actuales + `label`, `contains`, `savings_percent`, `description` en snake_case (los actuales no cambian; el middleware los pasa a camelCase). Público y slug: `priceTiers[]` mantiene `priceListId`, `minQuantity`, `unitPrice` (la web los usa) y suma `bundlePrice`, `label`, `contains`, `savingsPercent`, `description`; nunca `priceListName`; `unit` igual que bot. Carrito: `presentationLabel`, `presentationContains`.

- [ ] **Step 1: Tests que fallan:** producto de test con unidad + tiers 1/10 con labels → bot list y `/:id` devuelven `summary`, `presentations[1].description` exacta del spec y `unit.contains.quantity === 100`; `GET /api/products/slug/:slug` devuelve `priceTiers[1].label === 'Bulto'` y **no** `priceListName`; `GET /api/cart` con ese ítem devuelve `presentationLabel === 'Bulto'`.
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar** (todas las lecturas en batch, sin queries por producto).
- [ ] **Step 4: Correr** los tests tocados + `src/tests/catalog` + `src/tests/cart` → PASS.
- [ ] **Step 5: Commit** `feat(catalog): described presentations in bot, public catalog, product page and cart`

### Task 9: `planUnits` (combinación óptima)

**Files:**

- Create: `apps/api/src/modules/orders/plan-units.ts`
- Test: `apps/api/src/tests/orders/plan-units.test.ts`

**Interfaces:**

- Produces:

```ts
export interface PlannablePresentation {
  priceListId: string;
  bundleSize: number;
  bundlePrice: number;
}
export type UnitsPlan =
  | {
      ok: true;
      lines: Array<{ priceListId: string; bundleSize: number; quantity: number }>;
      total: number;
    }
  | { ok: false; nearestBelow: number | null; nearestAbove: number | null };
export const MAX_PLAN_UNITS = 100_000;
export function planUnits(units: number, presentations: PlannablePresentation[]): UnitsPlan;
```

- [ ] **Step 1: Tests que fallan:**
  - tamaños 1 (`bundlePrice` 5872.5) y 10 (`bundlePrice` 46980), valores del spec: `planUnits(12)` → 1×10 + 2×1, `total 58725`;
  - tamaños 6 y 10 con `bundlePrice` 6×100 y 10×110: `planUnits(12)` → 2×6 (1200), no 10+… (inalcanzable con 10+2);
  - solo tamaño 10: `planUnits(12)` → `{ ok:false, nearestBelow:10, nearestAbove:20 }`; `planUnits(5)` → `nearestBelow: null, nearestAbove: 10`;
  - empate de costo → menos bultos totales;
  - `lines` ordenadas por `bundleSize` DESC y sin cantidades 0.
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar** DP de mochila no acotada exacta sobre `0..units` (costo en centavos enteros para no acumular error de float; `cost[0]=0`, `cost[u] = min(cost[u - s] + price_s)`, desempate por bultos), reconstrucción por punteros. Para inalcanzable: buscar el alcanzable más cercano hacia abajo en la misma tabla y hacia arriba extendiendo hasta `units + max(bundleSize)`.
- [ ] **Step 4: Correr** → PASS.
- [ ] **Step 5: Commit** `feat(orders): planUnits exact cheapest presentation mix`

### Task 10: `units` en `/quote` y `/orders` del bot

**Files:**

- Create: `apps/api/src/modules/bot/bot-units.ts`
- Modify: `apps/api/src/modules/bot/bot.validators.ts` (`botOrderItemSchema` → unión), `bot.domain.ts` (`quote`, `createOrder`), `bot.mappers.ts` (`toBotQuoteLine` suma `label`, `description`), `bot.routes.ts` (Swagger)
- Modify: `apps/api/src/modules/orders/order-pricing.ts` (tipo `OrderPricingProblem` suma `UNITS_NOT_ACHIEVABLE`; `pricingProblemToError` → 422 con `details`)
- Test: `apps/api/src/tests/bot/bot.units.test.ts`

**Interfaces:**

- Consumes: Task 9 `planUnits`; nueva `getActiveTiersByProductIds(productIds: string[]): Promise<Map<string, TierForDisplay[]>>` en `catalog.repository.ts`, extraída de la query de tiers de `findPublicProductsByIds` (que pasa a usarla).
- Produces:

```ts
type BotItemInput =
  | { product_id: string; price_list_id: string; quantity: number }
  | { product_id: string; units: number };
export interface ExpandedBotItems {
  pricingItems: CreateOrderItemInput[]; // lo que va a priceOrderItems / createOrder
  requestedGroups: Array<{ product_id: string; units: number; lineIndexes: number[] }>; // por ítem recibido, en orden
  problems: OrderPricingProblem[]; // UNITS_NOT_ACHIEVABLE / PRICE_TIER_NOT_FOUND
}
export async function expandBotItems(items: BotItemInput[]): Promise<ExpandedBotItems>;
```

Respuesta de quote suma `requested: [{ productId, units, subtotal, breakdown: QuoteLine[] }]`.

- [ ] **Step 1: Tests que fallan** (producto de test con tiers 1 y 10):
  - `POST /quote` `{ items: [{ product_id, units: 12 }] }` → `requested[0].units === 12`, `breakdown` de 2 líneas (bundleSize 10 qty 1, bundleSize 1 qty 2), `subtotal` = suma exacta;
  - `POST /orders` con el mismo ítem → `order.total - shipping === quote.subtotal` y `items` iguales a las líneas de la cotización;
  - formato viejo sin cambios (el test actual de `bot.orders.test.ts` sigue verde);
  - ítem con `units` y `price_list_id` a la vez → 400 VALIDATION_ERROR;
  - producto con solo tier 10, `units: 12` → quote `problems[0]` `{ code:'UNITS_NOT_ACHIEVABLE', requested:12, nearestBelow:10, nearestAbove:20 }`, orders → 422 mismo código;
  - `units` > disponible, mezclado con una línea vieja del mismo producto → `INSUFFICIENT_STOCK` con `requested` = suma de unidades de ambas.
  - dos ítems `units` del mismo producto (5 y 7) → se planifican juntos como 12.
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar.** Zod: `z.union([viejo.strict(), z.object({ product_id, units: z.number().int().min(1).max(MAX_PLAN_UNITS) }).strict()])`. `expandBotItems` agrupa `units` por producto, lee tiers en batch, llama `planUnits` con `bundlePrice = computeBundlePrice(unitPrice, minQuantity)` y emite líneas `{ product_id, price_list_id, quantity }`. Stock lo sigue validando `priceOrderItems` (ya suma unidades por producto). `quote` y `createOrder` usan la misma `expandBotItems`.
- [ ] **Step 4: Correr** el test + `src/tests/bot` + `src/tests/orders` → PASS.
- [ ] **Step 5: Commit** `feat(bot): quote and create orders by units with server-side cheapest breakdown`

### Task 11: Snapshot del nombre de presentación en `order_items`

**Files:**

- Modify: `apps/api/src/modules/orders/order-pricing.ts` (`PricedOrderLine.presentation_label_snapshot: string | null`, calculado con `describePresentations`/`presentationSnapshot`)
- Modify: `apps/api/src/modules/orders/order.repository.ts` (los 3 `INSERT INTO order_items`, líneas ~510, ~617, ~975; `findOrderWithDetails` lo selecciona)
- Modify: el armado de líneas de órdenes admin que alimenta los INSERT de ~617 y ~975 (buscar quién arma `cost_price_snapshot` en `order.domain.ts`; mismo cálculo con `presentationSnapshot`)
- Modify: `apps/api/src/modules/bot/bot.mappers.ts` (`toBotOrder` items suman `presentation_label`)
- Test: `apps/api/src/tests/orders/order-presentation-snapshot.test.ts`

**Interfaces:**

- Consumes: Task 7 `presentationSnapshot`; `TierInfo.label` y unidad del producto (Task 8).
- Produces: `order_items.presentation_label_snapshot` lleno en órdenes web, bot y admin; bot `items[].presentationLabel`.

- [ ] **Step 1: Tests que fallan:** orden bot con tier label `'Bulto'` (10) y unidad paquete de 100 bolsas → `presentation_label_snapshot === 'Bulto · 10 paquetes (1.000 bolsas)'`; renombrar el tier después no cambia el snapshot; una orden admin también lo llena; `GET /api/bot/orders/:orderNumber` devuelve `items[0].presentationLabel`.
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correr** el test + `src/tests/orders` + `src/tests/bot` → PASS.
- [ ] **Step 5: Commit** `feat(orders): snapshot presentation label on order items`

### Task 12: Panel y tienda web con nombres de presentación

**Files:**

- Modify: `apps/web/src/components/admin/product-form.tsx` (sección "Unidad de venta": nombre, cantidad, contenido; ayuda "Ej.: paquete de 100 bolsas")
- Modify: `apps/web/src/components/admin/price-tiers-section.tsx` (input "Nombre" por tier, placeholder con el fallback "Unidad"/"Bulto x{n}")
- Modify: `apps/web/src/types/index.ts` (`PriceTier` suma `label`, `contains`, `description`, `savingsPercent`, `bundlePrice`; `Product`/`ProductPublic` suman `unit`), `apps/web/src/lib/services/products.service.ts` (adapter)
- Modify: `apps/web/src/components/product/price-tier-selector.tsx`, `apps/web/src/components/cart/cart-item.tsx`, `apps/web/src/components/checkout/payment-step.tsx` (usar `label`/`contains`/`savingsPercent` de la API; `cart-item` usa `item.presentationLabel`)
- Modify: `apps/web/src/lib/pricing.ts` (`presentationLabel` queda solo como fallback para datos viejos del carrito local)
- Modify: vistas de detalle de pedido de cliente y admin (buscar `productName` en `src/app/(account)` y `src/app/admin/pedidos`) → mostrar `presentationLabelSnapshot` bajo el nombre si existe

- [ ] **Step 1:** Implementar. El selector muestra `label`, `contains` y "Ahorrás N%" si `savingsPercent > 0`.
- [ ] **Step 2: Verificar** `cd apps/web && bun run typecheck && bun run lint && bun run build` → OK.
- [ ] **Step 3: Verificar a mano** (skill `run`): cargar unidad + labels a un producto desde el panel, ver página de producto, carrito, checkout y detalle de pedido con los textos nuevos; un producto sin datos se ve como hoy.
- [ ] **Step 4: Commit** `feat(web): presentation names, contents and savings in admin, product page, cart and checkout`

### Task 13: Docs y PR de la Parte 2

- [ ] **Step 1:** `docs/BOT_API.md`: `unit`, `summary`, campos nuevos de `presentations`, formato `units` en quote/orders con ejemplo del spec, `requested`, `UNITS_NOT_ACHIEVABLE` (422, `nearestBelow`/`nearestAbove`), `presentationLabel` en órdenes. `docs/API_ENDPOINTS.md`: campos admin de producto/tiers.
- [ ] **Step 2:** suite API completa + build web → verde.
- [ ] **Step 3: Commit** `docs(bot): presentations, units quoting and order snapshots`; PR "Catálogo v2 · Parte 2" cuando el usuario lo pida.

---

# Parte 3 — Info del negocio (PR 3)

### Task 14: `store_settings` + endpoints admin y bot

**Files:**

- Create: `apps/api/src/infrastructure/database/migrations/058_add_store_info.sql`
- Create: `apps/api/src/modules/settings/store-info.validator.ts`
- Modify: `apps/api/src/modules/settings/settings.repository.ts`, `settings.service.ts`, `settings.controller.ts`, `settings.routes.ts`
- Modify: `apps/api/src/modules/bot/bot.routes.ts`, `bot.controller.ts`, `bot.domain.ts`
- Test: `apps/api/src/tests/settings/store-info.test.ts`

**Interfaces:**

- Produces (DB, todas NULL): `business_hours TEXT`, `delivery_days TEXT[]` (CHECK `<@ ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday']`), `delivery_zones TEXT[]`, `minimum_order NUMERIC(12,2)`, `free_shipping_from NUMERIC(12,2)`, `payment_methods TEXT[]` (CHECK `<@ ARRAY['mercadopago','transfer','cash_on_delivery','cash_pickup']`), `transfer_alias VARCHAR(40)`, `transfer_cbu VARCHAR(22)` (CHECK `~ '^\d{22}$'`), `transfer_holder VARCHAR(100)`, `transfer_bank VARCHAR(60)`, `pickup_address TEXT`, `price_list_url VARCHAR(500)`, `contact_phone VARCHAR(30)`, `contact_email VARCHAR(255)`, `additional_info TEXT`.
- Produces (service): `getStoreInfo(): Promise<StoreInfo>` (caché en memoria 60 s, variable de módulo con `expiresAt`), `updateStoreInfo(input: StoreInfoInput, updatedBy: string): Promise<StoreInfo>` (invalida la caché). `StoreInfo` = shape del spec (§4) con `transferDetails` null si los 4 campos de transferencia son null.
- Produces (rutas): `GET /api/settings/store-info` y `PUT /api/settings/store-info` (`authMiddleware`, `requireRole(['admin','owner'])`, body snake_case); `GET /api/bot/store/info`.

- [ ] **Step 1: Tests que fallan:** PUT como admin con todos los campos → GET bot devuelve el mismo contenido en camelCase; PUT como customer → 403; `transfer_cbu: '123'` → 400; `price_list_url: 'http://…'` → 400 (solo https); tras un PUT el GET bot ve el cambio inmediato (caché invalidada); campos no enviados quedan `null` (PUT reemplaza todo).
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar.** Teléfono con `normalizePhone` (`shared/utils/phone.ts`); emails `toLowerCase`.
- [ ] **Step 4: Aplicar migración; correr** el test + `src/tests/settings` → PASS.
- [ ] **Step 5: Commit** `feat(settings): store info (hours, delivery, payments, transfer) for admin and bot (058)`

### Task 15: Sección "Información del negocio" en `/admin/configuracion`

**Files:**

- Create: `apps/web/src/components/admin/settings/store-info-form.tsx`
- Modify: `apps/web/src/app/admin/configuracion/page.tsx`, `apps/web/src/lib/services/settings.service.ts`, `apps/web/src/types/index.ts`

- [ ] **Step 1: Implementar** con React Hook Form + Zod (mismas reglas que el backend), checkboxes para días y medios de pago, lista editable de zonas (input + chips), textarea para horario/info adicional, botón "Guardar" con estado de carga. Subtítulo de la página: "Apariencia e información de la tienda".
- [ ] **Step 2: Verificar** typecheck + lint + build web → OK.
- [ ] **Step 3: Verificar a mano**: guardar, recargar, ver datos; `GET /api/bot/store/info` los devuelve.
- [ ] **Step 4: Commit** `feat(web): admin store info form`

### Task 16: Docs y PR de la Parte 3

- [ ] `docs/BOT_API.md` (`GET /store/info`, campos, "sin dato → null", caché 60 s); `docs/API_ENDPOINTS.md` (endpoints admin). Suite + build verdes. Commit `docs(bot): store info endpoint`; PR "Catálogo v2 · Parte 3" cuando el usuario lo pida.

---

# Parte 4 — Atributos, tags y búsqueda (PR 4)

### Task 17: Diccionario de atributos (migración 059 + módulo `attributes`)

**Files:**

- Create: `apps/api/src/infrastructure/database/migrations/059_create_product_attributes.sql`
- Create: `apps/api/src/modules/attributes/attribute.{types,validator,repository,service,controller,routes}.ts`
- Modify: `apps/api/src/server.ts` (`app.use('/api/attributes', attributeRoutes)`)
- Modify: `apps/api/src/tests/setup.ts` (borrar `attribute_definitions WHERE key LIKE 'vitest_%'` después de productos)
- Test: `apps/api/src/tests/attributes/attributes.test.ts`

**Interfaces:**

- Produces (DB): enum `attribute_value_type ('number','text','option')`; `attribute_definitions`, `category_attributes`, `product_attribute_values` exactamente como el spec §5 (PK, CHECK "exactamente un valor", índices, FKs `CASCADE` desde producto/categoría y `RESTRICT` desde definición); el constraint trigger diferido `<tabla>_catalog_bump` con `bump_catalog_version()` (patrón de la migración 056) en las 3 tablas; RLS habilitado; semilla `ON CONFLICT (key) DO NOTHING`:
  `ancho` "Ancho" number cm · `alto` "Alto" number cm · `profundidad` "Profundidad" number cm · `micrones` "Micrones" number µm aliases `{mic,micras,micron}` · `largo` "Largo" number m aliases `{metros,mts,mt}` · `gramaje` "Gramaje" number g/m² aliases `{gr,grs,gramos}` · `peso` "Peso" number kg · `capacidad` "Capacidad" number L aliases `{litros,lts,lt}` · `color` "Color" text · `talle` "Talle" option `{XS,S,M,L,XL,XXL}`. (Medidas del producto, no las de envío `products.width/height/length`.)
- Produces (API, `admin`/`owner`): `GET /api/attributes` (lista con categorías asignadas), `POST /api/attributes`, `PATCH /api/attributes/:id` (`key` inmutable), `DELETE /api/attributes/:id` (409 `ATTRIBUTE_IN_USE` si tiene valores; sugerir desactivar), `PUT /api/attributes/:id/categories` `{ category_ids: string[] }`, `GET /api/attributes/for-category/:categoryId` (propias + ancestros, sin duplicados, por `display_order`).

- [ ] **Step 1: Tests que fallan:** crear `vitest_x` number → listar; `key` repetida → 409; PATCH con `key` → 400; asignar a categoría hija y a la padre → `for-category/<hija>` devuelve ambas una vez; DELETE con valores → 409; customer → 403; la semilla existe (10 claves).
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar** (ancestros con CTE recursiva sobre `categories.parent_id`).
- [ ] **Step 4: Aplicar migración; correr** → PASS.
- [ ] **Step 5: Commit** `feat(attributes): attribute dictionary with category presets (059)`

### Task 18: Valores de atributos en productos y en el catálogo

**Files:**

- Modify: `apps/api/src/modules/products/product.validator.ts` (create/update: `attributes?: Array<{ attributeId: string; value: string | number }>`), `product.service.ts` (guardar en la misma transacción: borrar y reinsertar los del producto), `product.repository.ts` (admin detail incluye `attributes`)
- Modify: `apps/api/src/modules/attributes/attribute.repository.ts` (`findValuesByProductIds(ids): Promise<Map<string, ProductAttributeView[]>>`, `replaceProductValues(client, productId, values)`)
- Modify: `apps/api/src/modules/catalog/catalog.repository.ts`, `bot.mappers.ts`, `product.service.ts` (`toPublicProduct`)
- Test: `apps/api/src/tests/attributes/product-attributes.test.ts`

**Interfaces:**

- Produces: `ProductAttributeView = { key: string; label: string; value: number | string; unit: string | null }`, ordenados por `display_order`, solo definiciones activas. En bot, público y slug: `attributes: ProductAttributeView[]` (vacío si no hay).

- [ ] **Step 1: Tests que fallan:** guardar `micrones = 20` y `color = 'blanco'` → bot `/:id` devuelve `[{ key:'micrones', label:'Micrones', value:20, unit:'µm' }, …]`; valor `'abc'` para number → 400 `INVALID_ATTRIBUTE_VALUE`; `talle = 'XXXL'` → 400; definición desactivada no aparece; listado de 50 productos hace 1 query de atributos (espiar `query` o contar con un test de repositorio sobre `findValuesByProductIds`).
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correr** el test + `src/tests/products` + `src/tests/bot` → PASS.
- [ ] **Step 5: Commit** `feat(products): attribute values on products, exposed in bot and public catalog`

### Task 19: Tags (migración 060)

**Files:**

- Create: `apps/api/src/infrastructure/database/migrations/060_add_tags.sql` (`products.tags TEXT[] NOT NULL DEFAULT '{}'`, `categories.tags TEXT[] NOT NULL DEFAULT '{}'`)
- Create: `apps/api/src/shared/utils/tags.ts` (`normalizeTags(input: string[]): string[]` → minúscula, trim, colapsa espacios, sin vacíos ni duplicados, máx 30 tags de 40 caracteres)
- Modify: validators/repositorios de products y categories (create/update aceptan `tags`), `bot.mappers.ts` (`tags: string[]` = tags del producto ∪ tags de su categoría y ancestros), la API pública **no** los devuelve
- Test: `apps/api/src/tests/shared/tags.test.ts`, `apps/api/src/tests/products/product-tags.test.ts`

- [ ] **Step 1: Tests que fallan:** `normalizeTags([' Consorcio ', 'consorcio', '', 'Bolsa  Residuo'])` → `['consorcio','bolsa residuo']`; PUT producto con tags → bot los devuelve junto con los de la categoría; `GET /api/products/slug/:slug` no tiene `tags`.
- [ ] **Step 2–4:** correr → FAIL; implementar; aplicar migración; correr → PASS.
- [ ] **Step 5: Commit** `feat(catalog): editable tags on products and categories (060)`

### Task 20: Parser de búsqueda (función pura)

**Files:**

- Create: `apps/api/src/modules/catalog/search-parser.ts`
- Test: `apps/api/src/tests/catalog/search-parser.test.ts`

**Interfaces:**

- Produces:

```ts
export interface AttributeAliasIndex {
  /** término normalizado (label, key, unit, alias) → key */ terms: Map<string, string>;
}
export interface ParsedSearch {
  words: string[]; // normalizadas (minúscula, sin acentos), sin stopwords
  measures: Array<{ a: number; b: number }>;
  quantities: Array<{ value: number; attributeKey: string | null; rawUnit: string }>;
  fourDigitCandidates: number[]; // p. ej. 4050 → para el fallback 40x50
}
export const SEARCH_STOPWORDS: ReadonlySet<string>;
export function normalizeSearchText(text: string): string;
export function parseSearch(text: string, aliases: AttributeAliasIndex): ParsedSearch;
export function singularize(word: string): string; // "bolsas"→"bolsa", "rollos"→"rollo", "camisetas"→"camiseta"; palabras ≤3 letras sin cambio
```

- [ ] **Step 1: Tests que fallan:**
  - `parseSearch('Hola, quiero bolsas camiseta 40x50, cuánto salen?')` → `words` `['bolsas','camiseta']`, `measures` `[{a:40,b:50}]`;
  - `'40 x 50'`, `'40×50'`, `'40*50'`, `'40/50'` → misma medida;
  - `'film 20 micrones'` y `'film 20mic'` → `quantities [{ value:20, attributeKey:'micrones' }]`, `words ['film']`;
  - `'cinta 80 m'` → `attributeKey:'largo'`; `'tijera 6 pulgadas'` → `attributeKey:null, rawUnit:'pulgadas'`;
  - `'bolsa 4050'` → `fourDigitCandidates [4050]`, `words ['bolsa']`;
  - `'%_bolsa'` → `words ['bolsa']` (sin `%`/`_`); texto vacío o solo stopwords → todo vacío;
  - `SEARCH_STOPWORDS` incluye al menos: `hola, quiero, queria, necesito, tenes, tienen, hay, precio, precios, cuanto, cuesta, sale, salen, vale, de, del, la, las, el, los, un, una, unos, unas, para, por, con, y, o, me, mi, que, si, porfa, gracias, buenas, buen, dia, tarde`.
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar.** Orden: normalizar (NFD sin diacríticos, minúscula, `[^a-z0-9×*/x., ]` → espacio) → extraer medidas con `/(\d+(?:[.,]\d+)?)\s*[x×*\/]\s*(\d+(?:[.,]\d+)?)/` → extraer número+unidad pegado o separado contra `aliases.terms` y una lista de unidades conocidas sin atributo (`pulgadas`, `pulgada`, `"`) → números de 4 dígitos sueltos → el resto en `words` sin stopwords.
- [ ] **Step 4: Correr** → PASS.
- [ ] **Step 5: Commit** `feat(catalog): search parser with measures, unit quantities and stopwords`

### Task 21: Búsqueda en `findPublicProducts` (web y bot)

**Files:**

- Modify: `apps/api/src/modules/catalog/catalog.repository.ts` (`findPublicProducts` usa `parseSearch`; devuelve `search_mode: 'exact' | 'relaxed' | null`)
- Modify: `apps/api/src/modules/attributes/attribute.repository.ts` (`getAliasIndex(): Promise<AttributeAliasIndex>`, caché 60 s)
- Modify: `apps/api/src/modules/bot/bot.domain.ts` / `bot.controller.ts` (`searchMode` en la respuesta del listado, fuera de `pagination`)
- Test: `apps/api/src/tests/catalog/catalog-search.test.ts`

**Interfaces:**

- Consumes: Task 20, Task 18 (valores), Task 19 (tags).
- Produces: `findPublicProducts(filters): Promise<{ products; total; search_mode: 'exact' | 'relaxed' | null }>`.

- [ ] **Step 1: Tests que fallan** (productos de test `VITEST-` en categoría `vitest-` con nombres/tags/atributos controlados):
  - tag de producto `consorcio` → `search=consorcio` lo encuentra; tag de la categoría también;
  - nombre `"Bolsa Camiseta 40x50"` → `search=bolsas camiseta 40 x 50` y `search=4050 camiseta` lo encuentran;
  - atributo `micrones=20` sin "20" en el nombre → `search=film 20 mic` lo encuentra; `search=film 30 mic` no;
  - `search=hola quiero bolsas camiseta` → `search_mode 'exact'` con el producto;
  - `search=camiseta inexistentezz` → `search_mode 'relaxed'` y el producto primero;
  - con `search` y `sort` ausente o `featured`, el que coincide en nombre sale antes que el que coincide solo por tag; con `sort=price_asc` se respeta el precio;
  - `search=100%` no rompe (200).
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar.** Cada palabra (y su `singularize`) arma un `EXISTS`/`OR` parametrizado contra `unaccent(lower(p.name))`, `p.sku`, marca, categoría, `p.tags`, tags de la categoría y ancestros, `value_text` de atributos (escapar `%`, `_`, `\` y usar `ILIKE … ESCAPE '\'`). Medida: regex sobre el nombre `(^|\D)40\s*[x×*/]\s*50(\D|$)` (armada con los números, nunca con texto crudo) **o** `ancho=a AND alto=b` (en cualquier orden). Cantidad con `attributeKey`: valor numérico igual **o** número en el nombre. Modo exacto = AND de todo; si `total = 0` y hay ≥1 palabra → relajado (OR de palabras, `score` = coincidencias) ; si sigue en 0 y hay `fourDigitCandidates` → reintentar con medida `a = floor(n/100)`, `b = n % 100`. Relevancia: `3×(coincide nombre) + 2×(tag) + 1×(atributo/categoría)`, usada cuando hay `search` y `sort` es `featured`/ausente. Mantener la paginación de dos pasos.
- [ ] **Step 4: Correr** el test + `src/tests/catalog` + `src/tests/products` → PASS.
- [ ] **Step 5: Commit** `feat(catalog): smarter search (tags, measures, attributes, stopwords, relaxed mode) for web and bot`

### Task 22: Panel y web para atributos y tags

**Files:**

- Create: `apps/web/src/app/admin/atributos/page.tsx`, `apps/web/src/components/admin/attribute-form.tsx`, `apps/web/src/components/admin/tags-input.tsx`, `apps/web/src/lib/services/attributes.service.ts`
- Modify: `apps/web/src/components/admin/admin-sidebar.tsx` (entrada "Atributos"), `product-form.tsx` (sección "Características": claves de `for-category/:categoryId` precargadas, input por tipo, "Agregar otra" con `searchable-select`; `TagsInput` para tags), `category-form.tsx` (`TagsInput`)
- Modify: `apps/web/src/components/product/product-detail.tsx` (sección "Características" si `attributes.length > 0`: `label: valor unidad`), `apps/web/src/types/index.ts`, `products.service.ts`

- [ ] **Step 1: Implementar** (botones con loading; mobile-first).
- [ ] **Step 2: Verificar** typecheck + lint + build web → OK.
- [ ] **Step 3: Verificar a mano**: crear atributo, asignarlo a categoría, ver precargado en el producto, guardar valores y tags, ver "Características" en la página pública, buscar por tag desde la tienda.
- [ ] **Step 4: Commit** `feat(web): attributes admin page, product characteristics and tags inputs`

### Task 23: Docs y PR de la Parte 4

- [ ] `docs/BOT_API.md` (`attributes`, `tags`, cómo busca el backend, `searchMode`, ejemplo con texto crudo); `docs/API_ENDPOINTS.md` (`/api/attributes`, tags en productos/categorías). Suite + build verdes. Commit `docs(bot): attributes, tags and search behavior`; PR "Catálogo v2 · Parte 4" cuando el usuario lo pida.

---

# Parte 5 — Documento compartible (PR 5)

### Task 24: `docs/bot-api-cambios-2026-11.md`

**Files:** Create `docs/bot-api-cambios-2026-11.md`.

- [ ] **Step 1: Escribir** para el equipo del bot, en español: tabla de los 8 pedidos → qué se hizo / qué no y por qué (restockDate, `updated_since`, SKU a mano, B vs A no aplica porque los bultos son físicos); por cada cambio, request/response real copiado de la dev DB (sin datos personales; teléfonos enmascarados); qué tiene que cambiar el bot (dejar de combinar tramos y mandar `units`; usar `summary`/`description`; leer `store/info`; comparar `catalogVersion` por distinto; borrar `FAMILIAS` y reglas de medidas; interpretar `purchasable` nuevo y `searchMode`); datos a cargar por el negocio (unidades, labels, atributos, tags, info del negocio, SKU, producto "Sin nombre").
- [ ] **Step 2: Verificar** que cada ejemplo coincide con una llamada real a staging (`https://valplas-tienda-develop.up.railway.app/api/bot`) con la key del `.env` local (no imprimirla).
- [ ] **Step 3: Commit** `docs(bot): shareable summary of catalog v2 changes`; PR "Catálogo v2 · Parte 5" cuando el usuario lo pida.
