# Catálogo v2: presentaciones, atributos, tags, búsqueda e info del negocio

Fecha: 2026-11-22 · Rama: `feature/bot-catalog-v2` (desde `develop`)
Origen: pedidos del equipo del bot (`pedidos-al-backend.md`, 8 pedidos) y decisiones del usuario.

## Intención

El bot de WhatsApp es un servicio externo que consume `/api/bot`. **El backend hace todo el
trabajo de negocio** (precios, combinaciones de presentaciones, búsqueda, datos del negocio); el
bot solo traduce entre lenguaje natural y la API. Hoy el bot duplica reglas: arma combinaciones
de tramos, extrae medidas de los nombres con reglas, tiene sinónimos fijos en código y datos
del negocio en su `.env`. Este trabajo mueve todo eso al backend.

Lo que se carga para el bot (unidades, presentaciones con nombre, atributos) también lo usa la
**tienda web**, así el cliente ve lo mismo en la web y en WhatsApp.

## Objetivos

1. Cada producto dice qué es su unidad de venta ("paquete de 100 bolsas") y cada presentación
   tiene nombre ("Bulto" = 10 paquetes). La API responde "¿cómo viene X?" con texto listo.
2. `/quote` y `/orders` del bot aceptan **unidades** y el backend arma la combinación de
   presentaciones más barata.
3. El catálogo del bot puede incluir productos activos sin stock.
4. `GET /api/bot/store/info` con datos del negocio cargados desde el panel admin.
5. Atributos flexibles por producto (micrones, gramaje, medida, talle, color…) con un
   diccionario común, cargables desde el panel.
6. Tags (sinónimos) por producto y categoría, editables desde el panel.
7. Búsqueda del catálogo (web y bot) que entiende tags, medidas y atributos.
8. Versión global del catálogo para que el bot sepa si algo cambió.
9. Recorte de espacios (trim) en todos los inputs y limpieza de nombres existentes.
10. Un `.md` compartible para el equipo del bot al final.

## No objetivos

- Modo "unidades" en la web: la web sigue eligiendo presentación explícita (solo cambian textos).
- Mostrar productos sin stock en la web (solo el bot, por parámetro).
- `restockDate` (no existe el dato).
- `updated_since` por producto o webhook `product.updated` (se pidió solo la versión global).
- Búsqueda difusa por errores de tipeo (pg_trgm) — posible iteración futura.
- Cargar SKU reales (lo hace el negocio a mano desde el panel, ya editable).
- Exigir el mínimo de compra en el checkout (`minimum_order` es informativo).

## Anti-objetivos (sería un fracaso aunque funcione)

- Romper el contrato actual de `/api/bot`: el bot está en uso. Campos nuevos opcionales, ningún
  campo existente cambia de significado (única excepción acordada abajo: `purchasable`).
- Que `/quote` y `/orders` cobren distinto para los mismos ítems.
- Exponer `cost_price`, margen o nombre de lista de precios (revela el margen).
- Recortar contraseñas (cambiaría credenciales existentes).
- N+1 queries (regla del proyecto).
- Que la web y el bot muestren nombres distintos para la misma presentación.

## Restricciones

- Migraciones nuevas desde **054** (develop termina en 053). Nunca editar existentes. Rollback
  comentado en cada una.
- Respuestas JSON en camelCase (middleware); requests en snake_case.
- Las migraciones no corren solas en ningún entorno (workflows rotos). Staging usa la dev DB.
  En prod hay que correrlas a mano antes de mergear a `main`.
- Prod tiene 0 tiers; los 1640 de dev son de prueba. Una nueva copia prod→dev borra los datos
  cargados solo en dev (tiers, atributos, tags).
- Catálogo chico (~410 productos activos): no hacen falta índices de texto completo.

## Enfoques considerados

**Atributos (pedido 5)** — elegido por el usuario: **A**.

- **A. Diccionario + tabla de valores.** Definiciones (clave, nombre, tipo, unidad, alias)
  asignables a categorías + valores por producto en tabla propia. Claves consistentes, filtros
  numéricos tipados, renombrar no rompe datos, FK con integridad.
- B. Diccionario + JSONB en `products`. Más simple de leer; renombrar/borrar claves obliga a
  reescribir productos y no hay integridad referencial. Descartado.
- C. JSON libre sin diccionario. Claves inconsistentes; el bot volvería a interpretar. Descartado.

**Combinación de presentaciones (pedido 1)** — decisión: bultos **físicos** → 12 paquetes =
1 bulto + 2 paquetes (opción "A" del documento del bot). Algoritmo: **óptimo exacto** (programación
dinámica sobre unidades) en vez de "llenar de mayor a menor", que falla con tamaños no divisibles
(p. ej. 6 y 10). Llamada mía.

**Versión del catálogo (pedido 7)** — tabla de estado con contador bumpeado por triggers
(elegido) vs. calcular `MAX(updated_at)` de varias tablas al leer (no detecta borrados ni
cambios de margen de lista sin tocar productos). Llamada mía.

**Trim (pedido 8)** — middleware global que recorta strings del body/query (elegido) vs.
`.trim()` campo por campo en cada schema Zod (14 archivos de validators, fácil de olvidar en
endpoints nuevos). Llamada mía.

**Tienda web** — elegido por el usuario: **B**, la web usa los mismos nombres y muestra
"Características".

---

## Diseño

### 1+2. Unidad de venta y presentaciones con nombre

**DB (migración nueva):**

- `products.unit_label VARCHAR(30) NULL` — nombre singular de la unidad base ("paquete",
  "rollo", "caja", "kg", "unidad").
- `products.unit_content_quantity NUMERIC(12,3) NULL CHECK (> 0)` y
  `products.unit_content_label VARCHAR(40) NULL` — lo que trae una unidad ("100" "bolsas").
  CHECK: ambos o ninguno.
- `product_price_tiers.label VARCHAR(40) NULL` — nombre de la presentación ("Paquete", "Bulto",
  "Caja master").
- `order_items.presentation_label_snapshot VARCHAR(120) NULL` — texto de la presentación al
  momento de comprar ("Bulto de 10 paquetes"), para que el historial no cambie si se renombra.
  Llamada mía.

El stock **ya** se cuenta en unidades base y cada presentación consume `bundle_size`
(`min_quantity`) unidades: no cambia.

**Función compartida (backend, pura y testeable):** `describePresentation(unit, tier, baseTier)`
en un módulo de catálogo, usada por el mapper del bot, el catálogo público, el producto por
slug, el carrito y el checkout. Devuelve:

- `label`: `tier.label` si existe; si no, el fallback actual (`bundleSize > 1 ? "Bulto x{n}" :
(unit_label capitalizado ?? "Unidad")`).
- `contains`: texto de lo que trae ("100 bolsas"; "10 paquetes (1.000 bolsas)"; `null` sin dato).
- `savings_percent`: entero, `floor((1 - unitPrice / baseUnitPrice) × 100)` contra la
  presentación de menor `bundle_size`; 0 para la base.
- `description`: frase en español con precio ARS (`$46.980` / `$5.872,50`), por ejemplo:
  - con unidad: `"Paquete de 100 bolsas: $5.872,50"`,
    `"Bulto de 10 paquetes (1.000 bolsas): $46.980 ($4.698 c/paquete, 20% menos)"`;
  - sin unidad: `"Unidad: $5.872,50"`, `"Bulto x10: $46.980 ($4.698 c/u, 20% menos)"`.
- Plural de `unit_label`: regla española simple (vocal → +s, consonante → +es; abreviaturas
  como kg, m, mts, lt, cm invariables). Detalle de reglas: lo decide el builder con tests.

**Respuesta de producto en `/api/bot/catalog/products` y `/:id`** (campos nuevos, todos
opcionales para el consumidor; los existentes no cambian):

```json
{
  "unit": { "label": "paquete", "contains": { "quantity": 100, "of": "bolsas" } },
  "presentations": [
    { "priceListId": "…", "bundleSize": 1, "unitPrice": 5872.5, "bundlePrice": 5872.5,
      "availableBundles": 40, "label": "Paquete", "contains": "100 bolsas",
      "savingsPercent": 0, "description": "Paquete de 100 bolsas: $5.872,50" },
    { "priceListId": "…", "bundleSize": 10, "unitPrice": 4698, "bundlePrice": 46980,
      "availableBundles": 4, "label": "Bulto", "contains": "10 paquetes (1.000 bolsas)",
      "savingsPercent": 20,
      "description": "Bulto de 10 paquetes (1.000 bolsas): $46.980 ($4.698 c/paquete, 20% menos)" }
  ],
  "summary": "Bolsa Camiseta 40x50 viene en: Paquete de 100 bolsas: $5.872,50; Bulto de 10 paquetes (1.000 bolsas): $46.980 ($4.698 c/paquete, 20% menos)",
  "attributes": [ … ],
  "tags": [ … ],
  "inStock": true
}
```

`unit` es `null` si no está cargado. `summary` responde "¿cómo viene X?" en una frase (llamada
mía).

**Cotizar y crear por unidades (`POST /api/bot/quote` y `POST /api/bot/orders`):**

- Cada ítem es **uno de dos formatos** (unión Zod, excluyentes):
  `{ product_id, price_list_id, quantity }` (actual) o `{ product_id, units }` (nuevo,
  entero ≥ 1, tope razonable p. ej. 100.000).
- Función pura `planUnits(units, presentations)` → combinación de costo mínimo cuya suma de
  `bundle_size × cantidad` es **exactamente** `units` (DP tipo mochila no acotada sobre unidades,
  O(units × presentaciones)). Desempate: menos bultos totales. El costo de cada presentación es
  `computeBundlePrice` (misma truncación que hoy).
- Si `units` no se puede armar (ej.: solo existe bulto de 10 y piden 12): problema
  `UNITS_NOT_ACHIEVABLE` con `requested`, `nearestBelow` y `nearestAbove` (cantidades armables
  más cercanas, `null` si no hay). En `/orders` → error 422 con esos datos.
- Stock: si `units` > disponible → `INSUFFICIENT_STOCK` con `available`/`requested` en unidades
  (semántica actual).
- Varios ítems `units` del mismo producto se suman y se planifican juntos (sale igual o más
  barato). Producto sin presentaciones → `PRICE_TIER_NOT_FOUND` (igual que hoy con `requireTier`).
- La expansión `units → líneas por presentación` ocurre **antes** de `priceOrderItems`, en una
  sola función usada por `/quote` y `/orders`, así ambos cobran exactamente lo mismo. Las líneas
  resultantes son idénticas a las que el bot mandaría a mano (mismas filas en `order_items`).
- Respuesta de `/quote`: `items` sigue siendo la lista plana de líneas (como hoy). Se agrega
  `requested`, una entrada por ítem recibido y en el mismo orden:
  `{ productId, units, subtotal, breakdown: [líneas de ese ítem] }` (para ítems en formato
  actual, `units = quantity × bundleSize`). Las líneas suman `label` y `description`.
- Los tiers se leen en batch para todos los productos (sin N+1).

**Panel admin:** formulario de producto con "Unidad de venta" (nombre + contenido) y, en
`PriceTiersSection`, un campo "Nombre de la presentación" por tier con placeholder del fallback.

**Web (opción B):** la web deja de calcular `presentationLabel(bundleSize)` en
`apps/web/src/lib/pricing.ts` y usa `label`/`description`/`contains` que devuelve la API en el
selector de presentaciones de la página de producto, el carrito y el checkout. El historial de
pedidos usa `presentation_label_snapshot` cuando existe. El endpoint público
`GET /api/catalog/products` y `GET /api/products/slug/:slug` devuelven los mismos campos
derivados (nunca el nombre de la lista).

### 3. Productos sin stock en el catálogo del bot

- `GET /api/bot/catalog/products?include_out_of_stock=true` incluye productos activos con
  disponible 0. Sin el parámetro, igual que hoy. El filtro vive en `findPublicProducts`
  (opción nueva, la web no la pasa).
- Campo nuevo `inStock: boolean` (`availableStock > 0`).
- **Cambio acordado de `purchasable`:** pasa a ser `presentaciones.length > 0 && availableStock > 0`.
  Hoy `GET /:id` ya devuelve productos sin stock con `purchasable: true`, lo que es engañoso.
  Se documenta en el `.md` para el bot. Llamada mía, el usuario puede revertirla.
- `/quote` y `/orders` siguen rechazando sin stock (`INSUFFICIENT_STOCK`; `PRODUCT_UNAVAILABLE`
  si está inactivo).

### 4. Datos del negocio: `GET /api/bot/store/info`

**DB:** columnas nuevas en `store_settings` (fila única existente, migración nueva):
`business_hours TEXT`, `delivery_days TEXT[]` (valores en inglés `monday`…`sunday`, CHECK),
`delivery_zones TEXT[]` (texto libre: localidades), `minimum_order NUMERIC(12,2)`,
`free_shipping_from NUMERIC(12,2)`, `payment_methods TEXT[]` (whitelist:
`mercadopago`, `transfer`, `cash_on_delivery`, `cash_pickup`), `transfer_alias`,
`transfer_cbu` (22 dígitos), `transfer_holder`, `transfer_bank`, `pickup_address TEXT`,
`price_list_url` (https), `contact_phone`, `contact_email`, `additional_info TEXT` (texto libre
para otras preguntas frecuentes). Todo nullable. Se reutiliza `updated_by`/`updated_at`.

**API:**

- Bot: `GET /api/bot/store/info` → `{ success, data: { businessHours, deliveryDays,
deliveryZones, minimumOrder, freeShippingFrom, paymentMethods, transferDetails: { alias, cbu,
holder, bank } | null, pickupAddress, priceListUrl, contactPhone, contactEmail,
additionalInfo, updatedAt } }`. Campo sin dato → `null`.
- Admin: `GET` y `PUT /api/settings/store-info` (`admin`/`owner`), validado con Zod.
- Caché en memoria 60 s, invalidada al guardar (patrón invalidate-only). Cumple "≤ 5 minutos".
- `freeShippingFrom` y `deliveryZones` son informativos; `/quote` con `postcode` sigue siendo la
  fuente de verdad del envío. No se derivan de la config de envíos (zonas por CP y umbrales
  por zona/carrier no mapean a un solo número). Llamada mía.

**Panel admin:** en `/admin/configuracion`, sección "Información del negocio" (React Hook Form +
Zod, botón con estado de carga, mobile-first). Días de reparto y medios de pago como checkboxes;
zonas como lista editable (chips).

### 5. Atributos (diccionario + valores)

**DB (migración nueva):**

- `attribute_definitions`: `id UUID`, `key VARCHAR(40) UNIQUE` (slug, inmutable una vez creado),
  `label VARCHAR(60)`, `value_type` enum (`number`, `text`, `option`), `unit VARCHAR(20) NULL`
  (µm, g/m², cm, m, kg, L), `options TEXT[] NULL` (solo `option`), `aliases TEXT[] NOT NULL
DEFAULT '{}'` (palabras para búsqueda: "mic", "micras"), `display_order`, `is_active`,
  timestamps.
- `category_attributes`: `(category_id, attribute_id)` PK, `display_order`. Define las claves
  precargadas en el formulario de productos de esa categoría; incluye las de categorías
  ancestro.
- `product_attribute_values`: `(product_id, attribute_id)` PK, `value_number NUMERIC(14,4) NULL`,
  `value_text VARCHAR(120) NULL`, CHECK exactamente uno. Índices `(attribute_id, value_number)` y
  `(attribute_id, lower(value_text))`. `ON DELETE CASCADE` desde producto; `RESTRICT` desde la
  definición (desactivar en vez de borrar si tiene valores).
- Semilla inicial del diccionario (en la migración, `ON CONFLICT DO NOTHING`): ancho, alto,
  profundidad (cm), micrones (µm), largo (m), gramaje (g/m²), peso (kg), capacidad (L),
  color (text), talle (option: XS–XXL). Llamada mía; el admin edita/agrega.
- Validación en el servicio: el valor respeta el tipo; `option` debe estar en `options`.

**API:**

- Admin: CRUD `/api/attributes` (definiciones) y asignación a categorías; los valores se
  guardan con el producto (create/update de producto acepta `attributes: [{ attribute_id,
value }]`).
- Catálogo (bot, público y producto por slug): `attributes: [{ key, label, value, unit }]`
  ordenados por `display_order`. Se cargan en batch (`WHERE product_id = ANY($1)`).

**Panel admin:**

- Página nueva `/admin/atributos`: lista del diccionario, alta/edición (tipo, unidad, opciones,
  alias), asignación a categorías.
- Formulario de producto: sección "Características" con las claves de la categoría
  precargadas (input según tipo) + "Agregar otra" desde el diccionario.

**Web:** página de producto con sección "Características" (lista `label: valor unidad`), solo si
hay atributos.

### 6. Tags

- `products.tags TEXT[] NOT NULL DEFAULT '{}'` y `categories.tags TEXT[] NOT NULL DEFAULT '{}'`.
  Se guardan normalizados (minúscula, trim, sin duplicados).
- Editables en el formulario de producto y de categoría (input de chips).
- Los tags de una categoría aplican a la búsqueda de sus productos (y de sus subcategorías).
- Se devuelven en `/api/bot/catalog/*` (el bot no los muestra). No se devuelven en la API
  pública de la web.

### 7. Búsqueda (web y bot, en `findPublicProducts`)

El parámetro `search` pasa por un parser (función pura, testeable) que produce tokens:

- **Medida:** `40x50`, `40 x 50`, `40×50`, `40*50`, `40/50` → `{ a: 40, b: 50 }`. Coincide si el
  nombre normalizado contiene esa medida (cualquier separador) o si `ancho`/`alto` del producto
  son esos valores.
- **Número + unidad/atributo:** `20 micrones`, `20mic`, `80 m`, `6 pulgadas` → se resuelve con
  `unit`/`label`/`aliases` del diccionario. Coincide con el valor del atributo o con el nombre.
- **Palabras:** el resto. Cada palabra debe coincidir (AND) con alguno de: nombre, SKU, marca,
  categoría, tags del producto, tags de la categoría, valores de texto de atributos. Insensible
  a acentos (`unaccent`, ya en uso) y a singular/plural simple ("bolsas" ≈ "bolsa").
- **Palabras de relleno:** el texto puede venir tal cual lo escribió el cliente ("hola, quiero
  bolsas camiseta 40x50, cuánto salen?"). Se descartan stopwords en español y de compra
  (hola, quiero, necesito, tenés, precio, cuánto, sale, de, la, el, para, por, unos…; lista en
  una constante del backend, editable sin tocar el bot).
- **Relajación:** si con todas las palabras (AND) no hay resultados, se reintenta exigiendo al
  menos una palabra significativa y se ordena por cantidad de palabras que coinciden. La
  respuesta indica `searchMode: "exact" | "relaxed"` (solo en `/api/bot`) para que el bot pueda
  decir "no encontré exactamente eso, pero tengo…". Llamada mía.
- **Fallback "4050":** si la búsqueda no devuelve nada y hay un número de 4 dígitos, se reintenta
  interpretándolo como medida 40x50. Llamada mía.
- **Orden:** con `search` y sin `sort` explícito, por relevancia (coincidencia en nombre >
  tags > atributos/categoría), luego `featured`. Con `sort` explícito, el orden pedido. El
  builder verifica qué `sort` manda hoy la web por defecto para no cambiarle el orden sin querer.
- Se mantiene la paginación en dos pasos (ids filtrados → detalle por ids).

### 8. Versión global del catálogo

- Tabla `catalog_state` (fila única): `version BIGINT`, `updated_at TIMESTAMPTZ`.
- Triggers `AFTER INSERT OR UPDATE OR DELETE … FOR EACH STATEMENT` que hacen
  `version = version + 1, updated_at = now()` en: `products` (incluye stock/`reserved_stock`:
  cada orden cambia el disponible), `product_price_tiers`, `price_lists`, `categories`,
  `brands`, `product_images`, `attribute_definitions`, `category_attributes`,
  `product_attribute_values`. Evitar el bump cuando la sentencia no afectó filas es deseable;
  el mecanismo (transition tables u otro) lo decide el builder.
- `store_settings` no bumpea el catálogo: tiene su propio `updated_at`.
- Endpoint `GET /api/bot/catalog/status` →
  `{ catalogVersion, catalogUpdatedAt, storeInfoUpdatedAt }`. Barato (una fila + una fila).
- Contrato para el bot: comparar `catalogVersion` por **distinto** (no por mayor) y re-bajar el
  catálogo si cambió.

### 9. Trim de inputs y limpieza de nombres

- Middleware global `trimStrings` registrado después de `express.json()`/`urlencoded`: recorre
  `req.body` y `req.query` y recorta los strings, recursivo. **Excepciones:** claves que
  contengan `password` (cualquier mayúscula) y las rutas de webhooks
  (`/api/payments/webhook`, `/api/webhooks/*`). Un string solo de espacios queda `''` y los
  validators existentes deciden.
- Migración de datos: `btrim` + colapsar espacios internos repetidos en `products.name`,
  `categories.name`, `brands.name`; `btrim` en `products.sku`. Antes de aplicar, un dry-run que
  cuente filas afectadas.
- El producto "Sin nombre" y los SKU `AUTO-` los corrige el negocio desde el panel (se listan en
  el `.md`).

### Documentación

- `docs/BOT_API.md` se actualiza con cada fase (campos nuevos, `units`, `include_out_of_stock`,
  `store/info`, `catalog/status`, cambio de `purchasable`, códigos de error nuevos).
- Al final: `docs/bot-api-cambios-2026-11.md`, compartible con el equipo del bot: qué se pidió,
  qué se hizo, ejemplos request/response, qué tiene que cambiar el bot y qué quedó afuera.
- `docs/API_ENDPOINTS.md` con los endpoints admin nuevos; Swagger en las rutas nuevas.

### Tests (Vitest contra la dev DB, helpers existentes)

- Unitarios: `planUnits` (óptimo con 6/10, inalcanzable con vecinos, desempate),
  `describePresentation` (con/sin unidad, plurales, ARS), parser de búsqueda, `trimStrings`
  (passwords intactas, webhooks excluidos).
- Integración: `/quote` con `units` = `/orders` con `units` (mismo total y mismas líneas);
  formato actual sin cambios; `include_out_of_stock`; `store/info` (GET bot, PUT admin, caché
  invalidada); atributos CRUD + valores con validación de tipo; triggers de `catalog_state`
  (cambio de margen de lista y borrado de tier bumpean); búsqueda por tag, medida y atributo.
- Web: los tests existentes del carrito/selector siguen verdes con los labels de la API.

## Fases (un PR por fase, en este orden)

1. **Base chica:** trim + limpieza de nombres, `include_out_of_stock` + `inStock`/`purchasable`,
   `catalog_state` + `/catalog/status`.
2. **Presentaciones:** unidad + label de tier + `describePresentation` + `units` en quote/orders +
   snapshot en `order_items` + panel + web.
3. **Info del negocio:** `store_settings` + endpoints + sección del panel.
4. **Atributos, tags y búsqueda:** diccionario, valores, tags, parser, panel (`/admin/atributos`,
   formularios), "Características" en la web.
5. **Documentación compartible** para el bot.

## Lo que queda al builder

- Nombres exactos de archivos/funciones dentro de los módulos existentes.
- Mecanismo para no bumpear `catalog_state` en sentencias sin filas.
- Reglas finas de plural y de singular/plural en búsqueda (con tests).
- Componentes de UI concretos (shadcn existentes) para chips y formularios.
- Tope exacto de `units` y del tamaño de la DP.

## Llamadas mías (a revisar por el usuario)

1. Algoritmo óptimo exacto para combinar presentaciones.
2. `presentation_label_snapshot` en `order_items`.
3. `summary` por producto ("¿cómo viene X?").
4. `purchasable` pasa a considerar stock (único cambio de significado).
5. Sin stock solo en el bot, la web no cambia.
6. Datos del negocio cargados a mano, no derivados de la config de envíos.
7. Semilla inicial del diccionario de atributos.
8. Fallback "4050" → 40x50, orden por relevancia cuando se busca, stopwords y búsqueda relajada
   con `searchMode`.
9. Trim global por middleware, excepto contraseñas y webhooks; colapsar espacios solo en nombres.
10. Un PR por fase en el orden indicado.
