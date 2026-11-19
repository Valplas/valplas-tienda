# Plan: rendimiento SQL en Valplas (DB + API + frontend)

## Context

Se auditó el proyecto contra `rendimiento-sql-conceptos.md` (Winand): 43 migraciones, todos los repositorios de `apps/api/src/modules/**` y el consumo de listados en `apps/web/src`. No hay SQL injection ni filtros `($1 IS NULL OR col = $1)`; los filtros ya son dinámicos con bind params. Los costos reales están en:

- Búsquedas `unaccent(col) ILIKE '%x%'` y `lower(email) = lower($1)` que no pueden usar ningún índice existente (§2.4, §2.7).
- Precio efectivo calculado con subquery correlacionada hasta 3 veces por fila en el catálogo público (§2.11, §6).
- Listados que hacen JOIN + `json_agg` + `GROUP BY` sobre todas las filas antes de `LIMIT/OFFSET` (§7).
- OFFSET sin desempate determinista en casi todos los listados (§7).
- N+1 en cotización de envío, alta/edición de pedidos admin y asignación masiva de tiers (§4).
- ~25 índices duplicados, redundantes o de baja selectividad, y algunos faltantes (§2.2, §8).
- Frontend: fetch duplicado del catálogo, listados truncados en silencio, payloads de más, round-trips evitables.

Volumen actual chico (~2.400 pedidos, ~840 usuarios, productos sin confirmar): el objetivo es que escale a 10x/100x (§3), no ganar milisegundos hoy.

Decisiones tomadas: precio con `LATERAL` (sin columna persistida), keyset en listados admin con scroll infinito (catálogo público sigue con OFFSET), bugs de correctitud incluidos como fase propia, consultas de solo lectura a Supabase permitidas para medir.

## Reglas de ejecución

- Una rama `feature/…` o `fix/…` por fase, desde `develop`. Nunca commitear en `develop`/`main`. Un PR por fase.
- Migraciones nuevas desde `044_…`, nunca editar existentes, rollback comentado en cada una. El runner (`apps/api/src/infrastructure/database/migrate.ts`) envuelve cada archivo en transacción → no usar `CREATE INDEX CONCURRENTLY`; tablas chicas, build bloqueante aceptable.
- Supabase vivo: solo `SELECT` / `EXPLAIN` de SELECTs. Todo DDL va por migración del repo, la aplica el usuario.
- Al iniciar implementación: consultar Context7 (pg, Next.js 16) si el MCP está autenticado.
- Cada índice nuevo se justifica con `EXPLAIN (ANALYZE, BUFFERS)` antes/después; si el plan no lo usa, no se crea.

---

## Fase 0 — Línea de base (solo lectura, sin código)

1. Filas por tabla: `SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY 2 DESC`.
2. Uso de índices: `pg_stat_user_indexes` (`idx_scan`, tamaño) → confirma qué índices se pueden borrar.
3. Drift de schema vs migraciones: valores del enum `order_status`, existencia de `orders.deleted_at`, índices reales (`pg_indexes`).
4. `EXPLAIN (ANALYZE, BUFFERS)` de las queries Q1, Q6, Q7, Q9, Q10, Q14 (catálogo, pedidos, productos admin, usuarios, login) con parámetros típicos. Guardar planes para comparar.
5. `pg_stat_statements` si está habilitado: top por `total_exec_time`.

Resultado: lista final de índices a crear/borrar y prioridad real de las fases 2–3.

## Fase 1 — Correctitud (rama `fix/order-stock-integrity`)

Va primero: toca triggers y datos, independiente del resto.

1. **Stock en confirmación de pago.** Migración `044`: `CREATE OR REPLACE FUNCTION deduct_stock_on_payment_confirmed` usando `real_quantity` (hoy `quantity`, `010:51-75`), igual que las otras dos funciones de `034`.
2. **Subtotal/revenue en pedidos admin con bundle.** `unit_price` significa precio por bulto en checkout web (`order.domain.ts:148,170`) y por unidad en admin (`order.domain.ts:394,404`); el trigger `calculate_order_item_subtotal` (`009:39-50`) y la columna generada `revenue` (`018:24-30`) asumen por bulto. Unificar en **por bulto**: el camino admin pasa a guardar `unit_price` y `cost_price_snapshot` por bulto (`order.domain.ts`, `order.repository.ts:490,732`). Confirmar leyendo ambos caminos antes de tocar.
3. **Estado `failed`.** Migración `045`: `ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'failed'` (archivo propio; el valor no puede usarse en la misma transacción). Verificar antes en Fase 0 si ya existe.
4. **`GET /users/:id/stats`.** Quitar filtro `orders.deleted_at` inexistente (`user.repository.ts:191,193`).
5. **Datos ya afectados** (stock desfasado, subtotales bajos en pedidos `ADM-` con `bundle_size_snapshot > 1`): solo consulta de diagnóstico de solo lectura y reporte. **Cualquier backfill requiere aprobación explícita aparte.**

Fuera de alcance, queda anotado: reembolso no restituye stock, tablas sin RLS, fecha UTC en número de pedido, `shipping_rates` en centavos vs pesos.

## Fase 2 — Índices (rama `feature/sql-indexes`)

**Migración `046_search_indexes`**

- `f_unaccent(text)` `IMMUTABLE` = `unaccent('unaccent'::regdictionary, $1)` (`unaccent` es STABLE, no indexable).
- `GIN (f_unaccent(name) gin_trgm_ops) WHERE deleted_at IS NULL` en `products`; reemplaza `idx_products_name_trgm`.
- `GIN (sku gin_trgm_ops) WHERE deleted_at IS NULL` en `products`.
- `GIN (f_unaccent(name) gin_trgm_ops)` en `brands` (búsqueda admin de productos); `idx_brands_name_trgm` se queda, lo usa `b.name % $1`.
- `idx_users_email_lower (lower(email)) WHERE deleted_at IS NULL` (no UNIQUE: puede haber duplicados por mayúsculas; verificar en Fase 0).
- `ANALYZE` de las tablas tocadas.

**Migración `047_listing_indexes`** (igualdad → orden → desempate, §2.6/§6)

- `orders (user_id, created_at DESC, id DESC)` — reemplaza `idx_orders_user_id`.
- `orders (status, created_at DESC, id DESC)` — reemplaza `idx_orders_status`.
- `orders (created_at DESC, id DESC)` — reemplaza `idx_orders_created_at`.
- `products (created_at DESC, id DESC) WHERE deleted_at IS NULL` y `products (name, id) WHERE deleted_at IS NULL` (orden default admin y catálogo).
- `users (created_at DESC, id DESC) WHERE deleted_at IS NULL`.
- FKs sin índice: `product_price_tiers (price_list_id)`, `order_status_history (changed_by)`.

**Migración `048_drop_redundant_indexes`** (cada uno confirmado con `idx_scan` de Fase 0)

- Duplican UNIQUE: `idx_users_email`, `idx_users_username`, `idx_users_phone`, `idx_categories_slug`, `idx_brands_slug`, `idx_products_slug`, `idx_products_sku`, `idx_orders_order_number`, `idx_shipping_carriers_code`, `idx_refresh_tokens_token_hash`.
- Redundantes por columna líder: `idx_product_images_product_id`, `idx_zone_postcodes_zone_id`, `idx_product_price_tiers_product_id`.
- Inútiles / baja selectividad: `idx_products_stock`, `idx_*_active` (8 tablas), `idx_users_role`, `idx_zone_postcodes_excluded`, `idx_order_status_history_status`.

Diferidos hasta ver planes reales: trigram en `users` (nombre/email/teléfono) y en `orders.order_number` — con <3k filas un seq scan gana.

## Fase 3 — Queries de la API (rama `feature/sql-query-rewrites`)

**3.1 Búsqueda e igualdad sargable**

- `unaccent(col) ILIKE unaccent($n)` → `f_unaccent(col) ILIKE f_unaccent($n)` en `catalog.repository.ts:97`, `product.repository.ts:71`.
- Login/lookup por email queda igual en SQL (`lower(email) = lower($1)`), ahora con índice: `auth.repository.ts:26,56,75`, `user.repository.ts:211`.

**3.2 Catálogo público** (`catalog.repository.ts:45-66,130-162`)

- Precio efectivo una sola vez con `LEFT JOIN LATERAL (… ORDER BY min_quantity LIMIT 1) ep ON true`; SELECT, filtro min/max y ORDER BY referencian `ep.price`.
- Primera imagen también por `LATERAL`.
- Agregar `p.id` como desempate en todos los `ORDER BY_CLAUSE`.
- Count: sin joins a categorías/marcas; con LATERAL solo si hay filtro de precio.
- Validar `page`/`limit` con Zod (`catalog.controller.ts:42-43`, `brand.controller.ts:12-13`); reusar `paginationSchema` de `banner.validator.ts:95-100` moviéndolo a `shared/`.

**3.3 Paginar antes de agregar** (patrón `paged_users` de `user.repository.ts:111-147`)

- Productos admin (`product.repository.ts:149-190`): CTE con ids paginados → luego imágenes y tiers. Columnas explícitas en vez de `p.*` (sin `description` en lista). Param `fields=basic` para pickers (id, name, sku, stock): sin imágenes ni tiers.
- Pedidos (`order.repository.ts:115-194`): CTE con ids paginados → luego `json_agg` de items. Columnas explícitas en vez de `o.*`. Count sin JOIN a `users` salvo que haya `search`.
- Marcas (`brand.repository.ts:33-52`): paginar marcas y recién después contar productos.

**3.4 Fechas como rango semiabierto**

- `order.repository.ts:84-94`: `created_at >= $from AND created_at < $to + 1 día` (hoy `<=` excluye el último día); validar `from_date`/`to_date` como fecha en `order.validators.ts:50-51`.
- `accounting.repository.ts:40`: `DATE(created_at AT TIME ZONE …) = $1` → rango `[día, día+1)` en hora de Buenos Aires convertido a `timestamptz`.

**3.5 N+1 y round-trips**

- Cotización de envío: JOIN a `shipping_carriers` dentro de `findRatesByZonesAndAmount` (`shipping.repository.ts:419`, `shipping.domain.ts:193-194`). `shipping-cost.ts:29-33`: filtrar `carrier_id` en SQL. `shipping-coverage.ts:43`: usar `zones.length`, no segundo COUNT. `findActiveZones` solo `id, name, excluded_postcodes`.
- Pedidos admin alta/edición (`order.domain.ts:364-394,581-599`): hoy 4 queries por item → 3 queries totales: productos livianos `WHERE id = ANY($1)`, tiers por pares con `unnest($1::uuid[], $2::uuid[])` (ya existe en `cart.repository.ts:26-38`), listas de precio `ANY($1)`.
- `order_items`: un `INSERT … SELECT FROM unnest(…)` por pedido (`order.repository.ts:388-411,489-509,731-751`). Los triggers por fila siguen funcionando.
- `price-tier.repository.ts:205-244` (bulkConfirm): un `INSERT … SELECT … ON CONFLICT (product_id, min_quantity) DO UPDATE` dentro de `transaction()`.
- Reordenar categorías e imágenes: un `UPDATE … FROM unnest WITH ORDINALITY` (patrón `banner.repository.ts:345-353`) en `category.repository.ts:217-222`, `product-image.repository.ts:143-150`.
- Lecturas redundantes: `order.domain.ts:74/80` y `:207` (pedido leído dos veces), `product.service.ts:134-152` (chequeo de existencia con query pesada → `EXISTS` liviano), `category.service.ts:16-23` (hijos con `WHERE parent_id = $1`).
- Estadísticas en una sola query con `FILTER`: `user.repository.ts:415-435`, `order.domain.ts:665-670`.
- `COUNT(*)` como chequeo de existencia → `SELECT EXISTS(…)` (product, category, brand, order, address, price-list repositories).
- `address.repository.ts:115-120,165-170`: agregar `AND is_default = true` al UPDATE que limpia defaults (§8, evita reescribir todas las filas).

**3.6 Pool** (`infrastructure/database/client.ts:29-44`)

- Agregar `statement_timeout`, `idle_in_transaction_session_timeout`, `application_name`. Quitar log por conexión. Borrar `databaseConfig` muerto (`config/database.ts`).

## Fase 4 — Keyset en listados admin (rama `feature/keyset-pagination`)

**Backend**

- Nuevo helper `apps/api/src/shared/utils/keyset.ts`: codifica/decodifica cursor (base64url de valores de orden + `id`) y arma el predicado con row values `(col, id) < ($n, $m)` (§7). Pedir `limit + 1` para calcular `hasMore`.
- Respuesta: `pagination: { limit, hasMore, cursor }` vía `ApiResponseBuilder.paginated` (`shared/utils/api-response.ts`, ya declara `cursor`).
- Compatibilidad: si llega `page` sin `cursor`, sigue el camino OFFSET actual (pickers, impresión del día).
- Endpoints: `/products` (admin), `/orders/admin/all`, `/users`, `/brands`, `/price-lists`, `/users/merge-suggestions`.
  - Pedidos: `total` solo en la primera página (sin cursor) para el contador "N pedidos".
  - Órdenes no expresables con índice (stock disponible calculado, `contact_status=missing` con `MAX(orders.created_at) NULLS LAST`): siguen con OFFSET.
  - Duplicados: keyset sobre el resultado del CTE; no baja el costo del cálculo, sí elimina saltos al descartar/fusionar (hoy recarga página 1).
- Unificar envoltorio de marcas y listas de precio (`pagination` al nivel superior, hoy anidado en `data`).

**Frontend**

- Nuevo hook `apps/web/src/hooks/use-infinite-list.ts` (cursor + IntersectionObserver + guard de respuestas viejas) que reemplaza el bloque copiado en 6 páginas: `admin/productos`, `admin/pedidos`, `admin/usuarios`, `admin/marcas`, `admin/listas-de-precio`, `admin/usuarios/duplicados`.
- Servicios en `lib/services/*.service.ts` pasan `cursor` en vez de `page`; tipos en `lib/api.ts:11-18`.
- Marcas y listas de precio: búsqueda del `DataTable` pasa a servidor (`onSearch`), hoy filtra solo filas cargadas.

## Fase 5 — Frontend: round-trips y payload (rama `feature/web-fetch-efficiency`)

- **Catálogo**: eliminar fetch duplicado al entrar con `?category_id`/`?brand_id` (`components/product/products-browser.tsx:64-71,113-120`): inicializar el store desde los params del servidor. Sincronizar `?search` y página con la URL. `AbortController` en fetch de catálogo y autocomplete; autocomplete desde 2 caracteres (`components/layout/search-bar.tsx:26-59`).
- **Filtros**: categorías y marcas se cargan una vez en el Server Component de `/productos` y se pasan por props (hoy se piden en cada montaje, incluido el sheet mobile). Fetch con `next: { tags, revalidate: 300 }` usando `lib/cache-tags.ts` y la ruta de revalidación existente.
- **Marcas truncadas**: `getBrands()` pide `is_active=true&limit=100` explícito (`lib/services/brands.service.ts:10`).
- **Pedidos de cuenta**: `/orders/me` con filtro `status` en servidor y "cargar más"; contadores desde el endpoint de resumen existente (`getUserOrderSummary`) en vez de calcular sobre los primeros 20 (`cuenta/page.tsx:60-83`, `cuenta/pedidos/page.tsx:50-89`).
- **Usuarios admin**: lista pide solo la dirección default (nuevo modo en `include_addresses`), no todas.
- **Carrito**: debounce de `PUT /cart/items/:id` en input de cantidad (`components/cart/cart-item.tsx:33-41`) reusando `useDebouncedCallback` de `hooks/use-debounce.ts`.
- **Edición de producto**: `price-tiers-section.tsx:39-42` usa `priceTiers` que ya viene en `/products/:id`.
- **Pickers de producto** (`admin/pedidos/nuevo`, `editar`, `banner-link-picker`): `fields=basic` + guard de respuestas viejas.

---

## Verificación

- Por fase: `bun typecheck`, `bun lint`, `bun test`. Tests nuevos para `keyset.ts` (encode/decode, predicado, `hasMore`) y para rangos de fecha.
- Migraciones: `bun db:migrate` en local; revisar `schema_migrations`.
- Planes: repetir los `EXPLAIN (ANALYZE, BUFFERS)` de Fase 0 y comparar — sin `Seq Scan` en login y búsqueda de productos, sin nodo `Sort` en listados de pedidos por `created_at`, `Rows Removed by Filter` bajo, precio efectivo con un solo SubPlan/LATERAL.
- Round-trips: `DEBUG_SQL=true` y contar queries por request en alta de pedido admin (antes 4×items), cotización de envío (antes 1+N) y detalle de pedido.
- Fase 1: en local, pedido con `bundle_size_snapshot > 1` → confirmar pago → `stock` y `reserved_stock` bajan por `real_quantity`; cancelar → vuelve exacto. Pedido admin con bundle → `subtotal` = total real.
- UI manual (mobile primero): catálogo con filtros, orden y búsqueda (una sola request a `/catalog/products` por cambio, pestaña Network); scroll infinito en los 6 listados admin sin duplicados ni saltos; contador de pedidos; cuenta con más de 20 pedidos; carrito cambiando cantidad rápido.
