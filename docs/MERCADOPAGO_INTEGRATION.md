# Integración Mercado Pago — Checkout Pro

> Revisión del flujo de pago completo: carrito → checkout → botón MP → pago → webhook.
> Fecha: 2026-07-05 · Branch: `feature/add-mp` · Verificado contra código + panel MP (vía MCP oficial).

## Resumen

La integración usa **Checkout Pro** (preferencia + redirect a `init_point`). No hay Checkout API/Transparente: sin tokenización de tarjeta, sin SDK JS en el frontend, sin Bricks.

Estado general: **sólido para MVP**. Firma de webhook correcta, contrato front→back consistente, datos del payer completos.

**Actualización 2026-07-05:** los 9 hallazgos de la revisión fueron corregidos en `feature/add-mp` (8 por código con TDD, ver [Hallazgos](#hallazgos)). Queda **un paso manual** pendiente: hacer un pago de prueba end-to-end para validar la entrega de webhooks (hallazgo 3).

---

## Arquitectura del flujo

| Paso           | Qué pasa                                                                                                                                                                                                                                                                                                             | Código                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1. Carrito     | Carrito server-side; Zustand sincroniza contra la API                                                                                                                                                                                                                                                                | `apps/web/src/stores/cart-store.ts`                            |
| 2. Checkout    | Gate de sesión (redirige a `/login?redirect=/checkout`) y de carrito vacío. Stepper: Dirección → Envío → Pago                                                                                                                                                                                                        | `apps/web/src/components/checkout/checkout-page.tsx:38-49`     |
| 3. Botón pagar | "Pagar con Mercado Pago": loading state, DNI opcional (mejora aprobación), logo MP. Arma payload snake_case                                                                                                                                                                                                          | `payment-step.tsx:50-94` + `orders.service.ts:89-100`          |
| 4. Crear orden | Valida dirección/carrier/items → crea orden `pending_payment` (trigger DB reserva stock) → crea preferencia MP → devuelve `paymentUrl`                                                                                                                                                                               | `apps/api/src/modules/orders/order.domain.ts:92-248`           |
| 5. Preferencia | `external_reference` = order_number, items completos + envío como ítem "Envío" (NO `shipments.cost`: MP lo excluye del `transaction_amount` y el comprobante compartible mostraba el total sin envío), payer completo, `statement_descriptor: 'VALPLAS'`, `notification_url`, `back_urls`, `auto_return: 'approved'` | `apps/api/src/infrastructure/external/mercadopago.ts:36-80`    |
| 6. Redirect    | `window.location.href = paymentUrl` → usuario paga en MP                                                                                                                                                                                                                                                             | `payment-step.tsx:82`                                          |
| 7. Vuelta      | `back_urls` → `/checkout/resultado?collection_status=...&external_reference=VLP-...`. La página busca la orden por número (sesión se recupera vía refresh cookie + retry automático)                                                                                                                                 | `resultado/page.tsx` + `apps/web/src/lib/api.ts:79-92`         |
| 8. Webhook     | Verifica firma HMAC → consulta el pago a la API de MP (no confía en el body) → mapea estado → transiciona la orden                                                                                                                                                                                                   | `apps/api/src/modules/payments/payments.controller.ts:130-175` |

### Detalles correctos verificados

- **Firma HMAC**: `ts` en milisegundos (confirmado contra docs oficiales), comparación timing-safe, ventana anti-replay de 5 minutos, `data.id` tomado del query param como piden las docs (`payments.controller.ts:21-35`).
- **Anti-spoofing**: el webhook nunca usa el estado del body; siempre re-consulta `GET /v1/payments/{id}` con el access token.
- **Idempotencia**: notificaciones duplicadas no re-aplican transición (`VALID_STATUS_TRANSITIONS`).
- **Mapeo de estados**: `approved` → `payment_confirmed`; `rejected`/`cancelled` → `failed`; `pending`/`in_process` → sin cambio (orden queda `pending_payment`).
- **Contrato front→back**: requests en snake_case, respuestas en camelCase (middleware global). Correcto en `orders.service.ts`.
- **Precios en PESOS** en toda la cadena (DB `NUMERIC(12,2)` → UI → preferencia MP). Los comentarios "centavos" en `seed.ts`/swagger son stale — no dividir ni multiplicar por 100 en ningún lado.

---

## Endpoints

| Endpoint                              | Auth                       | Función                                                                 |
| ------------------------------------- | -------------------------- | ----------------------------------------------------------------------- |
| `POST /api/orders`                    | JWT                        | Crea orden + preferencia MP, devuelve `{ order, paymentUrl }`           |
| `GET /api/orders/number/:orderNumber` | JWT + ownership            | Usado por `/checkout/resultado`                                         |
| `POST /api/payments/webhook`          | Firma HMAC (`x-signature`) | Notificaciones de pago de MP                                            |
| `GET /api/payments/oauth/callback`    | `state` secreto            | Vinculación one-shot de la cuenta vendedora (obtiene `MP_ACCESS_TOKEN`) |

---

## Variables de entorno

### Backend (Railway)

| Variable            | Requerida               | Test (develop)                                                                                                                                                                                                                                                                                                                                | Producción                                                                                                   |
| ------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `MP_ACCESS_TOKEN`   | ✅                      | Token TEST (OAuth con `test_token=true`, o copiado de "Credenciales de prueba" del panel)                                                                                                                                                                                                                                                     | Token real del vendedor (OAuth callback con `NODE_ENV=production`, o "Credenciales de producción" del panel) |
| `MP_WEBHOOK_SECRET` | ✅                      | ⚠️ Con credenciales del **vendedor de prueba** (esquema actual de develop), MP firma con el secret de la **app espejo del seller test** — se obtiene logueándose en el panel de developers COMO el seller test user → su app → Webhooks. El secret del panel de la app real NO firma estas notificaciones (verificado por HMAC el 2026-07-06) | Secret del webhook **modo productivo** del panel de la app real                                              |
| `API_URL`           | ✅                      | `https://valplas-tienda-develop.up.railway.app`                                                                                                                                                                                                                                                                                               | URL de la API prod                                                                                           |
| `FRONTEND_URL`      | ✅                      | URL Vercel develop                                                                                                                                                                                                                                                                                                                            | `https://valplas.net`                                                                                        |
| `COOKIE_CROSS_SITE` | ✅ en deploy cross-site | `true`                                                                                                                                                                                                                                                                                                                                        | `true`                                                                                                       |
| `MP_CLIENT_ID`      | Solo flujo OAuth        | Panel → app → Credenciales                                                                                                                                                                                                                                                                                                                    | Ídem                                                                                                         |
| `MP_CLIENT_SECRET`  | Solo flujo OAuth        | Panel → app → Credenciales                                                                                                                                                                                                                                                                                                                    | Ídem                                                                                                         |
| `MP_OAUTH_STATE`    | Solo flujo OAuth        | Lo inventás vos (string random)                                                                                                                                                                                                                                                                                                               | Ídem                                                                                                         |

**Convención crítica de URLs** (`mercadopago.ts:65-70`):

- `API_URL` = base **SIN** `/api` — el código concatena `/api/payments/webhook`.
- `NEXT_PUBLIC_API_URL` (frontend) = base **CON** `/api`.

**`COOKIE_CROSS_SITE=true` es crítico para el flujo de pago**: la vuelta desde MP es una navegación full-page; el access token en memoria (Zustand) se pierde y `/checkout/resultado` depende de la refresh cookie (`SameSite=None; Secure`) para recuperar sesión y mostrar la orden. Sin esto, la página de resultado no puede cargar el pedido.

### Frontend (Vercel)

Solo `NEXT_PUBLIC_API_URL`. **`NEXT_PUBLIC_MP_PUBLIC_KEY` no se usa** — Checkout Pro por redirect no carga SDK JS. No agregarla (la mención en CLAUDE.md raíz no aplica a esta integración).

---

## MP_CLIENT_ID / MP_CLIENT_SECRET / MP_OAUTH_STATE

Se usan **solo** en `GET /api/payments/oauth/callback` (`payments.controller.ts:43-128`), el flujo one-shot para obtener el `MP_ACCESS_TOKEN` del dueño de Valplas. El pago normal no las toca: la preferencia usa `MP_ACCESS_TOKEN` y el webhook usa `MP_WEBHOOK_SECRET`. Si `MP_ACCESS_TOKEN` ya está cargado, las tres pueden quedar vacías (son opcionales en `env.ts:76-79`).

### Cómo funciona el flujo OAuth

1. El owner abre la URL de autorización en el browser:

   ```
   https://auth.mercadopago.com.ar/authorization?client_id={MP_CLIENT_ID}&response_type=code&platform_id=mp&state={MP_OAUTH_STATE}&redirect_uri={API_URL}/api/payments/oauth/callback
   ```

2. MP redirige al callback con `code` + `state`.
3. El backend valida `state === MP_OAUTH_STATE` (anti-CSRF) e intercambia el `code` por tokens usando `MP_CLIENT_ID` + `MP_CLIENT_SECRET`. En dev pide token de test (`test_token=true`); en prod (`NODE_ENV=production`) token real.
4. La respuesta HTML muestra `MP_ACCESS_TOKEN` y `MP_REFRESH_TOKEN` **una sola vez** → copiarlos a las variables de Railway y reiniciar el servicio.

### De dónde sale cada valor

| Variable           | Origen                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `MP_CLIENT_ID`     | [Panel MP → Tus integraciones](https://www.mercadopago.com.ar/developers/panel/app) → app (ej. `valplas-develop`) → **Credenciales** |
| `MP_CLIENT_SECRET` | Mismo lugar. Secret real: solo en env de Railway, nunca commitear                                                                    |
| `MP_OAUTH_STATE`   | Lo elegís vos: `openssl rand -hex 32`. Debe coincidir con el `state` de la URL de autorización                                       |

**Config del panel requerida**: en la app → **Redirect URLs** debe estar registrada exactamente `{API_URL}/api/payments/oauth/callback`, porque MP valida el `redirect_uri` en el intercambio.

### Cuándo usar OAuth vs copiar del panel

- **Test/develop**: más simple copiar el access token de "Credenciales de prueba" directo del panel. OAuth innecesario.
- **Producción**: OAuth tiene sentido si la cuenta vendedora real (owner) ≠ cuenta developer — el owner autoriza sin compartir su password. Si administrás la cuenta del owner, podés copiar las credenciales productivas del panel y saltear OAuth.

---

## Estado actual en el panel MP (verificado vía MCP)

- Apps existentes: `valplas-develop` (app_id `2941930681446091`, la que usa develop), `valplas-test` (`431380834504301`), `BackMP` (`3511699907248335`).
- Webhook develop configurado (topic `payment`) → `https://valplas-tienda-develop.up.railway.app/api/payments/webhook`.
- **Historial de notificaciones: vacío.** Sin evidencia de entregas recientes. Validar con un pago de prueba y re-consultar (`notifications_history` del MCP).

---

## Hallazgos

> **Estado (2026-07-05):** todos corregidos en `feature/add-mp` salvo el 3 (paso manual). Tests nuevos en `apps/api/src/tests/payments/`, `apps/api/src/tests/orders/` y `apps/api/src/tests/shared/`.

### ✅ 1. Carrito no se vacía tras el pago — RESUELTO

El carrito vive en una cookie HttpOnly. Ahora `POST /orders` la vacía en la misma respuesta que crea la orden (`order.controller.ts` → `clearCartCookie(res)`), y el front refresca el store con `loadFromStorage()` en el path sin redirect. Test: `order.controller.cart.test.ts`.

### ✅ 2. Stock reservado atrapado en órdenes abandonadas — RESUELTO

- La preferencia ahora expira: `expires: true` + `expiration_date_to` a 24h (`PAYMENT_EXPIRATION_HOURS` en `mercadopago.ts`).
- Job horario `cancel-stale-orders.job.ts` (node-cron, minuto 15) cancela órdenes `pending_payment` de MP con más de 25h (buffer de 1h para webhooks al filo). La transición a `cancelled` dispara el trigger que libera stock. Solo toca órdenes con `payment_method = 'mercadopago'`. Test: `cancel-stale-orders.test.ts`.

### ⏳ 3. Webhook sin evidencia de funcionamiento — PASO MANUAL PENDIENTE

Historial de notificaciones vacío en el panel. La lógica ya está cubierta por tests con firma HMAC real (`webhook.test.ts`), pero falta el pago de prueba end-to-end contra develop: pagar con tarjeta test → verificar orden en `payment_confirmed` → re-consultar `notifications_history`.

### ✅ 4. `refunded` / `charged_back` no mapeados — RESUELTO

`mapPaymentStatus` ahora mapea `refunded` y `charged_back` → orden `refunded` (válido desde `payment_confirmed` o `delivered`). Si la transición no es válida (ej: orden ya `processing`), no se pisa el estado y se loggea un warning para revisión manual.

### ✅ 5. Webhook bajo el rate limiter general — RESUELTO

`apiRateLimiter` ahora usa `skip: isMpWebhookRequest` (`rate-limit.middleware.ts`): `POST /payments/webhook` queda exento. El endpoint sigue protegido por la firma HMAC (400 rápido si no valida). Test: `rate-limit.test.ts`.

### ✅ 6. `payer.phone` con formato subóptimo — RESUELTO

El teléfono E.164 se parsea con `libphonenumber-js` y se envía el número nacional (sin `+54`) en `phone.number`; si no es parseable se omite el campo. Test: `preference.test.ts`.

### ✅ 7. Manifest de firma con campos faltantes — RESUELTO

`verifySignature` construye el manifest por partes y omite `id:`/`request-id:` cuando faltan, como especifican las docs de MP. `x-request-id` ya no es obligatorio para aceptar la notificación.

### ✅ 8. Sin test de integración del webhook real — RESUELTO

`webhook.test.ts`: 11 tests sobre `handleWebhook` con firmas HMAC reales — firma válida/inválida, replay (ts viejo), sin `x-request-id`, tipo no-payment, mapeo de todos los estados, idempotencia y transiciones inválidas.

> Nota: las suites preexistentes `purchase-flow.test.ts`, `order.service.test.ts`, `auth.service.test.ts` y `auth.basic.test.ts` estaban rotas de antes por tres causas: (1) el cleanup global borraba usuarios por `%test.com`, destruyendo los usuarios seed (`cliente@test.com`); (2) los archivos de test corrían en paralelo compartiendo DB y el cleanup de uno pisaba los datos de otro (races con FK en `refresh_tokens`); (3) llamaban APIs con firmas viejas (`createOrder(orderData)` vs `createOrder(userId, input)`, `verifyRefreshToken` inexistente, etc.). Se reescribieron el 2026-07-05: datos propios por test (`@vitest.local`, carriers `vitest-*`), cleanup scoped que no toca seeds (`setup.ts`), ejecución secuencial (`fileParallelism: false`) y helpers compartidos en `src/tests/helpers.ts`. Suite completa del API: 56/56 verde. Los tests de órdenes usan `payment_method: 'manual'` para no invocar a MercadoPago.

### ✅ 9. Dev local: webhook inalcanzable — MITIGADO

`createOrderPreference` ahora loggea un warning cuando la `notification_url` apunta a `localhost`/`127.0.0.1`. Sigue aplicando la regla operativa: probar pagos contra el deploy develop de Railway (o túnel).

---

## Checklist de calidad MP (cross-check contra el oficial)

| Ítem                                                             | Estado                                                   |
| ---------------------------------------------------------------- | -------------------------------------------------------- |
| `payer.email`, nombre, apellido                                  | ✅                                                       |
| `payer.identification` (DNI)                                     | ✅ opcional en checkout                                  |
| `payer.address`, `payer.phone`                                   | ✅ (teléfono mejorable, hallazgo 6)                      |
| Items: id, title, description, quantity, unit_price, category_id | ✅ (`description` = SKU; mejorable con descripción real) |
| `external_reference`                                             | ✅ order_number                                          |
| `notification_url` + validación de firma                         | ✅                                                       |
| Consulta del pago notificado (GET a la API)                      | ✅                                                       |
| `statement_descriptor`                                           | ✅ `VALPLAS`                                             |
| SDK backend oficial                                              | ✅ `mercadopago` npm                                     |
| SSL/TLS 1.2+                                                     | ✅ (Vercel/Railway)                                      |
| `device_id`                                                      | ✅ transparente en Checkout Pro                          |
| Logo MP + mensajes de resultado claros                           | ✅                                                       |
| SDK JS frontend / secure fields / `issuer_id`                    | N/A (Checkout Pro redirect)                              |
| Refunds API, cancellation API, `binary_mode`                     | ❌ pendiente (opcional, iteración futura)                |

---

## Pasos: test → producción

### Test (ahora)

1. Crear comprador de prueba (MCP `create_test_user`, site `MLA`, perfil `buyer`) o usar uno existente.
2. Pago de prueba contra develop con tarjetas test (titular `APRO` aprueba, `OTHE` rechaza).
3. Verificar: orden pasa a `payment_confirmed`, historial de notificaciones deja de estar vacío.
4. Correr `quality_evaluation` (MCP) con el `payment_id` del test (debe tener ≤7 días).

### Producción

1. ~~Resolver hallazgos 🔴1 y 🟠2~~ ✅ resueltos (2026-07-05).
2. App productiva (recomendado: dedicada, secrets separados de develop) o credenciales productivas de la existente.
3. `MP_ACCESS_TOKEN` real: OAuth callback en prod (owner autoriza) o copiar del panel.
4. Webhook **modo productivo** en el panel → URL prod + nuevo `MP_WEBHOOK_SECRET`.
5. Env prod en Railway: `API_URL` (sin `/api`), `FRONTEND_URL=https://valplas.net`, `ALLOWED_ORIGINS` explícitos (sin wildcards), `COOKIE_CROSS_SITE=true`, `NODE_ENV=production`.
6. Homologación: `form_homologation` (producto Checkout Pro, `product_id` 21) + pago real chico end-to-end.
7. Probar un reembolso manual desde el panel y verificar el impacto en la orden (hallazgo 4).

---

## Referencias

- Código: `apps/api/src/infrastructure/external/mercadopago.ts`, `apps/api/src/modules/payments/`, `apps/web/src/components/checkout/`, `apps/web/src/app/(public)/checkout/resultado/page.tsx`
- Docs MP: [Checkout Pro](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/landing) · [Validar firma de webhooks](https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks) · [Tarjetas de prueba](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/additional-content/your-integrations/test/cards)
- Relacionados: `docs/RAILWAY_DEPLOY.md`, `docs/VERCEL_DEPLOY.md`, `docs/SECURITY.md`
