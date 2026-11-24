# Integración Andreani — envíos + tracking (cliente y admin)

## Context

Valplas despacha pedidos a todo el país y hoy no tiene integración con transportistas: el admin cambia estados a mano, `orders.tracking_number` existe pero nadie lo escribe, y el cliente no ve seguimiento. Objetivo: cuando entra un pedido, poder generar el envío en Andreani (pre-envío + etiqueta), y que las novedades del envío actualicen automáticamente el pedido y se vean tanto en la cuenta del cliente como en el backoffice. Valplas ya es cliente Andreani pero **todavía no tiene credenciales de API** → se construye con modo `mock` + tests con fetch mockeado, y un smoke-test listo para cuando lleguen las credenciales (se generan en andreani.com > Integraciones o vía ejecutivo comercial).

### Decisiones tomadas con el usuario

| Tema                | Decisión                                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Credenciales        | No hay aún → modo `mock` + Vitest + script smoke QA                                                                                                                                  |
| Tracking            | **Polling** (node-cron) a `/v3/envios/{n}/trazas`. Ingesta agnóstica de fuente; endpoint PUSH opcional deshabilitado salvo env                                                       |
| Creación del envío  | **Botón admin** (sirve para cualquier pedido: web, ADM-, WSP-, "envíos a mano"). Env `ANDREANI_AUTO_CREATE_SHIPMENT=false`; en `true` también se crea solo al confirmarse el pago MP |
| Alcance extra       | Cotización en vivo en checkout, retiro en sucursal, cancelar envío desde admin, emails al cliente (Resend)                                                                           |
| Origen              | Valplas lleva los paquetes a una sucursal fija → `origen.sucursal.id` = `ANDREANI_ORIGIN_BRANCH_ID`                                                                                  |
| Contratos           | B2C domicilio + B2C sucursal (1 bulto ≤50 kg) + B2B opcional (multi-bulto o >50 kg). Si se necesita B2B y no está configurado → error claro                                          |
| Precio              | `tarifaConIva.total` de Andreani tal cual (sin envío gratis ni recargo)                                                                                                              |
| Falla de cotización | **Bloquear**: opción Andreani muestra error + reintentar; crear pedido re-cotiza server-side y falla con error claro                                                                 |

### Approaches considerados

1. **Integración nativa en nuestra API (elegida)**: cliente Andreani propio en `infrastructure/external/andreani`, módulo `shipments`, polling con node-cron (patrón ya usado). Control total, sin costo extra, encaja con el stack.
2. Agregador multi-carrier (Envia, Zippin, etc.): menos código pero costo por envío, otra dependencia y otra cuenta; no aporta si solo usamos Andreani.
3. Módulos e-commerce de Andreani: solo Tiendanube/VTEX/WooCommerce — no aplica.

## Andreani API (de specs oficiales del portal, leídos de los xlsx/pdf)

- Base QA `https://apisqa.andreani.com`, PROD `https://apis.andreani.com`.
- Auth: `GET /login` Basic Auth → token 24 h, header `x-authorization-token`.
- Pre-envío: `POST /v2/ordenes-de-envio` (202/208). Estados pre-envío: Pendiente → Solicitado → Creada | Rechazada. Vigencia 30 días. Respuesta: `bultos[].numeroDeEnvio`, `agrupadorDeBultos`, `etiquetasPorAgrupador`, `sucursalDeDistribucion`, `fechaEstimadaDeEntrega?`. Errores 400 `{title, detail, errors:[{field,message}]}`.
- Estado pre-envío: `GET /v2/ordenes-de-envio/{numero}`.
- Etiqueta: `GET /v2/ordenes-de-envio/{agrupador}/etiquetas` (PDF; requiere token → proxy por nuestra API).
- Cotizador: `GET /v1/tarifas?cpDestino&contrato&cliente&sucursalOrigen&bultos[0][volumen]&bultos[0][kilos]&bultos[0][valorDeclarado]` → `tarifaConIva.total` (string).
- Tracking: `GET /v3/envios/{n}` (estado actual) y `GET /v3/envios/{n}/trazas` → `eventos[{Fecha, Ciclo, Evento, Motivo, Submotivo, Estado, Sucursal, SucursalId, Comentario}]`.
- Cancelación (asíncrona, solo antes de procesamiento logístico): `POST /v2/nueva-accion` `{accion:"cancelacion", datos:{contrato, numeroAndreani:[n]}}`; confirmar con `GET /v2/nueva-accion/{n}` → `state` Aceptado/Rechazado/Pendiente + `razon`.
- Sucursales (público): `GET /v2/sucursales?codigoPostal=&canal=B2C` (probado en QA, responde). Localidades (público): `GET /v1/localidades?codigosPostales=` — Andreani rechaza localidad/CP no normalizados.
- PUSH: requiere gestión comercial y tiene costo → fuera de alcance (queda endpoint preparado).

## Mapeo eventos Andreani → estado envío → estado pedido

Tabla pura en `event-mapping.ts` (de "Maestro de Eventos y Estados v2"). Todo evento se guarda en el timeline; solo algunos cambian estado.

| Evento Andreani (ciclo)                                                                                                                                       | `shipments.status` | Pedido                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------- |
| alta OK (respuesta POST) / `OrdenDeEnvioCreada`                                                                                                               | `created`          | → `ready_to_ship` (pasando por `processing` si viene de `payment_confirmed`)  |
| `OrdenDeEnvioRechazada`                                                                                                                                       | `rejected`         | → `processing` (nueva transición `ready_to_ship → processing`) + alerta admin |
| `Admision`, `AltaAutomatica`, `AltaManual`, `EnvioConsolidado`, `EnvioDespachado`, `ExpedicionHojaDeRuta*`, `RecepcionEnSucursalDestino` (servicio domicilio) | `in_transit`       | → `shipped` + `shipped_at` + `tracking_number`                                |
| `Distribucion`                                                                                                                                                | `out_for_delivery` | (shipped)                                                                     |
| `RecepcionEnSucursalDestino` / `ComienzoCustodiaEnSucursal` con servicio sucursal                                                                             | `ready_for_pickup` | (shipped) + email "listo para retirar"                                        |
| `Visita` motivo ≠ Entregado                                                                                                                                   | `delivery_failed`  | (shipped) — Andreani reintenta                                                |
| `EnvioEntregado` o `Visita` motivo Entregado, ciclo Distribution/Directo/Resend/Reenvio                                                                       | `delivered`        | → `delivered` + `delivered_at`                                                |
| `EnvioNoEntregado`, ciclo Drop/Devolucion, `SolicitudDeRescate`, `Rescate`                                                                                    | `returning`        | sin cambio + alerta admin                                                     |
| `EnvioEntregado` ciclo Devolucion / `EnvioRendido`                                                                                                            | `returned`         | sin cambio (admin decide cancelar/reembolsar)                                 |
| `Siniestro`, `RoturaTotal`                                                                                                                                    | `incident`         | sin cambio + alerta admin                                                     |
| `EnvioAnulado` / cancelación aceptada                                                                                                                         | `cancelled`        | → `processing`                                                                |
| otros (`GestionTelefonica`, `NuevaFechaDeEntregaPactada`, `Impresion`, …)                                                                                     | sin cambio         | sin cambio (solo timeline)                                                    |

Estados terminales para el polling: `delivered`, `returned`, `cancelled`, `rejected`, `error`, `expired` (pre-envío >30 días sin admisión).

## Hallazgos del código que condicionan el diseño (verificados)

- `getCarrierShippingCost` (`apps/api/src/modules/shipping/shipping-cost.ts:19`) solo sabe de tarifas por zona y tira `SHIPPING_RATE_NOT_FOUND` → Andreani necesita rama propia (`carrier.code === 'andreani'`, vía `findCarrierByCode` en `shipping.repository.ts:233`). PR-A se puede deployar sin riesgo: ningún pedido web puede elegir Andreani hasta PR-B.
- Cobertura por zonas bloquea envíos nacionales: `getShippingQuote` (`shipping.domain.ts:172`) tira `noCoverageError` y `withDeliverability` (`shipping-coverage.ts:25`) marca no-entregable → el checkout bloquea (`address-step.tsx:122-147`).
- `validate()` (`shared/middleware/validation.middleware.ts:19`) no reescribe `req.body` → los `.default()` de Zod no aplican; el domain pone defaults.
- **Seguridad**: `PATCH /orders/:id/status` (`order.routes.ts:158`) sin `requireRole` y el domain (`order.domain.ts:188-224`) solo valida ownership → un cliente puede pasar su pedido a `payment_confirmed` (descuenta stock, marca pagado sin pagar). `POST /:id/cancel` deja al cliente cancelar pedidos ya `shipped`.
- **Concurrencia**: `updateOrderStatus` (`order.repository.ts:624-663`) sin compare-and-swap; dos webhooks MP pueden duplicar descuento de stock. El polling lo empeoraría.
- `findOrderWithDetails` (`order.repository.ts:317-394`) ya devuelve `statusHistory` (la web no lo usa) y hace `SELECT *` → filtra `admin_notes` al cliente.
- `priceOrderItems` (`modules/orders/order-pricing.ts:78-170`) ya carga productos con `weight/width/length/height` (`product.repository.ts` `findProductsByIds`) → agregar esos campos a `PricedOrderLine` da cantidades reales + dimensiones sin query extra. Ítems del carrito: `{product_id, quantity, price_list_id?}` (`createOrderItemSchema`, `order.validators.ts:23`).
- Hook auto-create: `payments.controller.ts:243-253` (después de pasar a `processing`).
- No existe router `/api/admin`: endpoints admin viven por módulo. Swagger lee `@swagger` JSDoc de `src/modules/**/*.routes.ts` (`config/swagger.ts:264`). `env.FRONTEND_URL` ya existe (`api/src/env.ts:32`). `fetchApi` siempre hace `res.json()` (`web/src/lib/api.ts:169`) → hace falta `getBlob` para la etiqueta PDF.
- Tests: Vitest contra DB real, sin supertest (se llama domain/controller directo); `setup.ts` borra `orders` directo → FKs nuevas con `ON DELETE CASCADE`. `webhook.test.ts` y `cancel-stale-orders.test.ts` usan `toHaveBeenCalledWith` exacto → actualizarlos.
- WhatsApp: trigger `trg_enqueue_order_status_webhook` (migración 051) avisará al bot de `ready_to_ship/shipped/delivered` y de la nueva transición `ready_to_ship → processing` → documentar en `docs/BOT_API.md`.

## Diseño

### Datos (migraciones nuevas, 053+; nunca editar existentes)

- **053_create_shipments.sql**
  - `shipments`: `id uuid`, `order_id` FK `ON DELETE CASCADE`, `carrier_code`, `service_type` (`home_delivery|branch_pickup`, CHECK), `contract`, `channel` (`B2C|B2B`), `status` varchar+CHECK (`requesting, pending, created, rejected, in_transit, out_for_delivery, ready_for_pickup, delivery_failed, delivered, returning, returned, incident, cancelling, cancelled, error, expired`), `tracking_number`, `group_number` (agrupador), `andreani_state`, `destination_branch JSONB`, `localidad`, `packages JSONB`, `request_payload JSONB`, `raw_response JSONB`, `quoted_price NUMERIC(12,2)` (costo Valplas), `label_url`, `last_event`, `last_event_at`, `estimated_delivery_at`, `delivered_at`, `cancelled_at`, `error_message`, `next_poll_at`, `poll_failures`, `created_by` FK users NULL (NULL = auto), timestamps. Índice único parcial: 1 envío activo por pedido (`status NOT IN ('cancelled','rejected','error','expired')`); índice `next_poll_at` para activos.
  - `shipment_events`: `id`, `shipment_id` FK CASCADE, `occurred_at`, `cycle`, `event`, `reason`, `sub_reason`, `status_label`, `branch_name`, `branch_id`, `comment`, `source` (`pull|push|mock`), `raw JSONB`, `created_at`. `CREATE UNIQUE INDEX (shipment_id, event, occurred_at, COALESCE(reason,''))` + insert `ON CONFLICT DO NOTHING RETURNING *` (filas devueltas = eventos nuevos → disparan cambios de estado y emails).
  - `orders`: `shipping_method VARCHAR(20) NOT NULL DEFAULT 'home_delivery'` CHECK, `pickup_branch JSONB`, `recipient_document VARCHAR(20)`, `shipped_at TIMESTAMPTZ`.
  - Seed carrier: `INSERT ('Andreani','andreani', is_active, is_external=true) ON CONFLICT (code) DO UPDATE SET is_external = true`.
  - RLS habilitado en tablas nuevas; header + rollback comentado. varchar+CHECK en vez de enums (evita regla de `ALTER TYPE ADD VALUE` separado).
- **054_create_notification_outbox.sql** (PR-C): `id, order_id` FK CASCADE, `channel 'email'`, `template`, `recipient`, `payload JSONB`, `dedupe_key UNIQUE`, `attempts`, `next_attempt_at`, `sent_at`, `failed_at`, `skipped_at`, `last_error`, `created_at`. RLS.

### Variables de entorno (`apps/api/src/env.ts` + `apps/api/.env.example`, solo placeholders)

`ANDREANI_MODE` (`disabled|mock|qa|prod`, default `disabled`), `ANDREANI_BASE_URL` (override opcional), `ANDREANI_USERNAME`, `ANDREANI_PASSWORD`, `ANDREANI_CLIENT_CODE`, `ANDREANI_CONTRACT_HOME`, `ANDREANI_CONTRACT_BRANCH`, `ANDREANI_CONTRACT_B2B` (opcional), `ANDREANI_ORIGIN_BRANCH_ID`, `ANDREANI_SENDER_NAME/EMAIL/PHONE/DOC_TYPE/DOC_NUMBER`, `ANDREANI_DEFAULT_ITEM_WEIGHT_KG`, `ANDREANI_DEFAULT_ITEM_VOLUME_CM3`, `ANDREANI_AUTO_CREATE_SHIPMENT=false`, `ANDREANI_POLL_CRON='*/15 * * * *'` (el intervalo real lo decide `next_poll_at`), `ANDREANI_TRACKING_URL_TEMPLATE`, `ANDREANI_PUSH_USERNAME/PASSWORD` (vacío = webhook apagado), `RESEND_API_KEY`, `EMAIL_FROM`. `validateAndreaniConfig()` al arrancar: en `qa|prod` exige credenciales, cliente, contrato domicilio, sucursal origen y remitente; **rechaza `mock` si `IS_PRODUCTION`**.

### Cliente Andreani — `apps/api/src/infrastructure/external/andreani/`

| Archivo                 | Contenido                                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`, `errors.ts` | Tipos request/response; `AndreaniError {status, code: TIMEOUT\|AUTH\|VALIDATION\|NOT_FOUND\|UPSTREAM, fieldErrors}`                                                                               |
| `http-client.ts`        | fetch nativo; token cacheado 23 h, un solo login en vuelo, reintento único en 401, `AbortSignal.timeout` 8 s cotización / 15 s resto; token leído de header y si no del body (confirmar en smoke) |
| `mock-client.ts`        | Fake determinístico: precio por kilos, números ficticios, PDF mínimo, trazas guionadas según minutos desde creación (permite demo E2E sin credenciales)                                           |
| `branches.ts`           | `getBranches()` (cache 12 h de `/v2/sucursales`), `findPickupBranches(cp, limit)` (canal B2C + `entregaEnvios`, por `codigosPostalesAtendidos` y si no por provincia), `findBranchById`           |
| `localities.ts`         | `resolveLocalidad(cp, city)` contra `/v1/localidades` (case/acentos-insensitive) → `{localidad}` o `{candidates}`                                                                                 |
| `index.ts`              | `getAndreaniClient()` según `ANDREANI_MODE`, `isAndreaniEnabled()` (punto único para `vi.mock`)                                                                                                   |
| `smoke.ts`              | Script `bun run andreani:smoke`: login, sucursales, localidades, tarifas, crear orden QA, estado, etiqueta, trazas, cancelación. Rechaza `prod` sin `--prod`                                      |

Interfaz: `quote`, `createOrder → {httpStatus: 202|208, body}`, `getOrder`, `getLabel(id,'pdf'|'zpl') → Buffer`, `getTraces`, `cancelShipment`, `getCancellation`, `listBranches`, `listLocalities`.

### Módulo `apps/api/src/modules/shipments/`

- `packages.ts` (puro): `computePackages(lines, defaults)` → bultos, kg, cm³, canal (1 bulto ≤50 kg → B2C; si no B2B), warnings por productos sin peso/medidas. `pickContract(serviceType, channel, cfg)`: B2B + sucursal → bloqueado; B2B sin contrato → `ANDREANI_B2B_NOT_CONFIGURED`. Valor declarado = subtotal del pedido (repartido entre bultos en B2B).
- `request-mapper.ts` (puro): `buildCreateOrderRequest(ctx)` → origen `sucursal.id`, destino postal o sucursal, remitente (env), destinatario (nombre, email con fallback remitente, teléfono E.164→nacional, DNI si hay), `idPedido = shipments.id`, `referencias idCliente = order_number`.
- `event-mapping.ts` (puro): tabla de arriba → `{shipmentStatus?, orderTarget?, notify?}`.
- `shipment.repository.ts`: `insertRequesting`, `markResult`, `findActiveByOrderId`, `claimDueForPolling(limit, leaseSec)` (copiar lease `FOR UPDATE SKIP LOCKED` de `modules/bot/outbound-webhook.repository.ts:32-63`), `insertEventsTx`, `findByOrderWithEvents`.
- `shipment.domain.ts`:
  - `previewForOrder` (bultos default, contrato, localidad normalizada, warnings).
  - `createForOrder(orderId, input, actorId|null)`: permitido en `payment_confirmed|processing|ready_to_ship`; tx corta inserta `requesting` (23505 → 409 `SHIPMENT_ALREADY_EXISTS`) → llamada HTTP **fuera de transacción** → tx corta (lock shipment → order) actualiza, eventos, `advanceOrderTo('ready_to_ship')`. Timeout/5xx → queda `requesting` y el job re-POSTea el mismo payload (208 idempotente). 4xx → `error` con mensaje (libera el slot para reintentar). No toca `shipping_cost`/`carrier` del pedido; guarda `quoted_price`.
  - `cancelShipment` → `cancelling`, confirma con `getCancellation` (job) → `cancelled` + pedido a `processing`.
  - `refreshShipment` (botón "Actualizar tracking"), `ingestEvents(shipmentId, events, source)`, `tryAutoCreateForOrder`.
- Rutas (`shipment.routes.ts` montado en `/api/shipments`, todas `requireRole(['admin','owner'])`, con `@swagger` + tag "Shipments"): `GET /orders/:orderId/preview`, `POST /orders/:orderId`, `POST /:id/cancel`, `POST /:id/refresh`, `GET /:id/label` (`res.type('application/pdf').send(buf)`).
- Webhook PUSH opcional: `POST /api/shipping/andreani/webhook` (Basic auth con `timingSafeEqual`, 404 si env vacío, exento de CSRF `csrf.middleware.ts:32` y rate-limit `rate-limit.middleware.ts:31`) → `ingestEvents(…,'push')`.

### Cambios en pedidos (`apps/api/src/modules/orders/`)

- `order.repository.ts`: `updateOrderStatusTx(client, orderId, data, changedBy|null, {expectedStatus?, trackingNumber?})` con `WHERE status = ANY($expected)` (0 filas → 409 `ORDER_STATUS_CONFLICT`) y timestamps `paid_at/shipped_at/delivered_at/cancelled_at = COALESCE(col, NOW())` según estado; `updateOrderStatus` queda como wrapper. `advanceOrderTo(client, orderId, target, note)`: camina `payment_confirmed → processing → ready_to_ship → shipped → delivered` paso a paso con CAS + historial; no-op si ya pasó o está fuera del camino. `findOrderWithDetails` suma shipments con `LEFT JOIN LATERAL json_agg` de eventos (sin N+1); `findOrders` suma `active_shipment {status, tracking_number}` por lateral join.
- `order.types.ts`: columnas nuevas; `ready_to_ship: ['shipped','cancelled','processing']`.
- `order.domain.ts`: cambio de estado solo admin/owner; clientes cancelan solo `pending_payment`; cancelar pedido con envío activo → 409 `SHIPMENT_ACTIVE`; vista cliente sin `admin_notes`, `raw_response`, `request_payload`, `error_message`, contrato.
- `order.routes.ts:158`: `requireRole`. `payments.controller.ts`: `expectedStatus: order.status` + hook `setImmediate(() => void tryAutoCreateForOrder(order.id).catch(log))` tras L252 solo si `ANDREANI_AUTO_CREATE_SHIPMENT`. `cancel-stale-orders.job.ts`: `expectedStatus: 'pending_payment'`.
- Fallo de auto-create → fila `error` con `error_message` (`created_by NULL`) visible en la card admin. Backstop: el job de tracking también toma pedidos Andreani en `processing` sin envío cuando el flag está en `true`.

### Jobs (`apps/api/src/infrastructure/jobs/`, registrar en `server.ts:176-183` y detener en `shutdown` `server.ts:192`)

- `andreani-tracking.job.ts`: `pollAndreaniShipments({limit: 50})`; reclama vencidos con lease; llamadas secuenciales (concurrencia ≤3); `requesting` → re-POST; pendientes de alta → `GET /v2/ordenes-de-envio/{n}`; `cancelling` → `GET /v2/nueva-accion/{n}`; resto → `GET /v3/envios/{n}/trazas`. Próximo poll: requesting 5 min, pre-admisión 30 min, en tránsito 60 min, en sucursal 6 h; backoff de fallas `min(15min·2^n, 12h)`; pre-envío >30 días → `expired`. No-op si Andreani deshabilitado; flag `running`.
- `send-notifications.job.ts` (PR-C): cada minuto, SKIP LOCKED, backoff como `deliver-bot-webhooks.job.ts`.

### Emails (PR-C) — Resend vía `fetch` (sin SDK, igual que `bot-webhook.client.ts`)

- `infrastructure/external/resend.client.ts`: `sendEmail({to, subject, html, text, idempotencyKey})` con header `Idempotency-Key`.
- `modules/notifications/`: repo (`enqueueTx` con `ON CONFLICT (dedupe_key) DO NOTHING`, claim/mark/prune), templates (despachado con link tracking, listo para retirar en sucursal, entregado, no pudimos entregar) con HTML escapado y link a `FRONTEND_URL/cuenta/pedidos/:id`.
- Encolado dentro de la tx de `ingestEvents` con `dedupe_key = ${orderId}:${template}`; usuarios sin email → se omite. Sin `RESEND_API_KEY` → fila marcada `RESEND_DISABLED` + log (no se acumulan emails viejos); eventos >48 h no se envían.

### Checkout (PR-B)

- Backend: dimensiones en `PricedOrderLine`; `modules/shipping/andreani-quote.ts` `quoteAndreani({postcode, lines, subtotal, serviceType})` con cache en memoria 10 min (cp+contrato+kg+cm³+valor); `Number(tarifaConIva.total)` finito y >0.
- `shipping.domain.ts`: `getCheckoutShippingOptions({postcode, items})` = cotizaciones por zona (errores de cobertura → lista vacía) + Andreani domicilio y sucursal en `Promise.allSettled` (recursos independientes). Opción: `{carrierId, carrierCode, carrierName, serviceType, price|null, estimatedDays, status:'ok'|'error', errorMessage?}`. `getShippingQuote` filtra Andreani (bot sin cambios).
- Rutas en `shipping.routes.ts`: `POST /api/shipping/quote` (auth; body `{postcode, items}`), `GET /api/shipping/andreani/branches?postcode=&limit=` (forma paginada, máx 50). GET `/shipping/quote` queda para el bot.
- `withDeliverability`: entregable si cubre una zona **o** Andreani está habilitado y activo.
- `createOrder` (validators/types/domain/repository): acepta `shipping_method`, `pickup_branch_id`, `recipient_document`; sucursal solo con Andreani; valida sucursal y guarda snapshot; re-cotiza server-side y si falla → 503 `ANDREANI_QUOTE_UNAVAILABLE` sin crear pedido.
- Web: `ShippingOption` (`web/src/types/index.ts:215`) + `optionKey`, `serviceType`, `status`, `errorMessage`, `branch`; `shipping.service.ts` `quoteShippingForCart`, `getAndreaniBranches`; `shipping-step.tsx` recibe `items` (de `useCartStore`, `checkout-page.tsx:27`), radio por `${carrierId}:${serviceType}`, skeleton/error+reintentar en Andreani, nuevo `components/checkout/branch-picker.tsx` (dirección + horario); `payment-step.tsx:67-79` envía método, sucursal y DNI (obligatorio para retiro en sucursal, mi decisión: Andreani pide documento en mostrador).

### Web admin y cliente (PR-A)

- `web/src/lib/api.ts`: `getBlob(endpoint)` con mismo flujo de refresh 401.
- `web/src/lib/services/shipments.service.ts`; `web/src/lib/shipment-status.ts` (labels en español); `components/admin/shipment-status-badge.tsx`.
- `components/admin/andreani-shipment-card.tsx` + `create-shipment-dialog.tsx`: tipo de servicio, sucursal, bultos editables precargados con warnings, preview de contrato, override de localidad; descargar etiqueta, actualizar tracking, cancelar (AlertDialog); todo botón async con loading local `Loader2` + "Procesando..." y toast `sonner`.
- `components/shipments/shipment-timeline.tsx` + `shipment-tracking-card.tsx` (nro, link a tracking público Andreani, estado amigable, timeline, sucursal de retiro).
- `app/admin/pedidos/[id]/page.tsx` (fix L238 → `carrierName`, card nueva), `app/admin/pedidos/page.tsx` (columna envío).
- `app/(account)/cuenta/pedidos/[id]/page.tsx` y `page.tsx`: pasar al `Order` de `orders.service.ts`, usar `alias`/`carrierName`, card de tracking y badge.
- `lib/services/orders.service.ts`: extender `Order`, quitar estados inexistentes (`in_transit`, `payment_failed`), espejar nueva transición.

## Entrega en 3 PRs (branch `feature/andreani-integration` desde `develop`; nunca commitear a `develop`/`main`)

1. **PR-A — núcleo**: migración 053, env + validación, cliente Andreani (http + mock + branches + localities + smoke), fixes de seguridad/CAS/`admin_notes`, módulo shipments, webhook PUSH apagado, job de tracking, flag auto-create, UI admin + tracking cliente. Docs: `docs/ANDREANI_INTEGRATION.md`, `docs/API_ENDPOINTS.md`, `docs/BOT_API.md`.
2. **PR-B — checkout**: cotización en vivo, retiro en sucursal, DNI, deliverability, re-cotización al crear pedido.
3. **PR-C — emails**: migración 054, Resend client, outbox + job, templates.

Antes de codear cada parte: Context7 para node-cron, Zod, Express; docs locales de Next 16 (`apps/web/node_modules/next/dist/docs`, ver `apps/web/AGENTS.md`). TDD en lógica pura y domain. Conventional commits; revisar `git diff --staged` por secretos.

## Verificación

**Automática (Vitest, `bun --filter @valplas/api test`)**

- Unit: `andreani-client.test.ts` (token header/body, cache, login único, retry 401, timeout, errores 400 con `fieldErrors`, 202/208 — fixtures de los ejemplos del spec), `packages.test.ts`, `request-mapper.test.ts` (B2C/B2B/sucursal/teléfono), `event-mapping.test.ts`.
- Integración (DB real, cliente `vi.mock`): `shipment.domain.test.ts` (pedido web/ADM/pagado; duplicado → 409; 400 → `error` y reintento OK; timeout → `requesting` → 208 resuelve; cancelación → pedido `processing`; dedupe de eventos; `shipped/delivered` setean timestamps + tracking; ciclo devolución no marca entregado; pedido cancelado por admin no se toca), `andreani-tracking.job.test.ts`, `andreani-webhook.test.ts`, `order.status-guard.test.ts` (cliente 403; CAS → 409; cancel cliente solo `pending_payment`; cancel con envío activo → 409), `checkout-quote.test.ts` (OK; Andreani falla y los demás siguen; sin zona pero Andreani OK; bot igual), `order.andreani-create.test.ts` (precio = cotización; falla → sin pedido; sucursal inválida/carrier incorrecto; snapshot), `andreani-branches.test.ts`, notifications (dedupe, sin email, job retry/disabled/48 h, escape HTML). Actualizar `payments/webhook.test.ts` (flag on/off) y `orders/cancel-stale-orders.test.ts`.
- `bun typecheck`, `bun lint`, `bun build`.

**Manual E2E en modo mock** (`ANDREANI_MODE=mock`, `bun dev`): checkout con Andreani domicilio y sucursal → pagar (MP sandbox) → admin crea envío → descarga etiqueta PDF → "Actualizar tracking" avanza trazas guionadas → pedido pasa `ready_to_ship → shipped → delivered` → cliente ve timeline en `/cuenta/pedidos/:id` → filas en `notification_outbox`. Probar flag `ANDREANI_AUTO_CREATE_SHIPMENT=true` y cancelación.

**Contra Andreani real**: ya mismo, endpoints públicos (sucursales/localidades) en QA. Con credenciales: `bun run andreani:smoke` contra QA (confirma token header vs body, 208 por `idPedido`, body de cancelación) → UAT QA → Ciclo 0 en prod (proceso que pide Andreani).

## Acciones del usuario (fuera del código)

- Generar credenciales API QA/prod (andreani.com > Integraciones o ejecutivo comercial) y pedir: código cliente, contratos B2C domicilio, B2C sucursal, B2B (si aplica), ID de sucursal de despacho.
- Resend: verificar dominio `valplas.net` (DNS en Cloudflare) y crear API key.
- Cargar peso/medidas en productos (el preview avisa cuáles faltan; mientras tanto se usan defaults de env).
