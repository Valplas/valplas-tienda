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
- **Strings:** todos los strings que recibe la API se normalizan en el servidor (se recortan los
  espacios al principio y al final), excepto las contraseñas.
- **Textos listos:** los campos `summary`, `label` y `description` de catálogo y cotización vienen
  redactados y con los montos formateados (`$46.980`, `$5.872,50`). Mostralos tal cual en lugar de
  componerlos. Los campos numéricos siguen siendo la fuente para cálculos.

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
bulto (`bundleSize`, en unidades): por ejemplo, el paquete suelto (1) o un bulto de 10 paquetes. La
presentación de menor `bundleSize` es la **base** (la unidad de venta del producto) y las demás son bultos.

```json
"unit": { "label": "paquete", "contains": { "quantity": 100, "of": "bolsas" } },
"presentations": [
  {
    "priceListId": "6b1f…", "bundleSize": 1, "unitPrice": 5872.5, "bundlePrice": 5872.5,
    "availableBundles": 240,
    "label": "Paquete", "contains": "100 bolsas", "savingsPercent": 0,
    "description": "Paquete de 100 bolsas: $5.872,50"
  },
  {
    "priceListId": "a92c…", "bundleSize": 10, "unitPrice": 4698, "bundlePrice": 46980,
    "availableBundles": 24,
    "label": "Bulto", "contains": "10 paquetes (1.000 bolsas)", "savingsPercent": 20,
    "description": "Bulto de 10 paquetes (1.000 bolsas): $46.980 ($4.698 c/paquete, 20% menos)"
  }
]
```

| Campo            | Descripción                                                                                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit`           | Producto: unidad de venta (`label`) y qué trae cada una (`contains`). `null` si el producto no los define. Si solo se cargó el contenido, `label` vale `"unidad"` |
| `summary`        | Producto: texto listo con todas las presentaciones (`"<nombre> viene en: <descripción>; <descripción>"`). `null` si no tiene                                      |
| `unitPrice`      | Precio por **unidad** (la unidad de venta) en esa presentación                                                                                                    |
| `bundlePrice`    | Precio del bulto completo = `unitPrice × bundleSize`                                                                                                              |
| `label`          | Nombre de la presentación (`"Paquete"`, `"Bulto"`, `"Bulto x12"`). Lo define Valplas; nunca es `null`                                                             |
| `contains`       | Qué trae el bulto (`"10 paquetes (1.000 bolsas)"`). `null` si no hay datos de la unidad                                                                           |
| `savingsPercent` | Ahorro por unidad frente a la presentación base, en puntos enteros (la base y los empates dan 0)                                                                  |
| `description`    | Texto listo para mostrar con nombre, contenido, precio y ahorro                                                                                                   |

**Cómo responder "¿cómo viene X?"**: mostrá `summary` (todo el producto) o el `description` de la
presentación que corresponda. **No compongas los textos vos**: los montos, los plurales y los porcentajes
ya vienen formateados y pueden cambiar de fórmula sin aviso. Si un campo de texto es `null`, omitilo.

Ejemplo de `GET /catalog/products/:id`:

```json
{
  "success": true,
  "data": {
    "product": {
      "id": "3f6c…",
      "sku": "BOL-6090-N",
      "name": "Bolsa Residuo 60x90 Negra",
      "slug": "bolsa-residuo-60x90-negra",
      "imageUrl": "https://…/bolsa-residuo.webp",
      "availableStock": 240,
      "inStock": true,
      "category": { "id": "…", "name": "Bolsas y Films" },
      "brand": { "id": "…", "name": "Valplas" },
      "purchasable": true,
      "unit": { "label": "paquete", "contains": { "quantity": 100, "of": "bolsas" } },
      "summary": "Bolsa Residuo 60x90 Negra viene en: Paquete de 100 bolsas: $5.872,50; Bulto de 10 paquetes (1.000 bolsas): $46.980 ($4.698 c/paquete, 20% menos)",
      "presentations": [
        {
          "priceListId": "6b1f…",
          "bundleSize": 1,
          "unitPrice": 5872.5,
          "bundlePrice": 5872.5,
          "availableBundles": 240,
          "label": "Paquete",
          "contains": "100 bolsas",
          "savingsPercent": 0,
          "description": "Paquete de 100 bolsas: $5.872,50"
        },
        {
          "priceListId": "a92c…",
          "bundleSize": 10,
          "unitPrice": 4698,
          "bundlePrice": 46980,
          "availableBundles": 24,
          "label": "Bulto",
          "contains": "10 paquetes (1.000 bolsas)",
          "savingsPercent": 20,
          "description": "Bulto de 10 paquetes (1.000 bolsas): $46.980 ($4.698 c/paquete, 20% menos)"
        }
      ]
    }
  }
}
```

### Cómo pedir: por presentación o por unidades

Cada ítem de `/quote` y `/orders` tiene **uno de dos formatos**, y no se pueden mezclar **dentro de un
mismo ítem** (un ítem con `units` y `price_list_id` a la vez responde `400 VALIDATION_ERROR`). Entre
ítems distintos sí se pueden combinar.

| Formato                                               | Significado                                                                                                                                                |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ product_id, price_list_id, quantity }` (histórico) | `quantity` = cantidad de **bultos** de esa presentación (3 bultos de 10 = `quantity: 3`). `price_list_id` obligatorio. Sigue funcionando igual que siempre |
| `{ product_id, units }` (nuevo)                       | `units` = unidades de venta (1 a 100000). El servidor elige la combinación **exacta más barata** de presentaciones                                         |

- Con `units`, la API reparte las unidades en presentaciones sin pasarse ni quedarse corta. Pedir 12
  paquetes cuesta 1 bulto de 10 + 2 paquetes (no 12 paquetes sueltos).
- Si el mismo producto aparece en varios ítems `units`, se planifican **juntos** (suma de unidades): el
  desglose completo va en el primero y los demás vuelven con `mergedInto` (ver `requested` en §5).
- Si no existe una combinación exacta (por ejemplo, el producto solo se vende en bultos de 10 y el cliente
  pide 12), la API responde `UNITS_NOT_ACHIEVABLE` con las cantidades alcanzables más cercanas
  (`nearestBelow` y `nearestAbove`): ofrecele esas.
- Las presentaciones cuya lista de precios está repetida en el mismo producto no entran en el armado por
  unidades (el precio se resuelve por producto y lista, y sería ambiguo). Es una situación de datos que el
  admin ya no puede cargar; si un producto quedó así y no queda ninguna presentación utilizable, la
  respuesta es `PRICE_TIER_NOT_FOUND`.
- **Cotizar y ordenar cobran lo mismo**: `/quote` y `/orders` arman las presentaciones con la misma
  función. Si entre ambos pasos cambiaron las presentaciones del producto y el plan ya no coincide con lo
  que se cobraría, `/orders` responde `409 UNITS_PLAN_MISMATCH` (nunca cobra otra cantidad): volvé a
  cotizar y mostrale el nuevo total al cliente.

### Reglas generales

- En el formato por presentación, **`price_list_id` es obligatorio**. Si la lista no corresponde a ese
  producto, la API responde `PRICE_TIER_NOT_FOUND`.
- Un producto con `purchasable: false` no se puede pedir por el bot: o no tiene presentaciones, o no tiene
  stock (`availableStock` es 0).
- `availableBundles` = stock disponible ÷ `bundleSize`. El stock real se valida al crear la orden.
- Por defecto el catálogo solo lista productos activos **con stock**. Con `include_out_of_stock=true`
  también lista los agotados (ver `GET /catalog/products`).
- **Cambio de contrato:** `purchasable` ahora es `true` solo si el producto tiene presentaciones **y**
  `availableStock > 0`. Antes, un producto agotado devuelto por `GET /catalog/products/:id` decía
  `purchasable: true`. Es el único cambio de significado; el resto de los campos nuevos (`unit`,
  `summary`, y `label`, `contains`, `savingsPercent`, `description` en cada presentación) son opcionales
  y se pueden ignorar.

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

| Query                  | Tipo                                                                          | Descripción                                                                              |
| ---------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `search`               | string                                                                        | Texto del cliente tal cual (máx. 100). Ver [Búsqueda](#búsqueda-qué-hace-el-backend)     |
| `category_id`          | uuid                                                                          | Filtra por categoría                                                                     |
| `brand_id`             | uuid                                                                          | Filtra por marca                                                                         |
| `sort`                 | `featured` · `price_asc` · `price_desc` · `name_asc` · `name_desc` · `newest` | Orden. Default `featured`                                                                |
| `include_out_of_stock` | `true` · `false`                                                              | Si es `true` incluye productos agotados (`inStock: false`). Default `false` (como antes) |
| `page`, `limit`        | int                                                                           | Paginación (`limit` ≤ 50)                                                                |

Cada producto trae `inStock` (`availableStock > 0`). `purchasable` es `true` solo si el producto tiene
presentaciones **y** `availableStock > 0`: un producto agotado nunca es `purchasable`.

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
      "inStock": true,
      "category": { "id": "…", "name": "Bolsas y Films" },
      "brand": { "id": "…", "name": "Valplas" },
      "purchasable": true,
      "attributes": [
        { "key": "ancho", "label": "Ancho", "value": 40, "unit": "cm" },
        { "key": "alto", "label": "Alto", "value": 50, "unit": "cm" },
        { "key": "color", "label": "Color", "value": "Transparente", "unit": null }
      ],
      "tags": ["camiseta", "bolsa de mano"],
      "unit": { "label": "paquete", "contains": { "quantity": 100, "of": "bolsas" } },
      "summary": "Bolsa Camiseta 40x50 Transparente viene en: Paquete de 100 bolsas: $1.240",
      "presentations": [
        {
          "priceListId": "6b1f…",
          "bundleSize": 1,
          "unitPrice": 1240,
          "bundlePrice": 1240,
          "availableBundles": 36,
          "label": "Paquete",
          "contains": "100 bolsas",
          "savingsPercent": 0,
          "description": "Paquete de 100 bolsas: $1.240"
        }
      ]
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 12, "totalPages": 2, "hasMore": true },
  "searchMode": "exact"
}
```

`searchMode` va al lado de `data` y `pagination` (no dentro de `pagination`). Ver la sección siguiente.

#### Atributos y tags

Cada producto (lista y detalle) trae dos campos, siempre presentes:

- **`attributes`**: características con valor cargado, `[{ key, label, value, unit }]`. `value` es un número
  para los atributos numéricos (`40`) y un texto para los de texto u opción (`"Transparente"`); `unit` es la
  unidad (`"cm"`, `"mic"`) o `null`. Es `[]` si el producto no tiene ninguno. Sirven para mostrar y
  comparar (`"mide 40 x 50 cm"`).
- **`tags`**: sinónimos de búsqueda del producto **más** los de su categoría y de sus categorías
  ancestras (sin repetir, en minúscula). Es `[]` si no hay. **Son solo para el bot**: los endpoints
  públicos de la web no los devuelven. Usalos como índice para tu propio matching si lo necesitás (por
  ejemplo, `"bolsa de mano"` apunta a la camiseta) y **nunca se los muestres al cliente**.

#### Búsqueda: qué hace el backend

Mandá en `search` el texto del cliente **tal cual lo escribió** (hasta 100 caracteres), sin armar familias,
sin extraer medidas y sin sacar saludos. El servidor se encarga de:

- **Descartar palabras vacías** (`hola`, `quiero`, `cuánto`, `salen`, `precio`…) y signos.
- **Palabras:** cada palabra significativa (singular o plural, sin importar acentos) tiene que estar en el
  nombre, SKU, marca, categoría, `tags` (del producto o de su categoría y ancestros) o en el texto de un
  atributo. Los sinónimos se resuelven con los tags: no hace falta una lista `FAMILIAS` en el bot.
- **Medidas:** `40x50`, `40 x 50`, `40/50` o `40*50` coinciden con el nombre o con los atributos
  ancho/alto. **Número + unidad** (`20 mic`, `80 m`, `5 litros`) coincide con el atributo o con el nombre.
  El bot puede borrar sus reglas de medidas.
- **Números de 4 dígitos:** `4050` se busca tal cual en el nombre o en el SKU (incluidos ceros a la
  izquierda, `0042`).
- **Orden de intentos:** (1) exacto: coinciden **todos** los términos; (2) si no hay resultados y hay un
  número de 4 dígitos, se reintenta como medida (`4050` → `40x50`); (3) **relajado**: alcanza con una
  palabra significativa de al menos 3 caracteres con alguna letra. Si ninguno encuentra nada, la lista
  viene vacía con `searchMode: "exact"`.
- **Relevancia:** sin `sort` (o con `featured`) los resultados vienen ordenados por relevancia. Con
  cualquier otro `sort` se respeta ese orden.

Ejemplo. El cliente escribió `"hola, quiero bolsas camiseta 40x50, cuánto salen?"`:

```
GET /catalog/products?search=hola, quiero bolsas camiseta 40x50, cuánto salen?
```

(Con el valor URL-encoded.) Devuelve `Bolsa Camiseta 40x50 Transparente` y otras de esa medida, con
`"searchMode": "exact"`.

| `searchMode` | Significado                                                                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"exact"`    | Coinciden todos los términos (también cuando no se encontró nada: lista vacía)                                                                        |
| `"relaxed"`  | Ningún producto cumplía con todo y el modo relajado **sí** encontró algo: son resultados parecidos, no exactos. Solo se informa cuando hay resultados |
| `null`       | No hubo búsqueda, o el texto eran solo palabras vacías o signos (se lista el catálogo)                                                                |

Con `"relaxed"` aclaralo en la respuesta, por ejemplo: **"No encontré exactamente eso, pero tengo…"**, y
mostrá los productos. No lo presentes como coincidencia exacta.

#### `GET /catalog/products/:id`

El mismo objeto, con precio y stock actuales, dentro de `data.product` (ejemplo completo con dos presentaciones en §4). Devuelve `404 PRODUCT_NOT_FOUND` si el producto no existe,
está inactivo o fue borrado. Este endpoint sí devuelve productos sin stock (`availableStock: 0`).

#### `GET /catalog/status`

Versión global del catálogo, para saber cuándo volver a descargarlo.

```json
{
  "success": true,
  "data": {
    "catalogVersion": 1287,
    "catalogUpdatedAt": "2026-11-22T14:03:11.000Z",
    "storeInfoUpdatedAt": "2026-11-20T09:15:00.000Z"
  }
}
```

**Contrato:** consultá este endpoint periódicamente (por ejemplo, cada minuto) y volvé a descargar el
catálogo cuando `catalogVersion` sea **distinto** del último valor que viste. Compará siempre por
**desigualdad**, nunca por "mayor que".

`catalogVersion` cambia ante cualquier modificación de: productos (incluido stock y reservas por
pedidos), presentaciones y precios por cantidad, listas de precios y márgenes, categorías, marcas e
imágenes de productos. Cambia **una sola vez por transacción confirmada**, al momento del commit y junto
con los datos: si ves una versión nueva, los datos nuevos ya son visibles.

`storeInfoUpdatedAt` cambia cuando se guarda la información del negocio (ver `GET /store/info`). También
puede cambiar al actualizar el logo: es un refresco extra inofensivo. Si cambió, volvé a pedir
`/store/info`.

### Información del negocio

#### `GET /store/info`

Horarios, entregas, medios de pago, datos de contacto y demás información del negocio, para responder
preguntas frecuentes sin inventar datos.

```json
{
  "success": true,
  "data": {
    "businessHours": "Lunes a viernes de 9 a 18 hs. Sábados de 9 a 13 hs.",
    "deliveryDays": ["monday", "wednesday", "friday"],
    "deliveryZones": ["CABA", "Zona Norte", "Zona Oeste"],
    "minimumOrder": 20000,
    "freeShippingFrom": 80000,
    "paymentMethods": ["mercadopago", "transfer", "cash_pickup"],
    "transferDetails": {
      "alias": "ejemplo.alias.falso",
      "cbu": "0000000000000000000000",
      "holder": "Titular de Ejemplo SRL",
      "bank": "Banco de Ejemplo"
    },
    "pickupAddress": "Calle Falsa 123, Buenos Aires",
    "priceListUrl": "https://example.com/lista-de-precios.pdf",
    "contactPhone": "+5491100000000",
    "contactEmail": "contacto@example.com",
    "additionalInfo": "Texto libre con aclaraciones adicionales.",
    "updatedAt": "2026-11-20T09:15:00.000Z"
  }
}
```

Campos:

- `businessHours`: horario de atención, texto libre.
- `deliveryDays`: días de reparto, valores `monday`, `tuesday`, `wednesday`, `thursday`, `friday`,
  `saturday`, `sunday` (lunes a domingo).
- `deliveryZones`: zonas a las que se reparte (texto libre, ej. "CABA").
- `minimumOrder`: monto mínimo de compra en pesos.
- `freeShippingFrom`: monto del carrito desde el cual el envío es gratis, en pesos.
- `paymentMethods`: medios de pago aceptados. Valores: `mercadopago` (Mercado Pago), `transfer`
  (transferencia bancaria), `cash_on_delivery` (efectivo contra entrega), `cash_pickup` (efectivo al
  retirar en el local).
- `transferDetails`: `{ alias, cbu, holder, bank }` para pagar por transferencia. Es `null` si no se
  cargó ningún dato.
- `pickupAddress`: dirección para retirar en el local.
- `priceListUrl`: link (https) a la lista de precios.
- `contactPhone` (formato E.164), `contactEmail`: contacto del negocio.
- `additionalInfo`: aclaraciones libres.
- `updatedAt`: última vez que se guardó esta información.

**Campo sin dato → `null`.** Si el dato que necesitás viene `null`, no lo inventes: derivá esa pregunta a
una persona. Los arreglos vacíos (`deliveryDays`, `deliveryZones`, `paymentMethods`) también vuelven como
`null`. Los duplicados de esos arreglos se eliminan sin avisar al guardar. `0` es un monto válido
(`minimumOrder: 0` = sin mínimo, `freeShippingFrom: 0` = envío siempre gratis), no "sin dato".

**Caché:** la respuesta se cachea hasta 60 s en cada instancia de la API (la caché es por instancia, no compartida); al guardar desde el admin se invalida. Para saber
cuándo refrescar, usá `storeInfoUpdatedAt` de `GET /catalog/status`.

**Informativo vs. fuente de verdad:** `freeShippingFrom` y `deliveryZones` son informativos. El costo y la
disponibilidad real de envío salen siempre de `POST /quote` con `postcode`. Del mismo modo, los
`paymentMethods` son informativos: las órdenes creadas por el bot son **siempre Mercado Pago**.

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

Cada ítem va por presentación (`price_list_id` + `quantity` en bultos) **o** por unidades
(`{ "product_id": "…", "units": 12 }`), nunca ambos en el mismo ítem (ver §4). El formato anterior sigue
funcionando sin cambios.

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
        "bundleSize": 1,
        "units": 3,
        "bundlePrice": 1240,
        "subtotal": 3720,
        "availableStock": 3600,
        "label": "Paquete",
        "description": "Paquete de 100 bolsas: $1.240"
      }
    ],
    "requested": [
      {
        "productId": "3f6c…",
        "units": 3,
        "subtotal": 3720,
        "breakdown": [
          {
            "productId": "3f6c…",
            "productName": "Bolsa Camiseta 40x50 Transparente",
            "productSku": "BOL-4050-T",
            "priceListId": "6b1f…",
            "quantity": 3,
            "bundleSize": 1,
            "units": 3,
            "bundlePrice": 1240,
            "subtotal": 3720,
            "availableStock": 3600,
            "label": "Paquete",
            "description": "Paquete de 100 bolsas: $1.240"
          }
        ]
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

- **`items`** son las líneas planas que se cobran (una por presentación). **`requested`** tiene una
  entrada por cada ítem que mandaste, en el mismo orden: `{ productId, units, subtotal, breakdown }`, donde
  `breakdown` son las líneas (mismo formato que `items`) en las que se resolvió ese ítem. `units`: en un
  ítem por `units` es la cantidad de unidades que pidió ese ítem; en un ítem histórico (por presentación)
  es la suma de `units` de sus líneas. Un ítem `units` fusionado con uno anterior del mismo producto
  conserva su propio `units`, con `breakdown: []`, `subtotal: 0` y `mergedInto`.
- `label` y `description` de cada línea salen de la presentación (pueden ser `null` si no hay datos).
- **`orderable: false`** = hay `problems`. Mostrale al cliente qué pasa y ajustá el carrito antes de crear
  la orden. Cada problema tiene `code` y datos del ítem:
  - `PRODUCT_NOT_FOUND` `{ productId }`
  - `PRODUCT_UNAVAILABLE` `{ productId, productName }`
  - `PRICE_TIER_NOT_FOUND` `{ productId, productName, priceListId }`. En modo `units` no hay lista
    elegida: `priceListId` es `null`.
  - `INSUFFICIENT_STOCK` `{ productId, productName, available, requested }`. `available` y
    `requested` están en **unidades**, no en bultos.
  - `UNITS_NOT_ACHIEVABLE` `{ productId, productName, requested, nearestBelow, nearestAbove }` (solo
    ítems por `units`). No hay combinación exacta de presentaciones para esas unidades; `nearestBelow` y
    `nearestAbove` son las cantidades alcanzables más cercanas (`null` si no hay de ese lado).
  - `UNITS_PLAN_MISMATCH` `{ productId, productName, requested }`: las presentaciones cambiaron mientras
    se cotizaba. Volvé a cotizar.
- **`shipping.error`** = no hay envío para ese código postal o ese monto (`POSTCODE_NOT_COVERED`,
  `NO_SHIPPING_ZONES`, `SHIPPING_UNAVAILABLE`). Los precios de los ítems igual son válidos.
- `options[].total` = subtotal + envío. El precio puede cambiar entre la cotización y la orden: el total
  que se cobra es el de la orden.

**Ejemplo por unidades.** El producto de §4 (paquete a $5.872,50, bulto de 10 paquetes a $46.980),
pidiendo 12 paquetes:

```json
{ "items": [{ "product_id": "3f6c…", "units": 12 }] }
```

La API arma la combinación exacta más barata: 1 bulto + 2 paquetes (en vez de 12 paquetes sueltos).

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "productId": "3f6c…",
        "productName": "Bolsa Residuo 60x90 Negra",
        "productSku": "BOL-6090-N",
        "priceListId": "a92c…",
        "quantity": 1,
        "bundleSize": 10,
        "units": 10,
        "bundlePrice": 46980,
        "subtotal": 46980,
        "availableStock": 240,
        "label": "Bulto",
        "description": "Bulto de 10 paquetes (1.000 bolsas): $46.980 ($4.698 c/paquete, 20% menos)"
      },
      {
        "productId": "3f6c…",
        "productName": "Bolsa Residuo 60x90 Negra",
        "productSku": "BOL-6090-N",
        "priceListId": "6b1f…",
        "quantity": 2,
        "bundleSize": 1,
        "units": 2,
        "bundlePrice": 5872.5,
        "subtotal": 11745,
        "availableStock": 240,
        "label": "Paquete",
        "description": "Paquete de 100 bolsas: $5.872,50"
      }
    ],
    "requested": [
      {
        "productId": "3f6c…",
        "units": 12,
        "subtotal": 58725,
        "breakdown": [
          {
            "priceListId": "a92c…",
            "quantity": 1,
            "bundleSize": 10,
            "units": 10,
            "bundlePrice": 46980,
            "subtotal": 46980,
            "label": "Bulto"
          },
          {
            "priceListId": "6b1f…",
            "quantity": 2,
            "bundleSize": 1,
            "units": 2,
            "bundlePrice": 5872.5,
            "subtotal": 11745,
            "label": "Paquete"
          }
        ]
      }
    ],
    "problems": [],
    "subtotal": 58725,
    "orderable": true,
    "shipping": null
  }
}
```

(En `breakdown` las líneas traen todos los campos de `items` (`productId`, `productName`, `productSku`, `availableStock`, `description`…); en el JSON de arriba se abrevian.) Si dos ítems por
unidades son del mismo producto, el primero lleva el `breakdown` y el `subtotal` de la suma y los
siguientes vienen con `breakdown: []`, `subtotal: 0` y `mergedInto` = índice (desde 0) del primero.

Si el cliente pide 12 de un producto que solo se vende en bultos de 10, `problems` trae
`{ "code": "UNITS_NOT_ACHIEVABLE", "productId": "…", "productName": "…", "requested": 12, "nearestBelow": 10, "nearestAbove": 20 }`
y `orderable: false`.

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

- `items` acepta los mismos dos formatos que `/quote` (por presentación o `{ product_id, units }`). Con
  `units` la orden se arma con la misma combinación que cotizó `/quote`, así que se cobra lo mismo.
  Cada línea de la orden guarda el nombre de su presentación (`presentationLabel`).
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
          "bundleSize": 1,
          "bundlePrice": 1240,
          "subtotal": 3720,
          "presentationLabel": "Paquete"
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
`409 IDEMPOTENCY_KEY_CONFLICT`, `409 UNITS_PLAN_MISMATCH` (modo `units`: las presentaciones
cambiaron desde la cotización; volvé a cotizar; `error.details` solo trae `productId`), `422 UNITS_NOT_ACHIEVABLE` (modo `units`: no hay
combinación exacta; `error.details` trae `productId`, `requested`, `nearestBelow`, `nearestAbove`),
`404 CUSTOMER_NOT_FOUND`, `403 CUSTOMER_INACTIVE`.

#### `GET /orders/:orderNumber?customer_id=…`

Estado y detalle (el mismo objeto `order`). `items[].presentationLabel` es el nombre de la
presentación **al momento de la compra** (se guarda con la orden y no cambia si después se renombra); es
`null` en órdenes anteriores a esta función o sin presentación. Si la orden no existe o es de otro cliente:
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
| `ready_to_ship`     | Listo para despachar (envío generado en Andreani)                      | –                                         |
| `shipped`           | En camino                                                              | "Tu pedido está en camino"                |
| `delivered`         | Entregado                                                              | –                                         |
| `failed`            | Pago rechazado                                                         | Ofrecer otro intento con un carrito nuevo |
| `cancelled`         | Cancelado (por el cliente, el admin o vencimiento a las 25 h sin pago) | –                                         |
| `refunded`          | Reembolsado                                                            | –                                         |

**Envíos con Andreani.** Cuando el admin genera el envío en Andreani (o se crea solo con
`ANDREANI_AUTO_CREATE_SHIPMENT=true`) el pedido avanza por `ready_to_ship` → `shipped` (Andreani admitió el
paquete) → `delivered`, y cada cambio llega por este webhook. Puede llegar `ready_to_ship` y `shipped` casi
juntos si el polling se atrasó. Además existe una transición hacia atrás: **`ready_to_ship` → `processing`**
(el envío fue rechazado o cancelado en Andreani y el admin tiene que rehacerlo). Tratala como "volvemos a
preparar tu pedido": no repitas el mensaje de "en preparación" si ya lo mandaste, y ante `previousStatus`
`ready_to_ship` + `status` `processing` no asumas error del cliente. `shipped` y `delivered` pueden demorar
horas respecto del hecho real (polling cada 30–360 min según el estado).

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
| 409  | `UNITS_PLAN_MISMATCH`                                                    | Las presentaciones cambiaron: volvé a cotizar y confirmá el nuevo total con el cliente                         |
| 409  | `IDEMPOTENCY_KEY_CONFLICT`                                               | Generar una clave nueva                                                                                        |
| 409  | `EMAIL_IN_USE` / `PHONE_IN_USE`                                          | Crear el cliente sin email / derivar a un asesor                                                               |
| 409  | `ORDER_NOT_PAYABLE` / `ORDER_PAYMENT_EXPIRED` / `ORDER_NOT_CANCELLABLE`  | Informar el estado; ofrecer una orden nueva si corresponde                                                     |
| 422  | `UNITS_NOT_ACHIEVABLE`                                                   | No hay combinación exacta para esas unidades: ofrecer `nearestBelow` / `nearestAbove`                          |
| 429  | `RATE_LIMIT_EXCEEDED`                                                    | Esperar y reintentar con backoff                                                                               |
| 500  | `INTERNAL_ERROR`                                                         | Reintentar con backoff; si persiste, avisar al equipo de Valplas                                               |
| 502  | `PAYMENT_PROVIDER_ERROR`                                                 | Reintentar el link en unos minutos                                                                             |
| 503  | `BOT_API_DISABLED`                                                       | La API del bot no está habilitada en ese ambiente                                                              |

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
