# Andreani Integration — PR-A (Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins can create an Andreani shipment (pre-envío + PDF label) for any order, cancel it, and a polling job keeps shipment + order status updated; customers and admins see tracking and an event timeline.

**Architecture:** Fetch-based Andreani client (`http` / in-process `mock`, chosen by `ANDREANI_MODE`) in `infrastructure/external/andreani`; new `modules/shipments` (pure packages/mapper/event-mapping + repository + domain + admin routes); shipment status is always _derived_ from the full stored event history; order status only moves forward via `advanceOrderTo` using compare-and-swap updates. node-cron job polls Andreani; optional push webhook reuses the same ingestion.

**Tech Stack:** Express 5, TypeScript, pg (raw SQL), Zod 4, node-cron 4, libphonenumber-js, Vitest 4 (real DB), Next.js 16 client components, shadcn/ui, sonner.

**Spec:** `docs/superpowers/specs/2026-11-21-andreani-integration-design.md` (PR-B checkout and PR-C emails get their own plans after PR-A merges).

## Global Constraints

- Branch `feature/andreani-integration`. Never commit to `develop`/`main`. Conventional commits. Every commit message ends with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_0143216qCPP9hbRMRLUtvmAj`
- Before each commit: `git diff --staged` — no secrets; `.env.example` placeholders only.
- Never edit an existing migration. New migration = `053_create_shipments.sql`, header `-- Migration / -- Description / -- Created: 2026-11-21`, commented rollback at the end, `ENABLE ROW LEVEL SECURITY` on new tables, FKs to `orders` with `ON DELETE CASCADE`.
- DB: snake_case; API responses camelCase (automatic middleware); request bodies/query snake_case.
- No N+1: never `Promise.all(items.map(dbQuery))`; use `JOIN`/`json_agg`/`= ANY($1)`. External Andreani calls inside loops run sequentially.
- Never hold a DB transaction open during an Andreani HTTP call.
- Every async button in the web: local `loading` state, disabled while loading, `Loader2` spinner + label `'Procesando...'`, reset in `finally`, `toast` from `sonner`.
- UI copy in Spanish (Argentina, "vos"). Money format `$1.234,56`.
- Andreani bases: QA `https://apisqa.andreani.com`, PROD `https://apis.andreani.com`. Auth header `x-authorization-token`. Token lifetime 24 h (cache 23 h).
- `ANDREANI_MODE` values exactly `disabled | mock | qa | prod`, default `disabled`; `mock` is refused when `NODE_ENV=production`.
- Declared value goes in `bultos[].valorDeclaradoSinImpuestos` only. Never send `valorDeclaradoConImpuestos` or `valorACobrar` (those enable cash-on-delivery collection).
- Run API tests from `apps/api` with `bunx vitest run <path>`; migrations with `bun run db:migrate` (Supabase pooler may time out on a cold connection — retry once).
- Before coding each task that touches a library API, query Context7 (Express, Zod, node-cron); for web tasks read `apps/web/AGENTS.md` and `apps/web/node_modules/next/dist/docs`.

## Review Focus

1. **Andreani timestamps without offset** (`"2025-10-08T12:19:04.054"`): must be parsed as Argentina time (`-03:00`) the same way every poll, or the same event is stored twice and the timeline duplicates. → Task 6 test `parses offset-less Fecha as -03:00 and dedupes re-ingestion`.
2. **Admin cancels the order while a poll is in flight**: the poll must not resurrect a cancelled order nor overwrite a newer status. → Task 7 test `ingest never moves a cancelled order`.
3. **Products without weight/dimensions, or orders over 50 kg / over 300 bultos**: defaults + warnings, auto-split into B2B bultos, hard error above Andreani's 300-bulto cap. → Task 5 tests.
4. **Customer exposure**: a customer must never receive `adminNotes`, `requestPayload`, `rawResponse`, `errorMessage`, `contract`, nor reach `/api/shipments/*`. → Task 9 test `customer view strips internal fields`, Task 8 route-guard test.
5. **Recipient data edge cases**: no phone / non-Argentine phone / name > 40 chars / no email → request still valid (phone omitted, name truncated, sender email fallback). → Task 5 mapper tests.

---

### Task 1: Migration 053 — shipments schema

**Files:**

- Create: `apps/api/src/infrastructure/database/migrations/053_create_shipments.sql`
- Modify: `apps/api/src/tests/setup.ts` (no change needed if CASCADE works — verify only)
- Test: `apps/api/src/tests/shipments/schema.test.ts`

**Interfaces:**

- Produces tables `shipments`, `shipment_events`; columns `orders.shipping_method`, `orders.pickup_branch`, `orders.recipient_document`, `orders.shipped_at`; carrier row `code='andreani'`; index names `idx_shipments_one_active_per_order`, `idx_shipments_next_poll`, `idx_shipment_events_dedupe`.

- [ ] **Step 1: Write the failing test** `schema.test.ts`:
  - `it('orders has shipping columns')`: `information_schema.columns` for `orders` contains `shipping_method` (default `'home_delivery'::character varying`), `pickup_branch`, `recipient_document`, `shipped_at`.
  - `it('andreani carrier exists and is external')`: `SELECT is_external FROM shipping_carriers WHERE code='andreani'` → `true`.
  - `it('allows only one active shipment per order')`: create user + raw order (`createRawOrder`), insert shipment `status='created'`, second insert `status='pending'` rejects with pg code `23505`; insert with `status='cancelled'` succeeds.
  - `it('dedupes events by (shipment, event, occurred_at, reason)')`: two inserts of same tuple with `ON CONFLICT DO NOTHING RETURNING id` → second returns 0 rows; `reason` NULL twice also dedupes.
  - `it('rejects unknown shipment status')`: insert `status='bogus'` → pg code `23514`.
  - `it('deleting the order cascades')`: delete order → shipments/events gone.
- [ ] **Step 2: Run** `bunx vitest run src/tests/shipments/schema.test.ts` → FAIL (relation "shipments" does not exist).
- [ ] **Step 3: Write `053_create_shipments.sql`** per spec "Datos". Exact values:
  - `shipments.status VARCHAR(20) NOT NULL DEFAULT 'requesting'` CHECK in (`requesting, pending, created, rejected, in_transit, out_for_delivery, ready_for_pickup, delivery_failed, delivered, returning, returned, incident, cancelling, cancelled, error, expired`).
  - `service_type VARCHAR(20) NOT NULL` CHECK in (`home_delivery, branch_pickup`); `channel VARCHAR(3)` CHECK in (`B2C, B2B`); `carrier_code VARCHAR(30) NOT NULL DEFAULT 'andreani'`; `poll_failures INTEGER NOT NULL DEFAULT 0`; `packages JSONB NOT NULL DEFAULT '[]'`; `created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL`; remaining columns exactly as spec.
  - `CREATE UNIQUE INDEX idx_shipments_one_active_per_order ON shipments(order_id) WHERE status NOT IN ('cancelled','rejected','error','expired');`
  - `CREATE INDEX idx_shipments_next_poll ON shipments(next_poll_at) WHERE status NOT IN ('delivered','returned','cancelled','rejected','error','expired');`
  - `CREATE INDEX idx_shipments_order_id ON shipments(order_id);` and `idx_shipment_events_shipment ON shipment_events(shipment_id, occurred_at)`.
  - `CREATE UNIQUE INDEX idx_shipment_events_dedupe ON shipment_events(shipment_id, event, occurred_at, COALESCE(reason, ''));`
  - `shipment_events.source VARCHAR(10) NOT NULL` CHECK in (`pull, push, mock`).
  - `orders.shipping_method` CHECK in (`home_delivery, branch_pickup`).
  - Seed: `INSERT INTO shipping_carriers (name, code, is_active, is_external) VALUES ('Andreani','andreani', true, true) ON CONFLICT (code) DO UPDATE SET is_external = true;`
  - RLS on both tables; commented rollback (drop tables, drop columns, delete carrier).
- [ ] **Step 4: Run** `bun run db:migrate` then the test → PASS.
- [ ] **Step 5: Commit** `feat(db): add shipments and shipment_events tables (053)`

---

### Task 2: Order status guard, compare-and-swap and forward-only advance

**Files:**

- Modify: `apps/api/src/modules/orders/order.repository.ts:624-699` (`updateOrderStatus`, `cancelOrder`)
- Modify: `apps/api/src/modules/orders/order.types.ts` (`Order` fields, `VALID_STATUS_TRANSITIONS`, `UpdateOrderStatusOptions`)
- Modify: `apps/api/src/modules/orders/order.domain.ts:188-264` (`updateOrderStatus`, `cancelOrder`, `getOrderById`, `getOrderByNumber`)
- Modify: `apps/api/src/modules/orders/order.routes.ts:158-162`
- Modify: `apps/api/src/modules/payments/payments.controller.ts:233-253`
- Modify: `apps/api/src/infrastructure/jobs/cancel-stale-orders.job.ts`
- Test: `apps/api/src/tests/orders/order.status-guard.test.ts` (new); update `tests/payments/webhook.test.ts`, `tests/orders/cancel-stale-orders.test.ts`

**Interfaces:**

- Produces (repository):
  - `interface UpdateOrderStatusOptions { expectedStatus?: OrderStatus | OrderStatus[]; trackingNumber?: string }`
  - `updateOrderStatusTx(client: PoolClient, orderId: string, data: UpdateOrderStatusInput, changedBy: string | null, opts?: UpdateOrderStatusOptions): Promise<Order | null>` — `null` when 0 rows (missing order or CAS mismatch).
  - `updateOrderStatus(orderId, data, changedBy: string | null, opts?)` — wrapper in `transaction()`.
  - `advanceOrderTo(client: PoolClient, orderId: string, target: 'processing' | 'ready_to_ship' | 'shipped' | 'delivered', note: string, opts?: { trackingNumber?: string }): Promise<Order | null>`
  - `ORDER_FORWARD_PATH: OrderStatus[] = ['payment_confirmed','processing','ready_to_ship','shipped','delivered']`
- Produces (domain): error codes `ORDER_STATUS_CONFLICT` (409), `SHIPMENT_ACTIVE` (409), `ORDER_FORBIDDEN` (403). Hook `assertNoBlockingShipment(orderId)` is a stub returning void until Task 7 wires it (export it from `order.domain.ts`, implemented in Task 7).
- `Order` type gains `shipping_method: 'home_delivery' | 'branch_pickup'`, `pickup_branch: BranchSnapshot | null` (type from Task 5 — declare as `Record<string, unknown> | null` here, narrowed in Task 5), `recipient_document: string | null`, `tracking_number: string | null`, `shipped_at`, `delivered_at`, `cancelled_at: Date | null`.

- [ ] **Step 1: Write failing tests** in `order.status-guard.test.ts` (real DB; build orders with `createTestUser` + raw INSERT helper local to the file):
  - `customer cannot change status` → `orderDomain.updateOrderStatus(id, {status:'payment_confirmed'}, customerId, false)` rejects `{ code: 'ORDER_FORBIDDEN', statusCode: 403 }`.
  - `admin transition still works` → `pending_payment → payment_confirmed` with `isAdmin=true` sets `paid_at` not null and writes history row with `changed_by = adminId`.
  - `CAS mismatch returns null` → `updateOrderStatus(id, {status:'processing'}, null, { expectedStatus: 'pending_payment' })` on a `payment_confirmed` order returns `null`; order unchanged; no history row.
  - `domain maps CAS miss to 409` → two concurrent admin updates `payment_confirmed→processing` via `Promise.allSettled`: exactly one fulfilled, the other rejects `ORDER_STATUS_CONFLICT`.
  - `customer cancel only from pending_payment` → customer `cancelOrder` on `processing` order rejects `ORDER_NOT_CANCELLABLE`; on `pending_payment` succeeds and sets `cancelled_at`.
  - `advanceOrderTo walks the path` → order in `payment_confirmed`, `advanceOrderTo(client, id, 'shipped', 'x', {trackingNumber:'360000000000001'})` → status `shipped`, history has `processing`, `ready_to_ship`, `shipped` (3 rows, `changed_by` NULL), `shipped_at` set, `tracking_number` = `'360000000000001'`.
  - `advanceOrderTo is a no-op backwards or off-path` → order `delivered` + target `shipped` → unchanged; order `cancelled` + target `shipped` → unchanged, returns the order.
  - `transition ready_to_ship → processing allowed` → `VALID_STATUS_TRANSITIONS.ready_to_ship` contains `'processing'`.
  - `route has requireRole` → inspect the router stack for `PATCH /:id/status`: it has 3 handlers after `authMiddleware` (role guard, validate, controller); call the role guard with `req.user.role='customer'` → 403.
- [ ] **Step 2: Run** `bunx vitest run src/tests/orders/order.status-guard.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
  - `updateOrderStatusTx`: `UPDATE orders SET status=$1, updated_at=NOW()`, `+ paid_at = COALESCE(paid_at, NOW())` when status `payment_confirmed`, `shipped_at` when `shipped`, `delivered_at` when `delivered`, `cancelled_at` when `cancelled`; `tracking_number = COALESCE($n, tracking_number)` when `opts.trackingNumber`; `WHERE id=$x AND ($expected::order_status[] IS NULL OR status = ANY($expected))`; history insert only when a row was updated.
  - `advanceOrderTo`: `SELECT status FROM orders WHERE id=$1 FOR UPDATE`; if current not in `ORDER_FORWARD_PATH` or index ≥ target index → return current row; else loop each next status calling `updateOrderStatusTx(..., null, { expectedStatus: previous, trackingNumber })`, note on each step = `note`.
  - Domain `updateOrderStatus`: if `!isAdmin` → 403 `ORDER_FORBIDDEN` before anything; pass `{ expectedStatus: order.status }`; null → 409 `ORDER_STATUS_CONFLICT`; when target is `cancelled` call `assertNoBlockingShipment(orderId)`.
  - Domain `cancelOrder`: non-admin only when `order.status === 'pending_payment'` else 400 `ORDER_NOT_CANCELLABLE`; CAS; `assertNoBlockingShipment`.
  - `getOrderById` / `getOrderByNumber`: when `!isAdmin` delete `admin_notes` from the returned object.
  - Route: `requireRole(['admin','owner'])` before `validate` on `PATCH /:id/status`.
  - Webhook: pass `{ expectedStatus: order.status }` to the first update and `{ expectedStatus: 'payment_confirmed' }` to the auto-processing one; a `null` result logs `warn` and returns 200.
  - Stale job: `{ expectedStatus: 'pending_payment' }`.
  - Add `'processing'` to `VALID_STATUS_TRANSITIONS.ready_to_ship`.
- [ ] **Step 4: Update** `webhook.test.ts` (expect 4th arg `{ expectedStatus: ... }` in `toHaveBeenNthCalledWith`/`toHaveBeenCalledWith`) and `cancel-stale-orders.test.ts` (4th arg `{ expectedStatus: 'pending_payment' }`).
- [ ] **Step 5: Run** `bunx vitest run src/tests/orders src/tests/payments` → PASS.
- [ ] **Step 6: Commit** `fix(orders): admin-only status changes, CAS updates and forward-only advance`

---

### Task 3: Andreani config, types, errors and HTTP client

**Files:**

- Modify: `apps/api/src/env.ts`, `apps/api/.env.example`
- Create: `apps/api/src/infrastructure/external/andreani/{config.ts,types.ts,errors.ts,http-client.ts}`
- Test: `apps/api/src/tests/shipments/andreani-http-client.test.ts`, `apps/api/src/tests/shipments/andreani-config.test.ts`

**Interfaces:**

- Produces `config.ts`:
  - `type AndreaniMode = 'disabled' | 'mock' | 'qa' | 'prod'`
  - `interface AndreaniConfig { mode; baseUrl: string; username: string; password: string; clientCode: string; contracts: { home: string; branch: string; b2b: string }; originBranchId: string; sender: { name: string; email: string; phone: string; docType: string; docNumber: string }; defaults: { itemWeightKg: number; itemVolumeCm3: number }; autoCreate: boolean; pollCron: string; trackingUrlTemplate: string; push: { username: string; password: string }; mockStepSeconds: number }`
  - `getAndreaniConfig(): AndreaniConfig` (reads `env` at call time)
  - `validateAndreaniConfig(cfg: AndreaniConfig, isProduction: boolean): string[]` (list of problems)
- Produces `types.ts` (Andreani wire types, Spanish field names as in spec): `AndreaniQuoteInput { postcode; contract; kilos; volumeCm3; declaredValue }`, `AndreaniQuote { price: number; priceWithoutTax: number; chargeableWeight: number }`, `AndreaniCreateOrderRequest`, `AndreaniOrderResponse { estado; tipo; sucursalDeDistribucion?; fechaCreacion?; fechaEstimadaDeEntrega?; bultos: { numeroDeBulto; numeroDeEnvio; totalizador; linking: { meta; contenido }[] }[]; agrupadorDeBultos?; etiquetasPorAgrupador? }`, `AndreaniCreateOrderResult { httpStatus: 202 | 208; body: AndreaniOrderResponse }`, `AndreaniTraceEvent { Fecha; Ciclo; Evento; Motivo?; Submotivo?; Estado?; Sucursal?; SucursalId?; Comentario? }`, `AndreaniCancellationStatus { state: string; razon?: string }`, `AndreaniBranch` (fields from spec "Sucursales"), `AndreaniLocality { idDeProvLocalidad: number; localidad: string; provincia: string; codigosPostales: string[] }`, and
  - `interface AndreaniClient { quote(i: AndreaniQuoteInput): Promise<AndreaniQuote>; createOrder(body: AndreaniCreateOrderRequest): Promise<AndreaniCreateOrderResult>; getOrder(numero: string): Promise<AndreaniOrderResponse>; getLabel(id: string, format?: 'pdf' | 'zpl'): Promise<{ contentType: string; data: Buffer }>; getTraces(numero: string): Promise<AndreaniTraceEvent[]>; cancelShipment(i: { contract: string; trackingNumber: string }): Promise<void>; getCancellation(trackingNumber: string): Promise<AndreaniCancellationStatus>; listBranches(): Promise<AndreaniBranch[]>; listLocalities(postcode: string): Promise<AndreaniLocality[]> }`
- Produces `errors.ts`: `type AndreaniErrorCode = 'TIMEOUT' | 'AUTH' | 'VALIDATION' | 'NOT_FOUND' | 'UPSTREAM' | 'NETWORK'`; `class AndreaniError extends Error { code; status: number | null; fieldErrors: { field: string; message: string }[] }`; `isRetryable(e: unknown): boolean` (TIMEOUT, UPSTREAM, NETWORK → true).
- Produces `http-client.ts`: `createHttpAndreaniClient(cfg: AndreaniConfig, fetchImpl = fetch): AndreaniClient`.

- [ ] **Step 1: Write failing tests** (`vi.stubGlobal('fetch')` is not needed — inject `fetchImpl`):
  - `logs in with Basic auth and reads token from header` → first call `GET {base}/login` with `Authorization: Basic base64('u:p')`; response header `x-authorization-token: T1`; next request sends `x-authorization-token: T1`.
  - `falls back to body token` → login body `{ "token": "T2" }`, no header → uses `T2`.
  - `caches token and logs in once for concurrent calls` → 3 parallel `getTraces` → exactly 1 login call.
  - `re-logins once on 401` → API 401 then 200 → 2 logins, result returned; 401 twice → `AndreaniError{code:'AUTH'}`.
  - `maps 400 to VALIDATION with fieldErrors` → body `{"title":"Error de validación","detail":"El contrato es incorrecto.","status":400,"errors":[{"field":"contrato","message":"El contrato es incorrecto."}]}` → `code 'VALIDATION'`, `fieldErrors[0].field === 'contrato'`, message contains `'El contrato es incorrecto.'`.
  - `times out quotes at 8s` → fetchImpl honoring `signal` that never resolves; `vi.useFakeTimers()`; advance 8000 ms → `code 'TIMEOUT'`.
  - `quote builds bracket params and parses tarifaConIva.total` → URL has `cpDestino=1406`, `contrato=C1`, `cliente=CL`, `sucursalOrigen=15`, `bultos%5B0%5D%5Bvolumen%5D=12000`, `bultos%5B0%5D%5Bkilos%5D=3.5`, `bultos%5B0%5D%5BvalorDeclarado%5D=10000`; response from spec (`"total":"7041.21"`) → `price === 7041.21`, `priceWithoutTax === 5819.18`, `chargeableWeight === 70`. Non-numeric total → `UPSTREAM`.
  - `createOrder returns 202 and 208` → status 208 → `{ httpStatus: 208 }`; 201 → normalized to 202.
  - `getLabel sends Accept and returns Buffer` → `Accept: application/pdf`; zpl → `application/zpl`.
  - `cancelShipment posts nueva-accion body` → body `{"accion":"cancelacion","datos":{"contrato":"C1","numeroAndreani":["360000000000001"]}}`.
  - `listBranches and listLocalities do not log in` → no `/login` call; URLs `/v2/sucursales?canal=B2C`, `/v1/localidades?codigosPostales=1406`.
  - Config tests: `validateAndreaniConfig` → `mock` + production → problem containing `'mock'`; `qa` without `ANDREANI_USERNAME` → problem containing `'ANDREANI_USERNAME'`; `disabled` → `[]`. `baseUrl` defaults: qa → `https://apisqa.andreani.com`, prod → `https://apis.andreani.com`, override via `ANDREANI_BASE_URL`.
- [ ] **Step 2: Run** `bunx vitest run src/tests/shipments/andreani-http-client.test.ts src/tests/shipments/andreani-config.test.ts` → FAIL.
- [ ] **Step 3: Implement.** env vars per spec list plus `ANDREANI_MOCK_STEP_SECONDS` (default 60); defaults: `ANDREANI_DEFAULT_ITEM_WEIGHT_KG=0.5`, `ANDREANI_DEFAULT_ITEM_VOLUME_CM3=1000`, `ANDREANI_POLL_CRON='*/15 * * * *'`, `ANDREANI_TRACKING_URL_TEMPLATE=''` (empty = no public link; `{tracking}` placeholder). Timeouts: 8000 ms quote, 15000 ms others (`AbortSignal.timeout`). Fetch rejections that are not aborts → `NETWORK`. In-flight login promise shared. Token TTL 23 h.
- [ ] **Step 4: Run tests** → PASS. Add all new vars to `.env.example` with placeholders and one-line comments.
- [ ] **Step 5: Commit** `feat(andreani): config, wire types and HTTP client with token cache`

---

### Task 4: Mock client, client selector, branches and localities

**Files:**

- Create: `apps/api/src/infrastructure/external/andreani/{mock-client.ts,index.ts,branches.ts,localities.ts}`
- Test: `apps/api/src/tests/shipments/andreani-mock-client.test.ts`, `apps/api/src/tests/shipments/andreani-branches.test.ts`

**Interfaces:**

- Consumes: `AndreaniClient`, `AndreaniConfig`, `createHttpAndreaniClient` (Task 3).
- Produces:
  - `index.ts`: `getAndreaniClient(): AndreaniClient` (memoized per mode; throws `AndreaniError('UPSTREAM','Andreani deshabilitado')` when `disabled`), `isAndreaniEnabled(): boolean`, `resetAndreaniClientForTests(): void`.
  - `mock-client.ts`: `createMockAndreaniClient(opts: { stepSeconds: number; now?: () => number }): AndreaniClient`.
  - `branches.ts`: `interface BranchSnapshot { id: string; number: string; code: string; name: string; address: string; postcode: string; city: string; province: string; hours: string | null }`; `toBranchSnapshot(b: AndreaniBranch): BranchSnapshot`; `findPickupBranches(postcode: string, limit?: number): Promise<BranchSnapshot[]>`; `findBranchById(id: string): Promise<BranchSnapshot | null>`; `clearBranchCache(): void`.
  - `localities.ts`: `resolveLocalidad(postcode: string, city: string): Promise<{ localidad: string | null; candidates: string[] }>`; `normalizePlaceName(s: string): string`; `clearLocalityCache(): void`.

- [ ] **Step 1: Write failing tests.**
  - Mock: `quote price is deterministic` → `kilos: 2` → `price === 3000 + 2 * 850` (= 4700). `createOrder returns 202 then 208 for same idPedido`; `numeroDeEnvio` matches `/^36\d{13}$/`; `agrupadorDeBultos` starts with `'MOCK'`. `traces progress with time` → with `now` stub: at t0 only `OrdenDeEnvioCreada`; after `stepSeconds*5` home delivery includes `Admision, EnvioDespachado, RecepcionEnSucursalDestino, Distribucion, EnvioEntregado` in that order; when request had `destino.sucursal` the 4th step is `ComienzoCustodiaEnSucursal` and final `EnvioEntregado` has `Motivo: 'Entregado'`. `getLabel` returns Buffer starting with `%PDF`. `getCancellation` → `state: 'Aceptado'` after `cancelShipment`. `listBranches` returns ≥ 3 branches with `codigosPostalesAtendidos`.
  - Branches (mock `getAndreaniClient` via `vi.mock('../../infrastructure/external/andreani/index.js')`): `filters by codigosPostalesAtendidos`, `excludes entregaEnvios=false and canal B2B`, `falls back to nearest postcode when none serve the CP`, `respects limit`, `caches the list for 12h` (2 calls → `listBranches` called once), `findBranchById('10015')` returns snapshot with `name 'FLORES (AV JUAN B ALBERDI)'`, `address 'Av. Juan B. Alberdi 3138'` (trimmed), `postcode '1406'`.
  - Localities: `matches city ignoring case/accents` (`'Tigre'` vs `'TIGRE'`); `single candidate wins`; `ambiguous returns candidates`; `no data → { localidad: null, candidates: [] }`; `normalizePlaceName('  Río  Cuarto ') === 'RIO CUARTO'`.
- [ ] **Step 2: Run** both test files → FAIL.
- [ ] **Step 3: Implement.** Mock keeps an in-memory `Map<numero, { createdAt, serviceType }>` (unknown numero → treated as created now). Scripted events, one per `stepSeconds`: home `[OrdenDeEnvioCreada, Admision, EnvioDespachado, RecepcionEnSucursalDestino, Distribucion, EnvioEntregado(Motivo 'Entregado')]`; branch `[OrdenDeEnvioCreada, Admision, EnvioDespachado, RecepcionEnSucursalDestino, ComienzoCustodiaEnSucursal, EnvioEntregado(Motivo 'Entregado')]`; `Ciclo: 'Distribution'`; `Fecha` without offset (AR local time, mirrors real API). Label: hard-coded minimal one-page PDF string containing `Etiqueta MOCK {numero}`. Branch caches: 12 h; locality cache per CP: 24 h.
- [ ] **Step 4: Run tests** → PASS.
- [ ] **Step 5: Commit** `feat(andreani): mock client, branches and localities helpers`

---

### Task 5: Pure shipment logic — packages, contract choice, request mapper

**Files:**

- Create: `apps/api/src/modules/shipments/{shipment.types.ts,packages.ts,request-mapper.ts}`
- Test: `apps/api/src/tests/shipments/packages.test.ts`, `apps/api/src/tests/shipments/request-mapper.test.ts`

**Interfaces:**

- Consumes: `AndreaniCreateOrderRequest` (Task 3), `BranchSnapshot` (Task 4).
- Produces `shipment.types.ts`:
  - `type ShipmentStatus = 'requesting' | 'pending' | 'created' | 'rejected' | 'in_transit' | 'out_for_delivery' | 'ready_for_pickup' | 'delivery_failed' | 'delivered' | 'returning' | 'returned' | 'incident' | 'cancelling' | 'cancelled' | 'error' | 'expired'`
  - `type ServiceType = 'home_delivery' | 'branch_pickup'`; `type ShipmentChannel = 'B2C' | 'B2B'`
  - `interface ShipmentPackage { kilos: number; volumeCm3: number; largoCm?: number; anchoCm?: number; altoCm?: number; declaredValue: number }`
  - `interface PackageLine { productId: string; productName: string; realQuantity: number; weightKg: number | null; widthCm: number | null; lengthCm: number | null; heightCm: number | null }`
  - `interface Shipment` (one field per `shipments` column, snake_case, JSONB typed: `destination_branch: BranchSnapshot | null`, `packages: ShipmentPackage[]`), `interface ShipmentEventRow` (per `shipment_events` column) and `type ShipmentWithEvents = Shipment & { events: ShipmentEventRow[] }`.
  - `TERMINAL_SHIPMENT_STATUSES`, `INACTIVE_SHIPMENT_STATUSES = ['cancelled','rejected','error','expired']`, `BLOCKING_SHIPMENT_STATUSES = ['requesting','pending','created','in_transit','out_for_delivery','ready_for_pickup','delivery_failed','cancelling']`.
- Produces `packages.ts`:
  - `MAX_B2C_KG = 50`, `MAX_BULTOS = 300`
  - `computePackages(lines: PackageLine[], subtotal: number, defaults: { itemWeightKg: number; itemVolumeCm3: number }): { packages: ShipmentPackage[]; totalKg: number; totalVolumeCm3: number; channel: ShipmentChannel; warnings: string[] }`
  - `channelFor(packages: ShipmentPackage[]): ShipmentChannel`
  - `pickContract(serviceType: ServiceType, channel: ShipmentChannel, contracts: AndreaniConfig['contracts']): string` (throws `AppError`)
- Produces `request-mapper.ts`:
  - `interface CreateOrderRequestContext { shipmentId: string; orderNumber: string; contract: string; channel: ShipmentChannel; serviceType: ServiceType; originBranchId: string; sender: AndreaniConfig['sender']; recipient: { fullName: string; email: string | null; phone: string | null; document: string | null }; address: { street: string; number: string; floor: string | null; apartment: string | null; postcode: string; localidad: string } | null; destinationBranch: BranchSnapshot | null; packages: ShipmentPackage[] }`
  - `buildCreateOrderRequest(ctx: CreateOrderRequestContext): AndreaniCreateOrderRequest`
  - `toAndreaniPhone(e164: string | null): string | null` (national significant number, digits only, ≤ 15; null for unparseable or non-AR)
  - `remitoNumberFor(orderNumber: string): string` (last 12 digits of the order number's digits + `'R'`, left-padded with `0`)

- [ ] **Step 1: Write failing tests.**
  - packages: `uses product weight × realQuantity` (2 lines: 1.2 kg × 3 + 0.5 kg × 2 → `totalKg 4.6`); `volume uses l×w×h when all dims present else default` (10×20×30 × 2 = 12000 + default 1000 × 1 → 13000); `warns per product missing weight or dims` (warning strings contain the product name); `single package B2C when ≤ 50 kg`; `splits into ceil(kg/50) equal packages and B2B when > 50 kg` (120 kg → 3 packages of 40 kg, volumes split equally, `declaredValue` split equally and summing to subtotal ±0.01); `throws ANDREANI_TOO_MANY_BULTOS above 300 bultos`; `zero lines throws SHIPMENT_NO_ITEMS`.
  - pickContract: `home B2C → contracts.home`; `branch B2C → contracts.branch`; `B2B home → contracts.b2b`; `B2B branch → ANDREANI_B2B_BRANCH_UNSUPPORTED`; `B2B without b2b contract → ANDREANI_B2B_NOT_CONFIGURED`; `branch without contract → ANDREANI_BRANCH_NOT_CONFIGURED`.
  - mapper: `origin is sucursal id from config` (`origen: { sucursal: { id: '15' } }`, no `origen.postal`); `home destination uses postal with localidad` (`destino.postal.codigoPostal`, `calle`, `numero`, `piso`, `departamento`, `localidad`); `branch destination uses sucursal id` and no `destino.postal`; `declared value only in valorDeclaradoSinImpuestos` (`valorDeclaradoConImpuestos`, `valorACobrar` absent); `idPedido is shipmentId and referencias carry idCliente=orderNumber`; `B2B adds remito.numeroRemito` (`remitoNumberFor('VLP-20261121-000123') === '261121000123R'`); `B2C has no remito`; `recipient phone omitted when null or non-AR` (`toAndreaniPhone('+5491122334455') === '1122334455'`, `toAndreaniPhone('+14155552671') === null`); `names truncated to 40 chars`; `email falls back to sender email`; `document sets documentoTipo 'DNI' and documentoNumero`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Round kilos to 3 decimals, volume to integer cm³, money to 2 decimals. Telephone types: destinatario `tipo: 2` (Celular), remitente `tipo: 1` — mark `// TODO(smoke): confirm phone type codes` (spec tables disagree). Contract/branch/sucursal id usage `// TODO(smoke): confirm sucursal.id vs numero`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(shipments): package computation, contract choice and Andreani request mapper`

---

### Task 6: Event normalization and status derivation (pure)

**Files:**

- Create: `apps/api/src/modules/shipments/event-mapping.ts`
- Test: `apps/api/src/tests/shipments/event-mapping.test.ts`

**Interfaces:**

- Consumes: `AndreaniTraceEvent` (Task 3), `ShipmentStatus`, `ServiceType` (Task 5).
- Produces:
  - `interface ShipmentEventInput { occurredAt: Date; cycle: string | null; event: string; reason: string | null; subReason: string | null; statusLabel: string | null; branchName: string | null; branchId: string | null; comment: string | null; raw: unknown }`
  - `parseAndreaniDate(s: string): Date` (no offset → `-03:00`)
  - `traceToEventInput(t: AndreaniTraceEvent): ShipmentEventInput`
  - `pushToEventInput(p: { IdCliente?: string; NumeroDeEnvio: string; Contrato?: string; Estado: string; FechaEstado: string; Motivo?: string; SubMotivo?: string; Ciclo?: string }): ShipmentEventInput`
  - `mapEvent(e: Pick<ShipmentEventInput, 'event' | 'cycle' | 'reason'>, serviceType: ServiceType): ShipmentStatus | null`
  - `deriveShipmentStatus(events: Pick<ShipmentEventInput, 'event' | 'cycle' | 'reason' | 'occurredAt'>[], serviceType: ServiceType, fallback: ShipmentStatus): ShipmentStatus`
  - `orderTargetFor(status: ShipmentStatus): 'ready_to_ship' | 'shipped' | 'delivered' | null`

- [ ] **Step 1: Write failing tests** — one `it.each` row per line of the spec table "Mapeo eventos Andreani → estado envío → estado pedido", e.g. `['Admision','Distribution',null,'home_delivery','in_transit']`, `['RecepcionEnSucursalDestino','Distribution',null,'branch_pickup','ready_for_pickup']`, `['RecepcionEnSucursalDestino','Distribution',null,'home_delivery','in_transit']`, `['Visita','Distribution','Rehusado','home_delivery','delivery_failed']`, `['Visita','Distribution','Entregado','home_delivery','delivered']`, `['EnvioEntregado','Devolucion',null,'home_delivery','returned']`, `['EnvioNoEntregado','Distribution',null,'home_delivery','returning']`, `['Siniestro','Siniestro',null,'home_delivery','incident']`, `['EnvioAnulado','Distribution',null,'home_delivery','cancelled']`, `['GestionTelefonica','Distribution',null,'home_delivery',null]`, `['OrdenDeEnvioRechazada',null,null,'home_delivery','rejected']`. Cycle comparison case-insensitive (`'DIRECTO'` = main cycle).
  - `deriveShipmentStatus`: sorts by `occurredAt` (out-of-order input gives same result); `delivered` is sticky against later `Distribucion`; a later `Devolucion`-cycle event after `delivery_failed` → `returning`; no mapped events → `fallback`.
  - `parses offset-less Fecha as -03:00` → `parseAndreaniDate('2025-10-08T12:19:04.054').toISOString() === '2025-10-08T15:19:04.054Z'`; with explicit offset respected.
  - `orderTargetFor`: `created → 'ready_to_ship'`; `in_transit`, `out_for_delivery`, `ready_for_pickup`, `delivery_failed`, `returning`, `incident → 'shipped'`; `delivered → 'delivered'`; others → `null`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (table-driven `Record<string, ...>`; main cycles `distribution, directo, resend, reenvio`; return cycles `drop, devolucion, rescate`; sticky set `delivered, returned, cancelled`). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(shipments): Andreani event mapping and status derivation`

---

### Task 7: Shipment repository and event ingestion

**Files:**

- Create: `apps/api/src/modules/shipments/shipment.repository.ts`, `apps/api/src/modules/shipments/shipment-ingest.ts`
- Modify: `apps/api/src/modules/orders/order.domain.ts` (implement `assertNoBlockingShipment`)
- Test: `apps/api/src/tests/shipments/shipment-ingest.test.ts`

**Interfaces:**

- Consumes: `advanceOrderTo`, `updateOrderStatusTx` (Task 2); `ShipmentEventInput`, `deriveShipmentStatus`, `orderTargetFor` (Task 6); `Shipment`, statuses (Task 5).
- Produces (repository, all take `client?: PoolClient` last where used inside transactions):
  - `insertRequesting(input: { orderId; serviceType; contract; channel; packages; destinationBranch; localidad; quotedPrice: number | null; createdBy: string | null }, client: PoolClient): Promise<Shipment>` (maps pg `23505` on `idx_shipments_one_active_per_order` to `AppError('SHIPMENT_ALREADY_EXISTS', ..., 409)`)
  - `insertError(input: { orderId; serviceType; message: string; createdBy: string | null }): Promise<Shipment>`
  - `updateShipment(id: string, patch: Partial<Shipment>, client?: PoolClient): Promise<Shipment>`
  - `findById(id: string, client?: PoolClient, forUpdate?: boolean): Promise<Shipment | null>`
  - `findBlockingByOrderId(orderId: string): Promise<Shipment | null>`
  - `countByOrderId(orderId: string): Promise<number>`
  - `findPackageLinesForOrder(orderId: string): Promise<PackageLine[]>` (one query: `order_items` JOIN `products`)
  - `insertEventsTx(client, shipmentId, events: ShipmentEventInput[], source: 'pull' | 'push' | 'mock'): Promise<ShipmentEventRow[]>` (single multi-row INSERT, `ON CONFLICT DO NOTHING RETURNING *`)
  - `findEvents(shipmentId: string, client?: PoolClient): Promise<ShipmentEventRow[]>`
  - `claimDueForPolling(limit: number, leaseSeconds: number): Promise<Shipment[]>` (pattern of `modules/bot/outbound-webhook.repository.ts:32-63`, sets `next_poll_at = NOW() + lease`)
  - `findByTrackingNumber(n: string): Promise<Shipment | null>`
- Produces (`shipment-ingest.ts`): `ingestEvents(shipmentId: string, events: ShipmentEventInput[], source: 'pull' | 'push' | 'mock'): Promise<{ inserted: number; status: ShipmentStatus }>` and `nextPollDelayMinutes(status: ShipmentStatus): number | null` (`requesting 5, pending 30, created 30, cancelling 15, in_transit/out_for_delivery/delivery_failed/returning/incident 60, ready_for_pickup 360`, terminal → `null`).

- [ ] **Step 1: Write failing tests** (real DB; order from local helper in `payment_confirmed`; shipment inserted `status='created'`, `tracking_number='360000000000001'`, `service_type='home_delivery'`):
  - `inserts events, derives status and advances order` → ingest `[OrdenDeEnvioCreada, Admision]` → `{ inserted: 2, status: 'in_transit' }`; order `shipped`, `shipped_at` set, `orders.tracking_number = '360000000000001'`; history includes `processing`, `ready_to_ship`, `shipped`.
  - `dedupes re-ingestion` → same 2 events again → `inserted: 0`; event count stays 2; history count unchanged.
  - `delivered event sets delivered_at on shipment and order`.
  - `return cycle never marks order delivered` → `[Admision, EnvioNoEntregado, EnvioEntregado(Ciclo 'Devolucion')]` → shipment `returned`, order stays `shipped`.
  - `ingest never moves a cancelled order` → order set to `cancelled` first; ingest `Admision` → shipment `in_transit`, order still `cancelled`.
  - `does not touch cancelled/error/expired shipments' status` → shipment `cancelled`; ingest `Admision` → event stored, status stays `cancelled`.
  - `sets next_poll_at from nextPollDelayMinutes` (in_transit ≈ now + 60 min; delivered → `NULL`).
  - `assertNoBlockingShipment` → with shipment `in_transit`, admin `updateOrderStatus(id,{status:'cancelled'})` rejects `SHIPMENT_ACTIVE`; with shipment `returned` it succeeds.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `ingestEvents` in one `transaction`: `findById(..., client, true)` (lock shipment) → `insertEventsTx` → if nothing inserted return current → `findEvents` → status = sticky check (`cancelled, error, expired` keep) else `deriveShipmentStatus(events, service_type, current)` → `updateShipment` (`status`, `last_event`, `last_event_at`, `andreani_state` = last event `statusLabel`, `delivered_at` when delivered, `next_poll_at`) → `target = orderTargetFor(status)` → `advanceOrderTo(client, order_id, target, 'Andreani: ' + lastEvent.event, { trackingNumber })` when target. Lock order: shipment first, then order.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(shipments): repository and source-agnostic event ingestion`

---

### Task 8: Shipment domain, admin routes and swagger

**Files:**

- Create: `apps/api/src/modules/shipments/{shipment.domain.ts,shipment.validators.ts,shipment.controller.ts,shipment.routes.ts}`
- Modify: `apps/api/src/server.ts` (mount `/api/shipments`), `apps/api/src/config/swagger.ts` (tag `Shipments`)
- Test: `apps/api/src/tests/shipments/shipment.domain.test.ts`, `apps/api/src/tests/shipments/shipment.routes.test.ts`

**Interfaces:**

- Consumes: Tasks 3–7 (`getAndreaniClient`, `getAndreaniConfig`, `findPickupBranches`, `findBranchById`, `resolveLocalidad`, `computePackages`, `channelFor`, `pickContract`, `buildCreateOrderRequest`, repository, `ingestEvents`, `traceToEventInput`, `isRetryable`).
- Produces (domain):
  - `interface ShipmentPreview { serviceType: ServiceType; destinationBranch: BranchSnapshot | null; packages: ShipmentPackage[]; totalKg: number; totalVolumeCm3: number; channel: ShipmentChannel; contract: string | null; contractError: string | null; localidad: { resolved: string | null; candidates: string[] }; recipient: { fullName: string; email: string | null; phone: string | null; document: string | null }; warnings: string[]; canCreate: boolean; blockReason: string | null }`
  - `previewForOrder(orderId: string): Promise<ShipmentPreview>`
  - `interface CreateShipmentInput { serviceType: ServiceType; branchId?: string; packages?: ShipmentPackage[]; localidad?: string }`
  - `createForOrder(orderId: string, input: CreateShipmentInput, actorId: string | null): Promise<Shipment>`
  - `applyCreateResult(shipmentId: string, result: AndreaniCreateOrderResult): Promise<Shipment>` (also used by the job's re-POST)
  - `cancelShipment(shipmentId: string): Promise<Shipment>`
  - `refreshShipment(shipmentId: string): Promise<Shipment>` (same per-status logic the job uses: `pollShipment(shipment)` exported for Task 10)
  - `pollShipment(s: Shipment): Promise<Shipment>`
  - `getLabel(shipmentId: string): Promise<{ contentType: string; data: Buffer; filename: string }>`
  - `listPickupBranches(postcode: string, limit: number): Promise<BranchSnapshot[]>`
- Produces (routes, mounted at `/api/shipments`, every route `authMiddleware` + `requireRole(['admin','owner'])`):
  - `GET /orders/:orderId/preview` → `ShipmentPreview`
  - `POST /orders/:orderId` body `{ service_type, branch_id?, localidad?, packages?: [{ kilos, volume_cm3, largo_cm?, ancho_cm?, alto_cm? }] }` → 201 `Shipment` (202 when status `requesting`)
  - `POST /:id/cancel`, `POST /:id/refresh` → `Shipment`
  - `GET /:id/label` → PDF (`Content-Disposition: inline; filename="etiqueta-{orderNumber}.pdf"`)
  - `GET /branches?postcode=&limit=` → `ApiResponse.paginated(branches, { limit, hasMore: false })` (limit max 50, default 20)

- [ ] **Step 1: Write failing tests** (`vi.mock('../../infrastructure/external/andreani/index.js')` returning a controllable fake `AndreaniClient`; env mocked via hoisted object as in `tests/shared/web-revalidation.test.ts`):
  - `creates shipment for a processing web order` → client `createOrder` returns 202 with spec B2C response (`numeroDeEnvio '360000101651699'`, `agrupadorDeBultos 'API0000000428931'`, `estado 'Pendiente'`) → shipment `status 'pending'`, `tracking_number`, `group_number`, `label_url = etiquetasPorAgrupador`, `request_payload.idPedido === shipment.id`; order `ready_to_ship`; order `shipping_cost` and `shipping_carrier_id` unchanged.
  - `estado 'Creada' in response → status 'created'`.
  - `works for an admin-created order without carrier` (`ADM-` number, `shipping_carrier_id NULL`).
  - `rejects pending_payment orders` → `SHIPMENT_ORDER_NOT_READY` (409).
  - `home delivery without address` → `ORDER_ADDRESS_REQUIRED` (422); branch pickup on same order succeeds.
  - `duplicate create → SHIPMENT_ALREADY_EXISTS (409)`.
  - `400 from Andreani → error row and 422 ANDREANI_VALIDATION with field messages; retry succeeds afterwards`.
  - `timeout → row stays requesting, returns it (no throw)`; then `applyCreateResult(id, { httpStatus: 208, body })` resolves it to `pending`.
  - `localidad unresolved and no override → SHIPMENT_LOCALIDAD_REQUIRED (422) with candidates in details`.
  - `cancel → status cancelling and client.cancelShipment called with { contract, trackingNumber }`; `refresh on cancelling with state 'Aceptado' → cancelled, cancelled_at set, order back to processing`; `state 'Rechazado' → status re-derived and error_message 'Cancelación rechazada: <razon>'`.
  - `cancel after physical admission (in_transit) → SHIPMENT_NOT_CANCELLABLE (409)`.
  - `refresh pending → getOrder 'Creada' → created; 'Rechazada' → rejected and order back to processing`.
  - `refresh created → getTraces → ingestEvents called with source 'pull'`.
  - `getLabel on requesting shipment → SHIPMENT_LABEL_NOT_READY (409)`; on created → uses `group_number` else `tracking_number`.
  - `preview` → for an order whose product lacks weight: `warnings.length > 0`, `canCreate true`; with `ANDREANI_MODE='disabled'` → `canCreate false`, `blockReason` mentions deshabilitado.
  - Routes test: customer request to each handler's role guard → 403; validator rejects `service_type: 'drone'` and `packages[0].kilos: 0`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** `createForOrder` flow: load order (`findOrderById`), status in `payment_confirmed | processing | ready_to_ship` else 409; `assert isAndreaniEnabled()` else 503 `ANDREANI_DISABLED`; resolve branch (`findBranchById`, 422 `SHIPMENT_BRANCH_INVALID`) or address+localidad; packages = input (with `declaredValue` = subtotal split) or `computePackages`; `channelFor` → `pickContract`; tx1 `insertRequesting`; build request; `updateShipment(request_payload)`; HTTP call outside tx; success → `applyCreateResult` (tx2: update shipment; status `created` if `estado` starts with `Cread` else `pending`; `advanceOrderTo(client, orderId, 'ready_to_ship', 'Envío Andreani generado (<tracking>)')`); `AndreaniError` VALIDATION/AUTH/NOT_FOUND → `updateShipment(status 'error', error_message)` + throw `AppError('ANDREANI_VALIDATION', detail, 422, fieldErrors)`; retryable → leave `requesting`, `next_poll_at = now + 5 min`, return shipment. Cancellable only in `pending | created`. Customer-safe mapping is Task 9.
- [ ] **Step 4: Run** → PASS. Add `@swagger` JSDoc blocks on every route (tag `Shipments`).
- [ ] **Step 5: Commit** `feat(shipments): admin create/cancel/refresh/label endpoints`

---

### Task 9: Shipments inside order details and lists

**Files:**

- Modify: `apps/api/src/modules/orders/order.repository.ts` (`findOrderWithDetails`, `findOrders`)
- Modify: `apps/api/src/modules/orders/order.types.ts` (`OrderWithDetails.shipments`, `Order.active_shipment`)
- Modify: `apps/api/src/modules/orders/order.domain.ts` (`getOrderById`, `getOrderByNumber`, `getUserOrders`)
- Create: `apps/api/src/modules/shipments/shipment.view.ts`
- Test: `apps/api/src/tests/shipments/order-shipment-view.test.ts`

**Interfaces:**

- Consumes: `Shipment`, `ShipmentEventRow` (Task 5/7), `getAndreaniConfig().trackingUrlTemplate`.
- Produces:
  - `findOrderWithDetails` adds one query to its existing `Promise.all`: shipments of the order with `COALESCE(json_agg(e ORDER BY e.occurred_at DESC) FILTER (WHERE e.id IS NOT NULL), '[]')` via `LEFT JOIN LATERAL`; result field `shipments: ShipmentWithEvents[]` (newest first).
  - `findOrders` adds `active_shipment: { id, status, tracking_number } | null` via `LEFT JOIN LATERAL (... ORDER BY created_at DESC LIMIT 1)` excluding `INACTIVE_SHIPMENT_STATUSES`.
  - `shipment.view.ts`: `interface CustomerShipmentView { id; service_type; status; tracking_number; tracking_url: string | null; destination_branch; estimated_delivery_at; delivered_at; last_event_at; events: { occurred_at; event; status_label; reason; branch_name }[] }`; `toCustomerShipment(s: ShipmentWithEvents): CustomerShipmentView`; `toAdminShipment(s: ShipmentWithEvents): Omit<ShipmentWithEvents, 'request_payload' | 'raw_response'> & { tracking_url: string | null }` (admin sees every field except the two raw payloads); `trackingUrlFor(n: string | null): string | null` (template `{tracking}` replace; empty template → null).
  - Customer order detail: `shipments` → only those not in `['error','rejected','cancelled','expired','requesting']`, mapped with `toCustomerShipment`.

- [ ] **Step 1: Write failing tests:**
  - `admin detail includes shipments with events newest first` (2 shipments: one `cancelled`, one `in_transit` with 2 events) → `shipments.length === 2`, `shipments[0].events[0].occurred_at` is the latest; `request_payload` absent.
  - `customer view strips internal fields` → customer `getOrderById` → no `admin_notes`; each shipment lacks `contract`, `request_payload`, `raw_response`, `error_message`, `quoted_price`, `packages`; `cancelled` shipment hidden.
  - `tracking_url uses template` → template `'https://example.test/t/{tracking}'` → `'https://example.test/t/360000000000001'`; empty template → `null`.
  - `list returns active_shipment` → admin `findOrders` row for that order has `active_shipment.status === 'in_transit'`; order without shipments → `null`; still exactly 1 query for shipments regardless of row count (assert via no per-row helper — the repo function has no loop).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `bunx vitest run src/tests/shipments src/tests/orders` → PASS.
- [ ] **Step 5: Commit** `feat(orders): expose shipments and tracking in order detail and lists`

---

### Task 10: Tracking job, auto-create on payment, graceful shutdown

**Files:**

- Create: `apps/api/src/infrastructure/jobs/andreani-tracking.job.ts`, `apps/api/src/modules/shipments/shipment-auto.ts`
- Modify: `apps/api/src/modules/payments/payments.controller.ts:243-253`, `apps/api/src/server.ts:176-197`, existing `schedule*` job functions (return `ScheduledTask`)
- Test: `apps/api/src/tests/shipments/andreani-tracking.job.test.ts`, `apps/api/src/tests/shipments/shipment-auto.test.ts`; update `tests/payments/webhook.test.ts`

**Interfaces:**

- Consumes: `claimDueForPolling`, `pollShipment`, `createForOrder`, `insertError`, `countByOrderId` (Tasks 7–8), `getAndreaniConfig`, `isAndreaniEnabled`.
- Produces:
  - `pollAndreaniShipments(opts?: { limit?: number; leaseSeconds?: number }): Promise<{ processed: number; failed: number; expired: number }>`
  - `scheduleAndreaniTracking(): ScheduledTask | null` (null when disabled or invalid cron — validated with `cron.validate`)
  - `tryAutoCreateForOrder(orderId: string): Promise<'created' | 'skipped' | 'failed'>`
  - `findOrdersPendingAutoCreate(limit: number): Promise<string[]>` (in `shipment.repository.ts`: Andreani-carrier orders in `processing`, `paid_at < NOW() - interval '2 minutes'`, zero shipments)
  - All `schedule*` functions return `ScheduledTask` (or array) so `shutdown` can `.stop()` them; `shutdown` also calls `pool.end()` after `server.close`.

- [ ] **Step 1: Write failing tests:**
  - Job: `polls claimed shipments sequentially` (2 claimed → `pollShipment` called twice in order); `a failing shipment increments poll_failures and backs off` → `next_poll_at ≈ now + min(15·2^n, 720) min`; `pre-envío older than 30 days in pending/created without admission → expired`; `no-op when disabled` (claim not called); `runs auto-create backstop only when autoCreate is true`.
  - Auto: `skips when flag off`; `skips non-Andreani carrier`; `skips when order not processing`; `skips when any shipment row exists`; `creates with order.shipping_method and pickup_branch.id`; `on AppError inserts error row with message and created_by null and returns 'failed'`.
  - Webhook test: with flag on, after `payment_confirmed → processing`, `tryAutoCreateForOrder` is scheduled (mock `shipment-auto.js`; flush `setImmediate`); flag off → not called; its rejection does not change the 200 response.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Job: `running` flag; `claimDueForPolling(limit=50, lease=600)`; for each: `try { await pollShipment(s) ; reset poll_failures } catch { poll_failures+1, next_poll_at backoff, log warn }`; then expire sweep (`UPDATE shipments SET status='expired' WHERE status IN ('pending','created') AND created_at < NOW() - interval '30 days' RETURNING id`); then backstop when `autoCreate`. Payments: after the processing update, `if (getAndreaniConfig().autoCreate) setImmediate(() => { void tryAutoCreateForOrder(order.id).catch(err => logger.error(...)) })`. Register `scheduleAndreaniTracking()` in `server.ts` with a log line; keep all returned tasks in an array stopped in `shutdown`.
- [ ] **Step 4: Run** `bunx vitest run src/tests/shipments src/tests/payments` → PASS.
- [ ] **Step 5: Commit** `feat(shipments): tracking poll job, auto-create flag and graceful job shutdown`

---

### Task 11: Optional Andreani push webhook

**Files:**

- Create: `apps/api/src/modules/shipments/andreani-webhook.routes.ts`, `apps/api/src/modules/shipments/andreani-webhook.controller.ts`
- Modify: `apps/api/src/server.ts` (mount `/api/webhooks/andreani`), `apps/api/src/shared/middleware/csrf.middleware.ts:32` (add `'/api/webhooks/andreani'`), `apps/api/src/shared/middleware/rate-limit.middleware.ts` (skip `req.path === '/webhooks/andreani'`)
- Test: `apps/api/src/tests/shipments/andreani-webhook.test.ts`

**Interfaces:**

- Consumes: `pushToEventInput` (Task 6), `findByTrackingNumber`, `ingestEvents` (Task 7), `getAndreaniConfig().push`.
- Produces: `POST /api/webhooks/andreani` — body = Andreani push JSON (`IdCliente, NumeroDeEnvio, Contrato, Estado, FechaEstado, Motivo, SubMotivo, Ciclo`); responses use Andreani's contract `{ message, error, status: 'OK' | 'ERROR' }` with HTTP 200 (OK / unknown shipment) or 401/404.

- [ ] **Step 1: Write failing tests:** `404 when push credentials empty`; `401 on wrong Basic auth` (compared with `timingSafeEqual`, equal-length buffers); `ingests event with source 'push' and returns { status: 'OK' }`; `unknown NumeroDeEnvio → 200 { status: 'ERROR', error: 'Envío desconocido' }` (no retry storm); `isCsrfExempt('/api/webhooks/andreani') === true`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(shipments): optional Andreani push webhook (disabled by default)`

---

### Task 12: Smoke script and documentation

**Files:**

- Create: `apps/api/src/infrastructure/external/andreani/smoke.ts`, `docs/ANDREANI_INTEGRATION.md`
- Modify: `apps/api/package.json` (script `"andreani:smoke": "tsx src/infrastructure/external/andreani/smoke.ts"`), `docs/API_ENDPOINTS.md`, `docs/BOT_API.md`

**Interfaces:**

- Consumes: `createHttpAndreaniClient`, `getAndreaniConfig`, `buildCreateOrderRequest`.

- [ ] **Step 1: Implement `smoke.ts`**: refuses unless mode is `qa`, or `prod` with `--prod` flag; `--public-only` runs only the no-auth steps (branches, localities) and skips `validateAndreaniConfig`; full run validates config first; steps printed with ✅/❌: login (prints whether token came from header or body), `listBranches` count, `listLocalities(ANDREANI_SMOKE_POSTCODE || '1406')`, `quote`, `createOrder` (test recipient, `idPedido = smoke-<timestamp>`), re-POST same body (expect 208 — prints actual), `getOrder`, `getLabel` (writes `./andreani-smoke-label.pdf`), `getTraces`, `cancelShipment` + `getCancellation`. Exits 1 on first failure.
- [ ] **Step 2: Verify public part now:** `ANDREANI_MODE=qa bun run andreani:smoke -- --public-only` lists branches/localities from real QA (no credentials needed). Expected: ✅ for branches and localities.
- [ ] **Step 3: Write `docs/ANDREANI_INTEGRATION.md`**: env vars table, modes, admin flow, status mapping table (copy from spec), polling intervals, push activation steps (what to send Andreani: endpoint URLs QA/prod, Basic credentials, payload format), smoke checklist with the open `TODO(smoke)` items (token header vs body, 208 keyed by `idPedido`, phone type codes, `sucursal.id` vs `numero`, cancellation body), go-live steps (QA UAT → Ciclo 0). Update `API_ENDPOINTS.md` (new routes) and `BOT_API.md` (bot now receives `ready_to_ship`, `shipped`, `delivered` and the backwards `ready_to_ship → processing`).
- [ ] **Step 4: Commit** `docs(andreani): integration guide, smoke script and endpoint docs`

---

### Task 13: Web foundations — blob download, shipments service, labels, types

**Files:**

- Modify: `apps/web/src/lib/api.ts` (add `getBlob`), `apps/web/src/lib/services/orders.service.ts` (types + transitions), `apps/web/src/lib/services/index.ts`
- Create: `apps/web/src/lib/services/shipments.service.ts`, `apps/web/src/lib/shipment-status.ts`, `apps/web/src/components/admin/shipment-status-badge.tsx`
- Modify: every file using the removed statuses (grep `in_transit|payment_failed` in `apps/web/src`)

**Interfaces:**

- Consumes: API routes from Tasks 8–9 (camelCase responses).
- Produces:
  - `getBlob(endpoint: string, options?: FetchOptions): Promise<Blob>` (same credentials/CSRF/401-refresh behaviour as `fetchApi`; extract shared raw-fetch helper)
  - `shipments.service.ts`: types `ShipmentStatus`, `ServiceType`, `BranchSnapshot`, `ShipmentPackage`, `ShipmentEvent`, `Shipment`, `ShipmentPreview` (camelCase mirrors of Tasks 5/8/9); functions `getShipmentPreview(orderId)`, `createShipment(orderId, body: { service_type: ServiceType; branch_id?: string; localidad?: string; packages?: { kilos: number; volume_cm3: number; largo_cm?: number; ancho_cm?: number; alto_cm?: number }[] })`, `cancelShipment(id)`, `refreshShipment(id)`, `downloadShipmentLabel(id): Promise<Blob>`, `getAdminPickupBranches(postcode, limit?)`.
  - `shipment-status.ts`: `SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string>` — `requesting 'Generando envío', pending 'Pre-envío solicitado', created 'Etiqueta lista', rejected 'Rechazado por Andreani', in_transit 'En camino', out_for_delivery 'En distribución', ready_for_pickup 'Listo para retirar en sucursal', delivery_failed 'Visita sin éxito', delivered 'Entregado', returning 'En devolución', returned 'Devuelto', incident 'Incidente', cancelling 'Cancelando', cancelled 'Cancelado', error 'Error', expired 'Vencido'`; `SHIPMENT_ISSUE_STATUSES = ['rejected','delivery_failed','returning','returned','incident','error','expired']`.
  - `ShipmentStatusBadge({ status }: { status: ShipmentStatus })` (issue statuses use destructive/amber variant).
  - `Order` (orders.service) gains `trackingNumber`, `shippedAt`, `deliveredAt`, `shippingMethod`, `pickupBranch`, `statusHistory`, `shipments?: Shipment[]`, `activeShipment?: { id; status; trackingNumber } | null`; `OrderStatus` drops `in_transit` and `payment_failed`; `ORDER_STATUS_TRANSITIONS.ready_to_ship` adds `'processing'`.

- [ ] **Step 1: Implement** the above.
- [ ] **Step 2: Verify** `bun --filter web typecheck` (or `cd apps/web && bunx tsc --noEmit`) → 0 errors; `bun --filter web lint` → 0 errors.
- [ ] **Step 3: Commit** `feat(web): shipments service, status labels and blob downloads`

---

### Task 14: Admin UI — Andreani shipment card and create dialog

**Files:**

- Create: `apps/web/src/components/admin/andreani-shipment-card.tsx`, `apps/web/src/components/admin/create-shipment-dialog.tsx`, `apps/web/src/components/shipments/shipment-timeline.tsx`
- Modify: `apps/web/src/app/admin/pedidos/[id]/page.tsx` (shipping card ~L228-247: use `carrierName`; render card), `apps/web/src/app/admin/pedidos/page.tsx` (column "Envío")

**Interfaces:**

- Consumes: Task 13 service + badge.
- Produces: `AndreaniShipmentCard({ order, onChanged }: { order: Order; onChanged: () => void })`; `CreateShipmentDialog({ orderId, open, onOpenChange, onCreated })`; `ShipmentTimeline({ events, compact? }: { events: ShipmentEvent[]; compact?: boolean })`.

- [ ] **Step 1: Build `ShipmentTimeline`**: vertical list, newest first, date `dd/MM HH:mm` (dayjs, AR), title = `statusLabel ?? event`, subtitle = `reason · branchName`.
- [ ] **Step 2: Build `CreateShipmentDialog`**: on open loads `getShipmentPreview` (skeleton while loading); radio "A domicilio / Retiro en sucursal" (prefilled from preview); when sucursal → branch list from `getAdminPickupBranches(order postcode)`; editable bultos table (kilos, volumen cm³; add/remove rows; recomputes "Canal B2C/B2B" via the same rule as `channelFor`: 1 bulto ≤ 50 kg); localidad select when `candidates.length > 0`, text input when none resolved; warnings list (amber); `blockReason` disables submit. Submit → `createShipment`; `requesting` result → info toast "Andreani no respondió, se reintenta automáticamente"; API error → toast with message and field errors.
- [ ] **Step 3: Build `AndreaniShipmentCard`**: no blocking shipment → button "Crear envío Andreani" (visible when order status ∈ `payment_confirmed | processing | ready_to_ship`); last shipment with `status='error'` shows its `errorMessage` (red) + "Reintentar"; active shipment → badge, tracking number (copy button), link if `trackingUrl`, sucursal destino, buttons "Descargar etiqueta" (`downloadShipmentLabel` → `URL.createObjectURL` → open new tab), "Actualizar tracking", "Cancelar envío" (only `pending|created`, inside `AlertDialog`), and `ShipmentTimeline`. Each button has its own local loading state.
- [ ] **Step 4: Wire pages**: detail page renders the card under "Cambiar Estado" and calls `loadOrder()` on change; list page adds column "Envío" with `ShipmentStatusBadge` + tracking number or "—".
- [ ] **Step 5: Verify** web typecheck + lint pass; then manual check in Task 16.
- [ ] **Step 6: Commit** `feat(web): admin Andreani shipment card, create dialog and timeline`

---

### Task 15: Customer UI — tracking card and order page fixes

**Files:**

- Create: `apps/web/src/components/shipments/shipment-tracking-card.tsx`
- Modify: `apps/web/src/app/(account)/cuenta/pedidos/[id]/page.tsx`, `apps/web/src/app/(account)/cuenta/pedidos/page.tsx`, `apps/web/src/app/(account)/cuenta/page.tsx` (status filter values)

**Interfaces:**

- Consumes: `Order`, `Shipment`, `ShipmentTimeline`, `SHIPMENT_STATUS_LABELS` (Tasks 13–14).
- Produces: `ShipmentTrackingCard({ shipment }: { shipment: Shipment })`.

- [ ] **Step 1: Switch customer pages** from the stale `Order` in `@/types` to `Order` from `@/lib/services/orders.service`; fix `shippingCarrier` → `carrierName`, `shippingAddress.label` → `alias`; status filters use the real backend statuses (`pending_payment, payment_confirmed, processing, ready_to_ship, shipped, delivered, cancelled`).
- [ ] **Step 2: Build `ShipmentTrackingCard`**: friendly status (big), "Nº de seguimiento" + link "Seguir en Andreani" when `trackingUrl`, for `branch_pickup` show sucursal name/address/hours, `estimatedDeliveryAt` when present, `ShipmentTimeline`. Mobile-first layout.
- [ ] **Step 3: Render** the card in order detail when `order.shipments?.[0]` exists, otherwise keep the existing shipping info card; list page shows tracking badge when `activeShipment`.
- [ ] **Step 4: Verify** web typecheck + lint pass.
- [ ] **Step 5: Commit** `feat(web): customer shipment tracking card and order page fixes`

---

### Task 16: End-to-end verification (mock mode)

**Files:** none (fix-ups only if something fails, each with its own commit).

- [ ] **Step 1:** `cd apps/api && bunx vitest run` → all suites PASS (paste summary).
- [ ] **Step 2:** `bun typecheck && bun lint && bun build` at repo root → 0 errors.
- [ ] **Step 3:** Manual E2E with `ANDREANI_MODE=mock`, `ANDREANI_MOCK_STEP_SECONDS=20`, `ANDREANI_ORIGIN_BRANCH_ID=15`, contracts set to dummy values, `bun dev`:
  1. As admin, open a `processing` order → "Crear envío Andreani" → preview shows bultos/warnings → create → badge "Pre-envío solicitado"/"Etiqueta lista", order `Listo para enviar`.
  2. "Descargar etiqueta" opens a PDF.
  3. Wait ~2 min, "Actualizar tracking" → timeline grows; order becomes `Enviado`, later `Entregado`; `tracking_number`, `shipped_at`, `delivered_at` set in DB.
  4. Log in as that customer → `/cuenta/pedidos/:id` shows tracking card + timeline; response JSON has no `adminNotes`/`requestPayload`.
  5. Create another shipment and cancel it before admission → `Cancelado`, order back to `Procesando`.
  6. Branch pickup on an `ADM-` order without address → works; home delivery → clear error.
  7. Set `ANDREANI_AUTO_CREATE_SHIPMENT=true`, pay an order in MP sandbox with an Andreani carrier assigned manually → shipment auto-created within seconds (or by the backstop).
  8. Customer `PATCH /api/orders/:id/status` → 403.
- [ ] **Step 4:** Push branch and open PR-A to `develop` with checklist of the above and the open smoke items.
