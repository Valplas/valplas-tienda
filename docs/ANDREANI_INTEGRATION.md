# Integración Andreani (envíos + tracking)

Permite generar el envío de un pedido en Andreani (pre-envío + etiqueta), seguirlo por polling y reflejar
las novedades en el pedido, el backoffice y la cuenta del cliente. Código: `apps/api/src/infrastructure/external/andreani/`
(cliente) y `apps/api/src/modules/shipments/` (dominio). Diseño completo: `docs/superpowers/specs/2026-11-21-andreani-integration-design.md`.

## 1. Modos

| `ANDREANI_MODE` | Qué hace                                                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `disabled`      | Default. Integración apagada (rutas de envío responden 503, jobs no-op).                                                   |
| `mock`          | Cliente falso determinístico (precios, números, PDF mínimo, trazas guionadas). Solo dev/test. **Rechazado en producción.** |
| `qa`            | API real `https://apisqa.andreani.com`. Requiere credenciales.                                                             |
| `prod`          | API real `https://apis.andreani.com`. Requiere credenciales.                                                               |

`validateAndreaniConfig()` corre al arrancar: en `qa|prod` exige usuario, contraseña, código de cliente,
contrato domicilio, sucursal de origen y datos del remitente.

## 2. Variables de entorno (`apps/api/.env`)

| Variable                                               | Default        | Descripción                                                                                |
| ------------------------------------------------------ | -------------- | ------------------------------------------------------------------------------------------ |
| `ANDREANI_MODE`                                        | `disabled`     | `disabled` / `mock` / `qa` / `prod`                                                        |
| `ANDREANI_BASE_URL`                                    | (según modo)   | Override opcional de la URL base                                                           |
| `ANDREANI_USERNAME` / `ANDREANI_PASSWORD`              | -              | Credenciales API (Basic en `/login`)                                                       |
| `ANDREANI_CLIENT_CODE`                                 | -              | Código de cliente (cotizador)                                                              |
| `ANDREANI_CONTRACT_HOME`                               | -              | Contrato B2C a domicilio (obligatorio)                                                     |
| `ANDREANI_CONTRACT_BRANCH`                             | -              | Contrato B2C a sucursal                                                                    |
| `ANDREANI_CONTRACT_B2B`                                | -              | Contrato B2B (multi-bulto o > 50 kg). Si falta y hace falta: `ANDREANI_B2B_NOT_CONFIGURED` |
| `ANDREANI_ORIGIN_BRANCH_ID`                            | -              | Sucursal donde Valplas deja los paquetes (`origen.sucursal.id`)                            |
| `ANDREANI_SENDER_NAME/EMAIL/PHONE/DOC_TYPE/DOC_NUMBER` | -              | Remitente                                                                                  |
| `ANDREANI_DEFAULT_ITEM_WEIGHT_KG`                      | `0.5`          | Peso por unidad si el producto no tiene peso cargado                                       |
| `ANDREANI_DEFAULT_ITEM_VOLUME_CM3`                     | `1000`         | Volumen por unidad si el producto no tiene medidas                                         |
| `ANDREANI_AUTO_CREATE_SHIPMENT`                        | `false`        | `true`: crea el envío solo al confirmarse el pago (más backstop del job)                   |
| `ANDREANI_POLL_CRON`                                   | `*/15 * * * *` | Frecuencia del job; el intervalo real por envío lo da `next_poll_at`                       |
| `ANDREANI_TRACKING_URL_TEMPLATE`                       | -              | Link público de seguimiento                                                                |
| `ANDREANI_PUSH_USERNAME` / `ANDREANI_PUSH_PASSWORD`    | vacío          | Vacío = webhook PUSH apagado (404)                                                         |
| `ANDREANI_MOCK_STEP_SECONDS`                           | `60`           | Velocidad de las trazas del modo mock                                                      |

`.env.example` solo lleva placeholders. Nunca commitear credenciales.

Al arrancar se valida la config y el servidor no levanta si hay problemas: `ANDREANI_MODE` desconocido (antes se tomaba como
`disabled` en silencio), `ANDREANI_POLL_CRON` inválido, `ANDREANI_AUTO_CREATE_SHIPMENT=true` con el modo `disabled`, `mock` en
producción, o credenciales faltantes en `qa`/`prod`. `qa` en producción solo genera una advertencia en el log.

## 3. Flujo admin

1. Pedido en `payment_confirmed`, `processing` o `ready_to_ship` (web, `ADM-`, `WSP-` o "a mano").
2. En el detalle del pedido: **Crear envío** → diálogo con tipo de servicio (domicilio / sucursal), bultos precargados
   (con warnings por productos sin peso/medidas), contrato y localidad normalizada (`GET /api/shipments/orders/:orderId/preview`).
3. `POST /api/shipments/orders/:orderId` registra el envío (`requesting`), llama a Andreani **fuera de transacción** y,
   si sale bien, deja el envío `pending`/`created` y el pedido en `ready_to_ship`.
   - Timeout o 5xx: queda `requesting`; el job re-POSTea el mismo payload (misma `idPedido`, Andreani responde 208).
     Si tras 24 h o 12 reintentos Andreani sigue sin confirmar, el envío pasa a `error` ("Andreani no confirmó el alta
     tras varios intentos; verificá en el portal de Andreani antes de reintentar"). Si mientras tanto el pedido dejó de
     estar activo (cancelado, reembolsado), el job no reenvía el alta y lo marca `error`.
   - 4xx: envío en `error` con el mensaje de Andreani; se puede reintentar.
4. **Descargar etiqueta** (`GET /api/shipments/:id/label`, PDF proxiado por la API), **Actualizar tracking**, **Cancelar**.
5. El pedido pasa solo a `shipped` (con `shipped_at` y `tracking_number`) y `delivered` según las trazas.

Cancelar un envío es asíncrono (solo antes del procesamiento logístico): queda `cancelling`, el job confirma con
`GET /v2/nueva-accion/{n}` y, si Andreani acepta, el envío pasa a `cancelled` y el pedido vuelve a `processing`.
**Descartar** (`POST /api/shipments/:id/discard`, solo admin/owner): para envíos trabados en `requesting` (pasa a `error`)
o `cancelling` (pasa a `cancelled`). Es solo local, **no llama a Andreani**, y devuelve el pedido a `processing`
(y limpia su `tracking_number` si era el del envío). El envío puede seguir existiendo en el portal de Andreani:
verificarlo y cancelarlo ahí antes de generar uno nuevo. El botón del backoffice lo advierte en un diálogo.

`GET /api/shipments/config` (solo admin/owner) devuelve `{ enabled, mode, autoCreate }` sin secretos; el backoffice lo usa
para ocultar "Crear envío Andreani" con la integración deshabilitada.

`quoted_price` queda en `NULL` hasta el PR-B (cotización de Andreani en el checkout); hoy no se guarda ninguna cotización.

Mientras hay un envío activo no se puede editar el pedido (admin) ni volverlo manualmente de `ready_to_ship` a `processing`
(409 `SHIPMENT_ACTIVE`). La cancelación del pedido chequea los envíos dentro de la misma transacción que bloquea el pedido,
así que no puede cruzarse con un alta en curso.

Un pedido con envío activo no se puede cancelar (409 `SHIPMENT_ACTIVE`); primero cancelá el envío.

Seguridad relacionada: `PATCH /api/orders/:id/status` es solo admin/owner; los clientes solo cancelan `pending_payment`.

## 4. Mapeo evento Andreani → envío → pedido

Solo algunos eventos cambian estado; todos se guardan en `shipment_events` (timeline). Tabla en `event-mapping.ts`.

| Evento Andreani (ciclo)                                                                                                                                       | `shipments.status` | Pedido                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------- |
| alta OK (respuesta POST) / `OrdenDeEnvioCreada`                                                                                                               | `created`          | → `ready_to_ship` (pasando por `processing` si viene de `payment_confirmed`) |
| `OrdenDeEnvioRechazada`                                                                                                                                       | `rejected`         | → `processing` (transición `ready_to_ship → processing`) + alerta admin      |
| `Admision`, `AltaAutomatica`, `AltaManual`, `EnvioConsolidado`, `EnvioDespachado`, `ExpedicionHojaDeRuta*`, `RecepcionEnSucursalDestino` (servicio domicilio) | `in_transit`       | → `shipped` + `shipped_at` + `tracking_number`                               |
| `Distribucion`                                                                                                                                                | `out_for_delivery` | (shipped)                                                                    |
| `RecepcionEnSucursalDestino` / `ComienzoCustodiaEnSucursal` con servicio sucursal                                                                             | `ready_for_pickup` | (shipped) + email "listo para retirar" (PR-C)                                |
| `Visita` motivo ≠ Entregado                                                                                                                                   | `delivery_failed`  | (shipped) — Andreani reintenta                                               |
| `EnvioEntregado` o `Visita` motivo Entregado, ciclo Distribution/Directo/Resend/Reenvio                                                                       | `delivered`        | → `delivered` + `delivered_at`                                               |
| `EnvioNoEntregado`, ciclo Drop/Devolucion, `SolicitudDeRescate`, `Rescate`                                                                                    | `returning`        | sin cambio + alerta admin                                                    |
| `EnvioEntregado` ciclo Devolucion / `EnvioRendido`                                                                                                            | `returned`         | sin cambio (el admin decide cancelar/reembolsar)                             |
| `Siniestro`, `RoturaTotal`                                                                                                                                    | `incident`         | sin cambio + alerta admin                                                    |
| `EnvioAnulado` / cancelación aceptada                                                                                                                         | `cancelled`        | → `processing`                                                               |
| otros (`GestionTelefonica`, `NuevaFechaDeEntregaPactada`, `Impresion`, …)                                                                                     | sin cambio         | sin cambio (solo timeline)                                                   |

Terminales (no se vuelven a consultar): `delivered`, `returned`, `cancelled`, `rejected`, `error`, `expired`.

## 5. Polling (`andreani-tracking.job.ts`)

Corre según `ANDREANI_POLL_CRON`, reclama hasta 50 envíos vencidos con lease (`FOR UPDATE SKIP LOCKED`) y consulta en secuencia.
No hace nada si Andreani está deshabilitado.

| Estado                                                                       | Próximo poll | Qué consulta                            |
| ---------------------------------------------------------------------------- | ------------ | --------------------------------------- |
| `requesting`                                                                 | 5 min        | re-POST del mismo payload               |
| `pending`, `created`                                                         | 30 min       | `GET /v2/ordenes-de-envio/{n}` / trazas |
| `cancelling`                                                                 | 15 min       | `GET /v2/nueva-accion/{n}`              |
| `in_transit`, `out_for_delivery`, `delivery_failed`, `returning`, `incident` | 60 min       | `GET /v3/envios/{n}/trazas`             |
| `ready_for_pickup`                                                           | 6 h          | trazas                                  |

- Falla de la consulta: backoff `min(15 · 2^n, 720)` minutos.
- Pre-envío sin admisión a los 30 días: pasa a `expired`.
- Backstop de auto-create: con `ANDREANI_AUTO_CREATE_SHIPMENT=true` también toma pedidos Andreani en `processing` sin envío.

## 6. Novedades PUSH (opcional, apagado por defecto)

Andreani ofrece "Novedades PUSH" (requiere gestión comercial y puede tener costo). Para activarlo:

1. Definir en la API `ANDREANI_PUSH_USERNAME` y `ANDREANI_PUSH_PASSWORD` (valores largos y aleatorios) y redeployar.
2. Pedir a Andreani (ejecutivo comercial) que configure el webhook y pasarles:
   - **URL**: QA `https://<api-qa>/api/webhooks/andreani`, PROD `https://<api-prod>/api/webhooks/andreani` (método `POST`).
   - **Credenciales Basic Auth**: el usuario y contraseña del paso 1.
   - **Payload esperado** (JSON): `NumeroDeEnvio`, `Estado`, `FechaEstado` (obligatorios) y opcionales `IdCliente`, `Contrato`, `Motivo`, `SubMotivo`, `Ciclo`.
3. La respuesta sigue el contrato de Andreani: `{ message, error, status: 'OK' | 'ERROR' }`. 5xx se reintenta (cada 5 min, hasta 3 veces); el resto no.
4. El polling sigue activo como respaldo; los eventos duplicados se descartan por índice único.

El endpoint está exento de CSRF y rate-limit, compara credenciales en tiempo constante y responde 404 mientras las env estén vacías.

## 7. Smoke test contra la API real

```bash
cd apps/api
# Sin credenciales: solo endpoints públicos (sucursales + localidades)
ANDREANI_MODE=qa bun run andreani:smoke -- --public-only
# Completo (necesita credenciales en .env): login, cotización, crear, re-POST, estado, etiqueta, trazas, cancelar
ANDREANI_MODE=qa bun run andreani:smoke
# Prod: solo público con --prod; la corrida completa crea una orden REAL y exige --yes-create-real-order
ANDREANI_MODE=prod bun run andreani:smoke -- --prod --public-only
ANDREANI_MODE=prod bun run andreani:smoke -- --prod --yes-create-real-order
```

Variables extra: `ANDREANI_SMOKE_POSTCODE` (default `1406`). El script nunca imprime credenciales ni tokens,
sale con código 1 en el primer ❌, y escribe la etiqueta en `./andreani-smoke-label.pdf` (ignorado por git).
La corrida completa crea una orden de prueba (`idPedido = smoke-<timestamp>`) y la cancela. En prod imprime una advertencia y se niega a correr sin `--yes-create-real-order`.
Si el re-POST no devuelve 208 el script imprime una línea `⚠️` (Andreani podría no deduplicar por `idPedido`).
Si un paso falla después de crear la orden, el script intenta cancelarla (best-effort) e imprime `numeroDeEnvio` y contrato para cancelarla a mano si el cleanup falla.

**Checklist a confirmar con credenciales** (hay `TODO(smoke)` en `request-mapper.ts`):

- [ ] **Token**: ¿viene en el header `x-authorization-token` o en el body? (el cliente soporta ambos; el smoke lo informa).
- [ ] **208 por `idPedido`**: un re-POST con el mismo `idPedido` ¿devuelve 208? Si no, el reintento de `requesting` podría duplicar el envío (el smoke avisa con `⚠️` cuando el status no es 208).
- [ ] **Teléfonos**: códigos de `telefonos[].tipo` (hoy remitente `1`, destinatario `2`; las tablas del spec no coinciden).
- [ ] **Origen**: ¿`origen.sucursal.id` acepta el `id` (ej. `10568`) o hay que mandar el `numero` (ej. `568`)? En QA público `id` y `numero` difieren.
- [ ] **Cancelación**: body real de `POST /v2/nueva-accion` y forma de su respuesta / de `GET /v2/nueva-accion/{n}` (`state`, `razon`).
- [ ] **Estados reales** (`Estado`) de las trazas de un envío de prueba, para validar el mapeo de la sección 4.
- [ ] **`codigosPostalesAtendidos`**: en la corrida pública de QA solo 187 de 329 sucursales lo traen; el filtro por CP debe caer a provincia cuando falta.

## 8. Go-live

1. **Pedir a Andreani**: credenciales API QA y prod (andreani.com > Integraciones o ejecutivo), código de cliente, contratos
   (B2C domicilio, B2C sucursal, B2B si aplica) e ID de la sucursal de despacho.
2. Cargar peso y medidas en los productos (el preview avisa los que faltan; mientras tanto rigen los defaults de env).
3. `ANDREANI_MODE=qa` + credenciales en develop → `bun run andreani:smoke` completo → resolver el checklist de la sección 7 (ajustar código si algo difiere).
4. **UAT en QA** con pedidos reales de prueba: domicilio, sucursal, B2B, cancelación, etiqueta.
5. **Ciclo 0** en producción (proceso de homologación de Andreani): `ANDREANI_MODE=prod`, `ANDREANI_AUTO_CREATE_SHIPMENT=false`, primeros envíos manuales.
6. Opcional: activar PUSH (sección 6) y, cuando haya confianza, `ANDREANI_AUTO_CREATE_SHIPMENT=true`.
7. Verificar que el bot de WhatsApp maneja `ready_to_ship`, `shipped`, `delivered` y la transición hacia atrás `ready_to_ship → processing` (ver `BOT_API.md`, sección 7).

Prueba local sin credenciales: `ANDREANI_MODE=mock` (trazas guionadas; "Actualizar tracking" hace avanzar el envío).
