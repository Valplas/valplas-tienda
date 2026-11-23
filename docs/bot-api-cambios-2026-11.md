# Cambios en la API del bot: Catálogo v2 (noviembre 2026)

Resumen para el equipo del bot de WhatsApp. El contrato completo y vigente está en
[`BOT_API.md`](./BOT_API.md); este documento cuenta **qué se pidió, qué se hizo, qué quedó afuera y qué
tiene que cambiar el bot**. Todos los cambios son compatibles hacia atrás, con **una sola excepción**:
`purchasable` ahora considera el stock (ver [§3](#3-productos-sin-stock-y-purchasable)).

Los ejemplos son respuestas reales de la API (capturadas el 2026-11-23 contra la base de desarrollo con
productos de prueba, ya borrados). Los ids están abreviados con `…`; el SKU, la categoría y el slug son
ilustrativos. Los **precios son datos de prueba** (las dos listas dan el mismo precio por paquete, por eso
`savingsPercent` es 0): en producción el bulto tendrá su propio precio y su ahorro.

## 1. Qué se pidió y qué pasó

| #   | Pedido                                          | Estado       | Qué se hizo / por qué                                                                                                                                                                                                                                                                                                  |
| --- | ----------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Armar la combinación de presentaciones (tramos) | Hecho        | `POST /quote` y `POST /orders` aceptan `units` y el servidor arma la combinación **exacta más barata**. Regla elegida: los bultos son físicos, así que 12 paquetes = 1 bulto de 10 + 2 paquetes. La otra variante (cobrar los 12 al precio del tramo) **no aplica**: un bulto es una caja, no un descuento por volumen |
| 2   | Textos listos ("¿cómo viene X?")                | Hecho        | `unit`, `summary` y, por presentación, `label`, `contains`, `savingsPercent`, `description`. Lo carga el negocio y también lo usa la web, así ambos canales muestran lo mismo                                                                                                                                          |
| 3   | Productos sin stock en el catálogo              | Hecho        | `include_out_of_stock=true` + campo `inStock`. `purchasable` pasa a considerar el stock                                                                                                                                                                                                                                |
| 4   | Datos del negocio (horarios, pagos, zonas)      | Hecho        | `GET /store/info`, cargado desde `/admin/configuracion`. Sin dato → `null`                                                                                                                                                                                                                                             |
| 5   | Atributos (micrones, gramaje, medida, talle…)   | Hecho        | Diccionario de atributos con valores por producto: campo `attributes`                                                                                                                                                                                                                                                  |
| 6   | Sinónimos y búsqueda por texto natural          | Hecho        | Tags por producto y categoría (`tags`) y búsqueda nueva que entiende medidas, atributos, palabras vacías y plurales. Reemplaza `FAMILIAS` y las reglas de medidas del bot                                                                                                                                              |
| 7   | Saber cuándo cambió el catálogo                 | Parcial      | **No** se hizo `updated_since` por producto ni webhook `product.updated`: se reemplazó por una **versión global** (`catalogVersion` en `GET /catalog/status`). Cuando cambia, el bot re-descarga el catálogo                                                                                                           |
| 8   | Espacios sobrantes en textos                    | Hecho        | El servidor recorta (trim) todo string de entrada, excepto contraseñas, y se limpiaron los nombres existentes                                                                                                                                                                                                          |
| -   | `restockDate` (fecha de reposición)             | No           | El dato **no existe** en el sistema: no hay de dónde sacarlo                                                                                                                                                                                                                                                           |
| -   | SKU reales                                      | No (negocio) | Los carga el negocio a mano desde el panel (ya es editable). No es un cambio de API                                                                                                                                                                                                                                    |

## 2. Presentaciones y pedir por unidades

Cada producto trae `unit`, un `summary` listo y, por cada presentación, `label`, `contains`,
`savingsPercent` y `description`. Detalle del contrato en
[BOT_API §4](./BOT_API.md#4-presentaciones-y-bultos).

`GET /catalog/products/:id` (el producto va dentro de `data.product`):

```json
{
  "success": true,
  "data": {
    "product": {
      "id": "7d88…",
      "sku": "BOL-4050-EJ",
      "name": "Bolsa Camiseta 40x50 (ejemplo)",
      "imageUrl": null,
      "availableStock": 240,
      "category": { "id": "4026…", "name": "Bolsas y Films" },
      "brand": null,
      "inStock": true,
      "purchasable": true,
      "unit": { "label": "paquete", "contains": { "quantity": 100, "of": "bolsas" } },
      "summary": "Bolsa Camiseta 40x50 (ejemplo) viene en: Paquete de 100 bolsas: $1.600; Bulto de 10 paquetes (1.000 bolsas): $16.000 ($1.600 c/paquete)",
      "presentations": [
        {
          "priceListId": "1a57…",
          "bundleSize": 1,
          "unitPrice": 1600,
          "bundlePrice": 1600,
          "availableBundles": 240,
          "label": "Paquete",
          "contains": "100 bolsas",
          "savingsPercent": 0,
          "description": "Paquete de 100 bolsas: $1.600"
        },
        {
          "priceListId": "6908…",
          "bundleSize": 10,
          "unitPrice": 1600,
          "bundlePrice": 16000,
          "availableBundles": 24,
          "label": "Bulto",
          "contains": "10 paquetes (1.000 bolsas)",
          "savingsPercent": 0,
          "description": "Bulto de 10 paquetes (1.000 bolsas): $16.000 ($1.600 c/paquete)"
        }
      ],
      "attributes": [{ "key": "micrones", "label": "Micrones", "value": 20, "unit": "µm" }],
      "tags": ["consorcio"]
    }
  }
}
```

Para "¿cómo viene X?" mostrá `summary` o el `description` de la presentación. No armes el texto vos.

### Cotizar por unidades

El cliente pide 12 paquetes. En vez de calcular qué tramos usar, mandá `units`
([BOT_API §4, cómo pedir](./BOT_API.md#cómo-pedir-por-presentación-o-por-unidades) y
[`POST /quote`](./BOT_API.md#post-quote)):

```http
POST /api/bot/quote
{ "items": [{ "product_id": "7d88…", "units": 12 }] }
```

La respuesta trae las líneas que se cobran (`items`) y, en `requested`, cómo se resolvió cada ítem
(1 bulto de 10 + 2 paquetes):

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "productId": "7d88…",
        "productName": "Bolsa Camiseta 40x50 (ejemplo)",
        "productSku": "BOL-4050-EJ",
        "priceListId": "6908…",
        "quantity": 1,
        "bundleSize": 10,
        "units": 10,
        "bundlePrice": 16000,
        "subtotal": 16000,
        "availableStock": 240,
        "label": "Bulto",
        "description": "Bulto de 10 paquetes (1.000 bolsas): $16.000 ($1.600 c/paquete)"
      },
      {
        "productId": "7d88…",
        "productName": "Bolsa Camiseta 40x50 (ejemplo)",
        "productSku": "BOL-4050-EJ",
        "priceListId": "1a57…",
        "quantity": 2,
        "bundleSize": 1,
        "units": 2,
        "bundlePrice": 1600,
        "subtotal": 3200,
        "availableStock": 240,
        "label": "Paquete",
        "description": "Paquete de 100 bolsas: $1.600"
      }
    ],
    "requested": [
      {
        "productId": "7d88…",
        "units": 12,
        "subtotal": 19200,
        "breakdown": [
          {
            "priceListId": "6908…",
            "quantity": 1,
            "bundleSize": 10,
            "units": 10,
            "bundlePrice": 16000,
            "subtotal": 16000,
            "label": "Bulto"
          },
          {
            "priceListId": "1a57…",
            "quantity": 2,
            "bundleSize": 1,
            "units": 2,
            "bundlePrice": 1600,
            "subtotal": 3200,
            "label": "Paquete"
          }
        ]
      }
    ],
    "problems": [],
    "subtotal": 19200,
    "orderable": true,
    "shipping": null
  }
}
```

(En el `breakdown` real las líneas traen los mismos campos que `items`; acá se abrevian.) `POST /orders`
acepta el mismo formato y cobra **exactamente** lo cotizado. El formato anterior
(`price_list_id` + `quantity`) sigue funcionando igual.

### Cuando no se puede armar

Si el producto solo se vende en bultos de 10 y el cliente pide 12:

```json
{
  "success": true,
  "data": {
    "items": [],
    "requested": [{ "productId": "d3d5…", "units": 12, "subtotal": 0, "breakdown": [] }],
    "problems": [
      {
        "code": "UNITS_NOT_ACHIEVABLE",
        "productId": "d3d5…",
        "productName": "Bolsa Camiseta 40x50 solo bulto (ejemplo)",
        "requested": 12,
        "nearestBelow": 10,
        "nearestAbove": 20
      }
    ],
    "subtotal": 0,
    "orderable": false,
    "shipping": null
  }
}
```

En `/quote` es un problema dentro de un `200`. En `POST /orders` es un error `422 UNITS_NOT_ACHIEVABLE`
con los mismos datos en `error.details`. Ofrecele al cliente `nearestBelow` o `nearestAbove`. Si entre
cotizar y ordenar cambiaron las presentaciones, `POST /orders` responde `409 UNITS_PLAN_MISMATCH`: volvé
a cotizar y confirmá el nuevo total ([tabla de errores](./BOT_API.md#9-errores)).

## 3. Productos sin stock y `purchasable`

`GET /catalog/products?include_out_of_stock=true` también lista productos activos agotados. Todos los
productos traen `inStock` (`availableStock > 0`). Ver
[`GET /catalog/products`](./BOT_API.md#get-catalogproducts) y
[reglas generales](./BOT_API.md#reglas-generales).

**Cambio de significado (el único):** `purchasable` ahora es `true` solo si el producto tiene
presentaciones **y** `availableStock > 0`. Antes, `GET /catalog/products/:id` devolvía `purchasable: true`
para un producto agotado. Sin el parámetro, el listado se comporta como antes (solo productos con stock).
`/quote` y `/orders` siguen rechazando lo que no tiene stock (`INSUFFICIENT_STOCK`).

## 4. Información del negocio

`GET /store/info` ([contrato](./BOT_API.md#get-storeinfo)). Los datos los carga el negocio en
`/admin/configuracion`. Así responde hoy en desarrollo, donde todavía no se cargó nada:

```json
{
  "success": true,
  "data": {
    "businessHours": null,
    "deliveryDays": null,
    "deliveryZones": null,
    "minimumOrder": null,
    "freeShippingFrom": null,
    "paymentMethods": null,
    "transferDetails": null,
    "pickupAddress": null,
    "priceListUrl": null,
    "contactPhone": null,
    "contactEmail": null,
    "additionalInfo": null,
    "updatedAt": "2026-11-23T14:40:52.126Z"
  }
}
```

**Campo sin dato → `null`: no inventes la respuesta, derivá la pregunta a una persona.** `0` es un
monto válido (sin mínimo, envío siempre gratis), no "sin dato". `freeShippingFrom` y `deliveryZones` son
informativos; el costo real de envío sale de `POST /quote` con `postcode`. En el contrato completo hay un
ejemplo con todos los campos cargados.

## 5. Versión del catálogo

`GET /catalog/status` ([contrato](./BOT_API.md#get-catalogstatus)):

```json
{
  "success": true,
  "data": {
    "catalogVersion": 9033,
    "catalogUpdatedAt": "2026-11-23T14:50:50.245Z",
    "storeInfoUpdatedAt": "2026-11-23T14:40:52.126Z"
  }
}
```

Consultalo periódicamente (por ejemplo, una vez por minuto) y volvé a descargar el catálogo cuando
`catalogVersion` sea **distinto** del último que viste (nunca "mayor que"). Cambia con productos, stock y
reservas, presentaciones, precios, listas y márgenes, categorías, marcas e imágenes. Si cambió
`storeInfoUpdatedAt`, volvé a pedir `/store/info`. Es el reemplazo de `updated_since`.

## 6. Atributos, tags y búsqueda

Cada producto trae `attributes` (`[{ key, label, value, unit }]`, ver el ejemplo de §2) y `tags`
(sinónimos para tu propio matching; **nunca se los muestres al cliente**). Detalle en
[Atributos y tags](./BOT_API.md#atributos-y-tags).

La búsqueda se hace en el servidor: mandá en `search` **el texto del cliente tal cual**, sin sacar saludos,
sin extraer medidas y sin armar familias
([contrato de búsqueda](./BOT_API.md#búsqueda-qué-hace-el-backend)). El cliente escribió
`"hola, quiero bolsas camiseta 40x50"`:

```http
GET /api/bot/catalog/products?search=hola%2C%20quiero%20bolsas%20camiseta%2040x50
```

```json
{
  "success": true,
  "data": [
    {
      "id": "7d88…",
      "name": "Bolsa Camiseta 40x50 (ejemplo)",
      "inStock": true,
      "purchasable": true,
      "…": "…"
    },
    { "id": "d3d5…", "name": "Bolsa Camiseta 40x50 solo bulto (ejemplo)", "…": "…" },
    { "name": "Bolsas Camiseta Blanca Premium Reforzada 40x50", "…": "…" },
    { "name": "Bolsas Camiseta Color 40x50", "…": "…" }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 4, "totalPages": 1, "hasMore": false },
  "searchMode": "exact"
}
```

(Se recortaron los campos de cada producto; los dos últimos son productos reales del catálogo de
desarrollo.) Las palabras vacías (`hola`, `quiero`) se descartan y `40x50` coincide con el nombre o con los
atributos ancho/alto. Un sinónimo cargado como tag también encuentra: `?search=consorcio` devolvió solo el
producto con ese tag (`total: 1`, `searchMode: "exact"`), aunque el nombre no diga "consorcio".

`searchMode` va al lado de `data` y `pagination`:

- `"exact"`: coinciden todos los términos (también con la lista vacía).
- `"relaxed"`: nada cumplía con todo y se devuelven resultados parecidos (alcanza con una palabra
  significativa). Decíselo al cliente: "No encontré exactamente eso, pero tengo…".
- `null`: no hubo búsqueda o eran solo palabras vacías.

Sin `sort` explícito, con `search` los resultados vienen ordenados por relevancia.

## 7. Qué tiene que cambiar el bot

- [ ] **Dejar de combinar tramos.** Mandar `{ product_id, units }` en `/quote` y `/orders` y cobrar lo que
      devuelve `items`/`requested`. Borrar la lógica propia de bultos y tramos.
- [ ] **Usar los textos de la API** (`summary`, `description`, `label`) en vez de armarlos; nunca componer
      precios ni plurales.
- [ ] **Leer `GET /store/info`** para horarios, pagos, zonas, etc. Si un campo es `null`, derivar a una
      persona. Sacar esos datos del `.env` del bot.
- [ ] **Consultar `GET /catalog/status`** (por ejemplo cada minuto) y re-descargar el catálogo cuando
      `catalogVersion` sea **distinto** (no mayor) al último visto. Re-pedir `/store/info` si cambió
      `storeInfoUpdatedAt`.
- [ ] **Borrar `FAMILIAS` y las reglas de medidas**: mandar el texto del cliente tal cual en `search`.
- [ ] **Interpretar `purchasable` nuevo**: es `false` si no hay stock. Usar `inStock` para distinguir
      "agotado" de "sin presentaciones", y `include_out_of_stock=true` si querés mostrar agotados.
- [ ] **Manejar `searchMode: "relaxed"`** aclarando que no es una coincidencia exacta.
- [ ] **Manejar `UNITS_NOT_ACHIEVABLE`** (problema en `/quote`, `422` en `/orders`): ofrecer
      `nearestBelow` / `nearestAbove`.
- [ ] **Manejar `UNITS_PLAN_MISMATCH`** (`409` en `/orders`): volver a cotizar y confirmar el nuevo total.
- [ ] No mostrar los `tags` al cliente.

## 8. Datos que tiene que cargar el negocio

Estos cambios dependen de datos que carga el negocio desde el panel de administración; hasta entonces
los campos nuevos vienen `null` o vacíos:

- **Unidad de venta y nombre de cada presentación** de los productos (en el formulario de producto y en
  sus precios por cantidad). Sin esto, `unit` y `summary` son `null` y los nombres usan un texto por
  defecto ("Bulto x10").
- **Atributos** (micrones, medida, gramaje, etc.) en `/admin/atributos` y en cada producto.
- **Tags** (sinónimos) en productos y categorías.
- **Información del negocio** en `/admin/configuracion` (sin esto `GET /store/info` devuelve todo `null`).
- **SKU reales**: hoy hay productos con SKU provisorio (`AUTO-…`).
- **Corregir el producto "Sin nombre"**.

## 9. Disponibilidad

Los cambios están en la rama `feature/bot-catalog-v2` (4 partes: base, presentaciones, información del
negocio y atributos/búsqueda). Llegan a **staging** cuando se mergean a `develop`, y a **producción**
después de correr a mano las migraciones 054 a 060 en la base de producción y mergear a `main`.

Mientras tanto, el bot **tiene que seguir funcionando con el contrato actual**: los campos nuevos son
opcionales y los formatos viejos de `/quote` y `/orders` no cambian. La única diferencia de comportamiento
es `purchasable`. Conviene que el bot detecte la presencia de los campos nuevos (por ejemplo `summary`,
`inStock`) en lugar de asumirlos hasta que el cambio esté en el ambiente que usa.
