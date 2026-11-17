# API del bot de WhatsApp (canal WSP)

Contrato entre la API de Valplas y el bot de WhatsApp, que corre como servicio aparte. El bot consulta
productos, stock y precios, identifica al cliente por su teléfono, cotiza el envío, crea la orden y le
manda al cliente el link de pago de Mercado Pago. La API le avisa al bot por webhook cuando cambia el
estado de una orden.

Las órdenes del bot tienen número `WSP-YYYYMMDD-NNNNNN` y `salesChannel = "whatsapp"`. Precio, stock,
envío y pago salen de los mismos servicios que usa el checkout web.

| Ambiente | Base URL                                                |
| -------- | ------------------------------------------------------- |
| Local    | `http://localhost:3001/api/bot`                         |
| Develop  | `https://valplas-tienda-develop.up.railway.app/api/bot` |

Swagger: `GET /api/docs`, tag **Bot**.

---

## 1. Autenticación

Mandá el header `X-Api-Key: <key>` en todos los requests. El equipo de Valplas te pasa la key por un
canal privado.

- La key es solo para server-to-server: no la pongas en un cliente web ni la loguees.
- **Rotación:** la API acepta varias keys a la vez (variable `BOT_API_KEYS`). Se agrega la nueva, el bot
  pasa a usarla y después se da de baja la vieja, sin cortar el servicio.
- Sin key o con una key inválida: `401 INVALID_API_KEY`. Si la API del bot está deshabilitada en ese
  ambiente: `503 BOT_API_DISABLED`.
- No uses cookies ni token CSRF: estas rutas no los usan.

## 2. Convenciones

- **Requests en `snake_case`, respuestas en `camelCase`**: se manda `customer_id`, se recibe `customerId`.
- **Respuesta exitosa:** `{ "success": true, "data": … }`
- **Respuesta paginada:**
  `{ "success": true, "data": [ … ], "pagination": { "page", "limit", "total", "totalPages", "hasMore" } }`.
  Se pagina con `page` (desde 1) y `limit` (hasta 50; por defecto 10).
- **Error:** `{ "success": false, "error": { "code", "message", "details"? } }`. Lógica del bot sobre
  `code`, nunca sobre `message` (el texto puede cambiar). Ver la [tabla de errores](#9-errores).
- **Montos:** números en pesos argentinos (ARS) con hasta 2 decimales. Ej: `12450.5` = $12.450,50.
- **Teléfonos:** E.164 (`+5491122334455`). La API también acepta el `wa_id` de WhatsApp tal cual llega
  (`5491122334455`, sin `+`).
- **Fechas:** ISO 8601 en UTC (`2026-11-16T18:30:00.000Z`).
- **Validación:** un body o query inválido devuelve
  `400 VALIDATION_ERROR` con `details.issues: [{ path, message }]`.

## 3. Flujo recomendado

```
Cliente (WhatsApp)        Bot                                API Valplas                     Mercado Pago
       |  "hola"           |                                      |                                |
       |------------------>| POST /customers {phone, first_name}  |                                |
       |                   |------------------------------------->| busca por teléfono o crea      |
       |                   | GET /customers/:id/addresses         |                                |
       |                   |------------------------------------->|                                |
       |  "bolsas 40x50"   | GET /catalog/products?search=…       |                                |
       |------------------>|------------------------------------->|                                |
       |  elige y cantidad | (carrito en el estado del bot)       |                                |
       |                   | POST /quote {items, address}         |                                |
       |                   |------------------------------------->| precios, stock, envíos         |
       |  confirma         | POST /orders {…, idempotency_key}    |                                |
       |------------------>|------------------------------------->| crea WSP-…, reserva stock ---->| preferencia
       |  link de pago     |<------------------ { order, paymentUrl }                              |
       |<------------------|                                      |                                |
       |  paga ------------------------------------------------------------------------------------>|
       |                   |                                      |<----------- webhook de pago ---|
       |                   |<--- webhook order.status_changed ----| (payment_confirmed, processing)|
       |  "¡pago recibido!"|                                      |                                |
       |<------------------|                                      |                                |
```

1. **Identificar al cliente:** `POST /customers` con el `wa_id` y el nombre del perfil de WhatsApp. Si el
   teléfono ya existe (web, CRM o una charla anterior) devuelve ese cliente. Si no, lo crea. Guardá el
   `customer.id` en la sesión del bot.
2. **Dirección de envío:** `GET /customers/:id/addresses`. Si no tiene ninguna, o quiere otra, pedile los
   datos y creala con `POST /customers/:id/addresses`. `isDeliverable: false` = no llegamos a ese código
   postal.
3. **Catálogo:** `GET /catalog/products?search=…` (o por `category_id`). Mostrá las **presentaciones**
   de cada producto (ver §4).
4. **Carrito:** lo guarda el bot. La API no tiene carrito para este canal.
5. **Cotizar:** `POST /quote` con los ítems y la dirección. Devuelve precio actual, stock por línea y las
   opciones de envío con su costo. El cliente elige una.
6. **Crear la orden:** `POST /orders` con una `idempotency_key` (ver §6). Devuelve la orden y el
   `paymentUrl` de Mercado Pago.
7. **Pago:** mandá el `paymentUrl`. Cuando Mercado Pago confirma, la API te avisa por webhook (§7).
8. **Postventa:** `GET /orders/:orderNumber` para el estado. Si el cliente perdió el link,
   `POST /orders/:orderNumber/payment-link`. Si quiere cancelar antes de pagar,
   `POST /orders/:orderNumber/cancel`.

## 4. Presentaciones y bultos

Un producto se vende en una o más **presentaciones**. Cada una tiene una lista de precios y un tamaño de
bulto (`bundleSize`): por ejemplo, unidad suelta (1) o pack de 12.

```json
"presentations": [
  { "priceListId": "6b1f…", "bundleSize": 1,  "unitPrice": 1240,   "bundlePrice": 1240,  "availableBundles": 300 },
  { "priceListId": "a92c…", "bundleSize": 12, "unitPrice": 1100.5, "bundlePrice": 13206, "availableBundles": 25 }
]
```

- En los ítems (`/quote` y `/orders`), **`quantity` es la cantidad de bultos** de la presentación elegida,
  no de unidades. 3 packs de 12 = `quantity: 3` con el `price_list_id` del pack.
- **`price_list_id` es obligatorio.** Si la lista no corresponde a ese producto, la API responde
  `PRICE_TIER_NOT_FOUND`.
- Un producto con `purchasable: false` no tiene presentaciones y no se puede pedir por el bot.
- `availableBundles` = stock disponible ÷ `bundleSize`. El stock real se valida al crear la orden.
- El catálogo solo lista productos activos **con stock**.

## 5. Endpoints

### Catálogo

#### `GET /catalog/categories`

Árbol de categorías activas.

```json
{ "success": true, "data": { "categories": [
  { "id": "…", "name": "Bolsas y Films", "slug": "bolsas-y-films", "children": [ … ] }
] } }
```

#### `GET /catalog/products`

| Query           | Tipo                                                                          | Descripción                                  |
| --------------- | ----------------------------------------------------------------------------- | -------------------------------------------- |
| `search`        | string                                                                        | Busca en nombre (sin importar acentos) o SKU |
| `category_id`   | uuid                                                                          | Filtra por categoría                         |
| `brand_id`      | uuid                                                                          | Filtra por marca                             |
| `sort`          | `featured` · `price_asc` · `price_desc` · `name_asc` · `name_desc` · `newest` | Orden. Default `featured`                    |
| `page`, `limit` | int                                                                           | Paginación (`limit` ≤ 50)                    |

```json
{
  "success": true,
  "data": [
    {
      "id": "3f6c…",
      "sku": "BOL-4050-T",
      "name": "Bolsa Camiseta 40x50 Transparente",
      "slug": "bolsa-camiseta-40x50-transparente",
      "imageUrl": "https://…/bolsa.webp",
      "availableStock": 3600,
      "category": { "id": "…", "name": "Bolsas y Films" },
      "brand": { "id": "…", "name": "Valplas" },
      "purchasable": true,
      "presentations": [
        {
          "priceListId": "6b1f…",
          "bundleSize": 100,
          "unitPrice": 12.4,
          "bundlePrice": 1240,
          "availableBundles": 36
        }
      ]
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 12, "totalPages": 2, "hasMore": true }
}
```

#### `GET /catalog/products/:id`

El mismo objeto, con precio y stock actuales. Devuelve `404 PRODUCT_NOT_FOUND` si el producto no existe,
está inactivo o fue borrado. Este endpoint sí devuelve productos sin stock (`availableStock: 0`).

### Clientes

#### `POST /customers`: buscar o crear por teléfono

```json
{ "phone": "5491122334455", "first_name": "Juan", "last_name": "Pérez", "email": "juan@mail.com" }
```

`last_name` y `email` son opcionales.

- **200** `{ customer, created: false }`: el teléfono ya existía. **No se modifica ningún dato** del
  cliente (ni el nombre que mandaste).
- **201** `{ customer, created: true }`: cliente nuevo.

```json
{
  "success": true,
  "data": {
    "customer": {
      "id": "9d2e…",
      "firstName": "Juan",
      "lastName": "Pérez",
      "phone": "+5491122334455",
      "email": null
    },
    "created": true
  }
}
```

La búsqueda compara el **número nacional**, sin importar cómo esté guardado: `+5491122334455` encuentra
a un cliente cargado como `+541122334455`, `1122334455`, `11 2233-4455` u `011 15 2233-4455`. Si un
mismo número aparece en más de una cuenta, se usa la que tiene el número idéntico. El admin recibe una
sugerencia para unificar las cuentas.

Errores: `400 INVALID_PHONE`, `403 CUSTOMER_INACTIVE`, `409 EMAIL_IN_USE` (el email es de otra cuenta:
reintentá sin email), `409 PHONE_IN_USE` (el número es de una cuenta del staff).

> Los clientes creados por el bot no tienen contraseña. Pueden entrar a la web con Google usando el
> mismo email, o el admin les completa los datos.

#### `GET /customers/by-phone/:phone`

Solo busca, no crea. Devuelve `{ customer }` o `404 CUSTOMER_NOT_FOUND`.

#### `GET /customers/:id/addresses`

Direcciones activas, paginadas.

```json
{
  "success": true,
  "data": [
    {
      "id": "…",
      "alias": "Casa",
      "street": "Av. Corrientes",
      "streetNumber": "1234",
      "floor": "3",
      "apartment": "B",
      "city": "CABA",
      "province": "CABA",
      "postcode": "1043",
      "notes": null,
      "isDefault": true,
      "isDeliverable": true
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 1, "totalPages": 1, "hasMore": false }
}
```

#### `POST /customers/:id/addresses`

```json
{
  "alias": "Casa",
  "street": "Av. Corrientes",
  "street_number": "1234",
  "floor": "3",
  "apartment": "B",
  "city": "CABA",
  "province": "CABA",
  "postcode": "1043",
  "notes": "Timbre roto, llamar",
  "is_default": true
}
```

- Obligatorios: `street`, `street_number`, `city`, `province`, `postcode` (4 a 8 dígitos).
- `alias` es opcional (default `"WhatsApp"`). La primera dirección del cliente queda como default.
- `province` tiene que ser una de: Buenos Aires, CABA, Catamarca, Chaco, Chubut, Córdoba, Corrientes,
  Entre Ríos, Formosa, Jujuy, La Pampa, La Rioja, Mendoza, Misiones, Neuquén, Río Negro, Salta, San Juan,
  San Luis, Santa Cruz, Santa Fe, Santiago del Estero, Tierra del Fuego, Tucumán.

Responde **201** `{ address }`. La dirección se guarda aunque no tengamos envío a ese código postal
(`isDeliverable: false`).

#### `GET /customers/:id/orders`

Órdenes del cliente en todos los canales (web, WhatsApp, CRM), las más recientes primero.

```json
{
  "id": "…",
  "orderNumber": "WSP-20261116-000123",
  "status": "processing",
  "statusLabel": "Procesando",
  "salesChannel": "whatsapp",
  "total": 170500,
  "createdAt": "2026-11-16T18:30:00.000Z"
}
```

### Cotización

#### `POST /quote`

Calcula precio, stock y envío **sin crear nada ni reservar stock**.

```json
{
  "customer_id": "9d2e…",
  "shipping_address_id": "51aa…",
  "items": [{ "product_id": "3f6c…", "price_list_id": "6b1f…", "quantity": 3 }]
}
```

- Para cotizar el envío mandá `shipping_address_id` (requiere `customer_id`) o solo `postcode`. Sin
  ninguno de los dos, `shipping` vuelve `null`.
- Máximo 50 ítems.

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "productId": "3f6c…",
        "productName": "Bolsa Camiseta 40x50 Transparente",
        "productSku": "BOL-4050-T",
        "priceListId": "6b1f…",
        "quantity": 3,
        "bundleSize": 100,
        "units": 300,
        "bundlePrice": 1240,
        "subtotal": 3720,
        "availableStock": 3600
      }
    ],
    "problems": [],
    "subtotal": 3720,
    "orderable": true,
    "shipping": {
      "postcode": "1043",
      "options": [
        {
          "carrierId": "c0ff…",
          "carrierName": "Moto Valplas",
          "price": 1500,
          "estimatedDays": "1-2 días",
          "total": 5220
        }
      ],
      "error": null
    }
  }
}
```

- **`orderable: false`** = hay `problems`. Mostrale al cliente qué pasa y ajustá el carrito antes de crear
  la orden. Cada problema tiene `code` y datos del ítem:
  - `PRODUCT_NOT_FOUND` `{ productId }`
  - `PRODUCT_UNAVAILABLE` `{ productId, productName }`
  - `PRICE_TIER_NOT_FOUND` `{ productId, productName, priceListId }`
  - `INSUFFICIENT_STOCK` `{ productId, productName, available, requested }`. `available` y
    `requested` están en **unidades**, no en bultos.
- **`shipping.error`** = no hay envío para ese código postal o ese monto (`POSTCODE_NOT_COVERED`,
  `NO_SHIPPING_ZONES`, `SHIPPING_UNAVAILABLE`). Los precios de los ítems igual son válidos.
- `options[].total` = subtotal + envío. El precio puede cambiar entre la cotización y la orden: el total
  que se cobra es el de la orden.

### Órdenes y pago

#### `POST /orders`

```json
{
  "customer_id": "9d2e…",
  "shipping_address_id": "51aa…",
  "shipping_carrier_id": "c0ff…",
  "items": [{ "product_id": "3f6c…", "price_list_id": "6b1f…", "quantity": 3 }],
  "notes": "Entregar después de las 14",
  "idempotency_key": "5491122334455:cart-8f2a"
}
```

- El medio de pago es siempre Mercado Pago. `shipping_carrier_id` sale de `quote.shipping.options`.
- La orden queda en `pending_payment` y **reserva el stock** hasta que se paga, se cancela o vence.

**201**: orden creada.

```json
{
  "success": true,
  "data": {
    "order": {
      "id": "…",
      "orderNumber": "WSP-20261116-000123",
      "status": "pending_payment",
      "statusLabel": "Pendiente de pago",
      "salesChannel": "whatsapp",
      "subtotal": 3720,
      "shippingCost": 1500,
      "total": 5220,
      "carrierName": "Moto Valplas",
      "paymentMethod": "mercadopago",
      "createdAt": "2026-11-16T18:30:00.000Z",
      "updatedAt": "2026-11-16T18:30:00.000Z",
      "shippingAddress": {
        "street": "Av. Corrientes",
        "streetNumber": "1234",
        "floor": "3",
        "apartment": "B",
        "city": "CABA",
        "province": "CABA",
        "postcode": "1043"
      },
      "items": [
        {
          "productId": "3f6c…",
          "productName": "Bolsa Camiseta 40x50 Transparente",
          "productSku": "BOL-4050-T",
          "quantity": 3,
          "bundleSize": 100,
          "bundlePrice": 1240,
          "subtotal": 3720
        }
      ]
    },
    "paymentUrl": "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=…",
    "created": true
  }
}
```

- **`paymentUrl: null`**: la orden se creó pero Mercado Pago no respondió. No vuelvas a crear la orden:
  pedí el link con `POST /orders/:orderNumber/payment-link`.
- **200** con `created: false`: reintento con una `idempotency_key` ya usada (§6).

Errores: `400 INVALID_SHIPPING_ADDRESS` (la dirección no es del cliente o está inactiva),
`400 INVALID_CARRIER`, `400 PRODUCT_NOT_FOUND`, `400 PRODUCT_UNAVAILABLE`, `400 PRICE_TIER_NOT_FOUND`,
`400 POSTCODE_NOT_COVERED`, `400 SHIPPING_RATE_NOT_FOUND`, `409 INSUFFICIENT_STOCK`,
`409 IDEMPOTENCY_KEY_CONFLICT`, `404 CUSTOMER_NOT_FOUND`, `403 CUSTOMER_INACTIVE`.

#### `GET /orders/:orderNumber?customer_id=…`

Estado y detalle (el mismo objeto `order`). Si la orden no existe o es de otro cliente:
`404 ORDER_NOT_FOUND`.

#### `POST /orders/:orderNumber/payment-link`

```json
{ "customer_id": "9d2e…" }
```

Genera un link nuevo para una orden `pending_payment`. El link vence a las 24 h de **creada la orden**,
no del link.

```json
{
  "success": true,
  "data": {
    "orderNumber": "WSP-20261116-000123",
    "paymentUrl": "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=…",
    "expiresAt": "2026-11-17T18:30:00.000Z"
  }
}
```

Errores:

- `409 ORDER_NOT_PAYABLE`: ya está paga, cancelada o no es de Mercado Pago.
- `409 ORDER_PAYMENT_EXPIRED`: pasaron 24 h. La orden se cancela sola; ofrecé armar una nueva.
- `502 PAYMENT_PROVIDER_ERROR`: Mercado Pago no respondió. Reintentá en unos minutos.

#### `POST /orders/:orderNumber/cancel`

```json
{ "customer_id": "9d2e…", "reason": "Se equivocó de producto" }
```

Cancela una orden **pendiente de pago** y libera el stock reservado. Devuelve `{ order }` con
`status: "cancelled"`. Si la orden ya está paga: `409 ORDER_NOT_CANCELLABLE` (las devoluciones las
gestiona el equipo de Valplas).

## 6. Idempotencia

WhatsApp y las redes reintentan: un mismo "confirmar" puede llegar dos veces. `POST /orders` exige
`idempotency_key` (8 a 100 caracteres: letras, números y `_ - : .`).

- Generá una clave **por intento de compra**, estable entre reintentos. Ej: `"<wa_id>:<id del carrito>"`.
  Cambiala cuando el cliente arma un carrito nuevo.
- Misma clave y mismo cliente: **200** con la orden original (`created: false`) y un `paymentUrl` vigente
  si sigue pendiente. No se crea otra orden ni se reserva stock de nuevo.
- Misma clave con otro cliente: `409 IDEMPOTENCY_KEY_CONFLICT`.

## 7. Webhook saliente (API → bot)

Cuando cambia el estado de una orden **WSP**, la API hace `POST` a la URL que configure el bot
(`BOT_WEBHOOK_URL`). Cubre los cambios que vienen de Mercado Pago, del admin, de la cancelación automática
y de `/cancel`.

**Headers**

| Header                 | Valor                                           |
| ---------------------- | ----------------------------------------------- |
| `Content-Type`         | `application/json`                              |
| `X-Valplas-Event-Id`   | UUID del evento (igual en todos los reintentos) |
| `X-Valplas-Event-Type` | `order.status_changed`                          |
| `X-Valplas-Signature`  | `t=<unix seconds>,v1=<hex HMAC-SHA256>`         |

**Body**

```json
{
  "id": "0b7e…",
  "type": "order.status_changed",
  "occurredAt": "2026-11-16T18:42:10.123Z",
  "data": {
    "orderNumber": "WSP-20261116-000123",
    "status": "payment_confirmed",
    "statusLabel": "Pago confirmado",
    "previousStatus": "pending_payment",
    "total": 5220,
    "customer": { "id": "9d2e…", "phone": "+5491122334455", "firstName": "Juan" }
  }
}
```

**Verificar la firma (obligatorio).** Calculá el HMAC sobre `"<t>.<body crudo>"` con el secreto
compartido (`BOT_WEBHOOK_SECRET`) **antes** de parsear el JSON:

```js
import crypto from 'node:crypto';

// rawBody: el body tal cual llegó (string/Buffer). Con Express: express.raw({ type: 'application/json' })
export function verifyValplasSignature(rawBody, signatureHeader, secret, toleranceSeconds = 300) {
  const match = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(signatureHeader ?? '');
  if (!match) return false;
  const [, t, v1] = match;
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSeconds) return false; // replay
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(v1, 'hex'), Buffer.from(expected, 'hex'));
}
```

**Reintentos y orden**

- Respondé **2xx en menos de 5 s** y procesá en segundo plano. Cualquier otra respuesta o un timeout se
  reintenta: 30 s, 2 min, 10 min, 30 min, 2 h, 6 h, 6 h (8 intentos en total, ~15 h). Después el evento se
  descarta.
- La entrega es **al menos una vez**: deduplicá por `id`.
- Un reintento puede llegar después de un evento más nuevo de la misma orden. Quedate con el de
  `occurredAt` más reciente, o consultá `GET /orders/:orderNumber` ante la duda.
- Hay una demora de hasta ~15 s entre el cambio de estado y el envío.

**Estados**

| `status`            | Significado                                                            | Mensaje sugerido                          |
| ------------------- | ---------------------------------------------------------------------- | ----------------------------------------- |
| `pending_payment`   | Esperando pago                                                         | –                                         |
| `payment_confirmed` | Mercado Pago aprobó el pago                                            | "¡Recibimos tu pago!"                     |
| `processing`        | En preparación (llega justo después de `payment_confirmed`)            | –                                         |
| `ready_to_ship`     | Listo para despachar                                                   | –                                         |
| `shipped`           | En camino                                                              | "Tu pedido está en camino"                |
| `delivered`         | Entregado                                                              | –                                         |
| `failed`            | Pago rechazado                                                         | Ofrecer otro intento con un carrito nuevo |
| `cancelled`         | Cancelado (por el cliente, el admin o vencimiento a las 25 h sin pago) | –                                         |
| `refunded`          | Reembolsado                                                            | –                                         |

## 8. Pago con Mercado Pago

- El link (`paymentUrl`) abre el Checkout Pro de Mercado Pago. Al terminar, el comprador vuelve a la URL
  configurada en `BOT_PAYMENT_RETURN_URL` (en general, el link `wa.me` del bot).
- El link vence a las **24 h** de creada la orden. A las **25 h** sin pago, la orden se cancela sola y
  libera el stock (te llega `cancelled` por webhook).
- **No confirmes el pago por la vuelta del comprador** (puede volver sin pagar). La confirmación es el
  webhook `payment_confirmed`.

## 9. Errores

| HTTP | `code`                                                                   | Qué hacer                                                                                                      |
| ---- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`                                                       | Bug del bot: revisar `details.issues`                                                                          |
| 400  | `INVALID_PHONE`                                                          | Teléfono no válido para Argentina                                                                              |
| 400  | `INVALID_SHIPPING_ADDRESS`                                               | La dirección no es del cliente o está inactiva                                                                 |
| 400  | `INVALID_CARRIER`                                                        | Volver a cotizar y elegir otra opción de envío                                                                 |
| 400  | `PRODUCT_NOT_FOUND` / `PRODUCT_UNAVAILABLE`                              | Sacar el producto del carrito                                                                                  |
| 400  | `PRICE_TIER_NOT_FOUND`                                                   | Presentación inválida: refrescar el producto                                                                   |
| 400  | `POSTCODE_NOT_COVERED` / `NO_SHIPPING_ZONES` / `SHIPPING_RATE_NOT_FOUND` | No hay envío: ofrecer otra dirección o un asesor                                                               |
| 401  | `INVALID_API_KEY`                                                        | Revisar la key                                                                                                 |
| 403  | `CUSTOMER_INACTIVE`                                                      | Derivar a un asesor                                                                                            |
| 404  | `CUSTOMER_NOT_FOUND`                                                     | Volver a identificar con `POST /customers`: el admin puede haber unificado cuentas y cambiado el `customer.id` |
| 404  | `ORDER_NOT_FOUND` / `PRODUCT_NOT_FOUND`                                  | No existe o no es de ese cliente                                                                               |
| 409  | `INSUFFICIENT_STOCK`                                                     | Bajar la cantidad (ver `quote`)                                                                                |
| 409  | `IDEMPOTENCY_KEY_CONFLICT`                                               | Generar una clave nueva                                                                                        |
| 409  | `EMAIL_IN_USE` / `PHONE_IN_USE`                                          | Crear el cliente sin email / derivar a un asesor                                                               |
| 409  | `ORDER_NOT_PAYABLE` / `ORDER_PAYMENT_EXPIRED` / `ORDER_NOT_CANCELLABLE`  | Informar el estado; ofrecer una orden nueva si corresponde                                                     |
| 429  | `RATE_LIMIT_EXCEEDED`                                                    | Esperar y reintentar con backoff                                                                               |
| 502  | `PAYMENT_PROVIDER_ERROR`                                                 | Reintentar el link en unos minutos                                                                             |
| 503  | `BOT_API_DISABLED`                                                       | La API del bot no está habilitada en ese ambiente                                                              |
| 500  | `INTERNAL_ERROR`                                                         | Reintentar con backoff; si persiste, avisar al equipo de Valplas                                               |

## 10. Límites

- **600 requests por minuto** por IP para todo `/api/bot`. Al pasarte, `429 RATE_LIMIT_EXCEEDED` (header
  `RateLimit` con el tiempo restante).
- Búsquedas: `limit` hasta 50 por página. `quote` y `orders`: hasta 50 ítems.

## 11. Pruebas en develop

- Mercado Pago está en modo sandbox: pagá con un **usuario de prueba comprador** y las tarjetas de
  prueba de la documentación de Checkout Pro de Mercado Pago. Con el titular `APRO` el pago se aprueba y
  con `OTHE` se rechaza.
- Para recibir webhooks en local, exponé el bot con un túnel (ngrok, cloudflared) y pasale la URL al
  equipo de Valplas para configurar `BOT_WEBHOOK_URL` en develop.
- Secuencia mínima de humo:
  1. `POST /customers` → `POST /customers/:id/addresses`
  2. `GET /catalog/products?search=bolsa` → `POST /quote`
  3. `POST /orders` → pagar con `APRO`
  4. Webhooks `payment_confirmed` y `processing`

## 12. Notas para el equipo de Valplas

- **Variables de la API:** `BOT_API_KEYS`, `BOT_PAYMENT_RETURN_URL`, `BOT_WEBHOOK_URL` y
  `BOT_WEBHOOK_SECRET` (ver `apps/api/.env.example`).
- **Datos:** `orders.sales_channel` (`web` · `admin` · `whatsapp` · `legacy`) para reportes por canal;
  `orders.client_reference` guarda la `idempotency_key`; `users.signup_channel = 'whatsapp'` marca los
  clientes que creó el bot.
- **Duplicados:** `/admin/usuarios/duplicados` sugiere unificar un cliente del bot con su cuenta del CRM
  cuando coinciden el teléfono (en cualquier formato) o la dirección.
- **Teléfonos:** la comparación usa `phone_match_key()` (migración 052): número nacional de 10 dígitos,
  con o sin `+54`, 9 de móvil, 0 troncal o el 15 de AMBA. No resuelve el 15 de áreas del interior
  (`351 15 1234567`) ni números de 8 dígitos sin código de área. Para dejar todo en E.164 (y cubrir
  esos casos), desde `apps/api`: `npx tsx src/infrastructure/database/scripts/normalize-phones.ts`
  (dry-run), revisá el reporte y corré con `--apply`.
- **Outbox:** `outbound_webhook_events` (pendientes: `delivered_at IS NULL AND failed_at IS NULL`). Los
  eventos de más de 30 días se borran solos.
