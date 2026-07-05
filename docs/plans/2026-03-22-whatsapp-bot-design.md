# WhatsApp Bot — Diseño e Implementación

**Fecha:** 2026-03-22
**Branch:** `wsp-bot`
**Estado:** Pendiente de implementación

---

## Contexto

Los clientes actualmente deben mandar mensajes al admin/dueño para hacer pedidos, quienes los cargan manualmente al sistema. El objetivo es automatizar este proceso con un bot de WhatsApp que permita a los clientes:

1. Registrarse automáticamente con su número de teléfono
2. Navegar el catálogo de productos por categoría y búsqueda de texto
3. Armar su carrito
4. Confirmar el pedido y recibir un link de Mercado Pago para el pago

---

## Decisiones de Diseño

| Decisión           | Elección                         | Razón                                                           |
| ------------------ | -------------------------------- | --------------------------------------------------------------- |
| Proveedor WhatsApp | Meta Cloud API                   | Oficial, gratis dentro ventana 24hs, sin riesgo de bloqueo      |
| Registro           | Auto-registro por teléfono       | El cliente escribe su nombre, se crea la cuenta automáticamente |
| Interfaz           | Menús numerados                  | Simple, sin IA, 100% predecible                                 |
| Catálogo           | Categoría + búsqueda texto libre | 500+ productos; búsqueda ILIKE en nombre/SKU                    |
| Paginación         | 8 resultados por página          | Balance entre cantidad y límite de caracteres de WhatsApp       |
| Dirección envío    | Preconfigurada por admin         | Simplifica el flujo para MVP                                    |
| Carrier            | Auto-selección más barato        | `findRatesByZoneAndAmount` devuelve rates ordenados ASC         |
| Pago               | Link de Mercado Pago             | Integración existente, link `init_point`                        |
| Precios            | Lista asignada o base_price      | Consistente con lógica del sistema                              |
| Sesiones           | PostgreSQL                       | Sin Redis en MVP, evita dependencia extra                       |
| Carrito            | JSONB en sesión                  | Cart web es cookie-based, incompatible con WhatsApp             |
| Deployment         | Módulo en `apps/api`             | Reutiliza toda la infraestructura, un solo deploy en Railway    |

---

## Arquitectura

### Módulo WhatsApp

```
apps/api/src/modules/whatsapp/
├── whatsapp.routes.ts         # GET (verificación Meta) + POST (webhook)
├── whatsapp.controller.ts     # Valida firma HMAC-SHA256, despacha al servicio
├── whatsapp.service.ts        # Router de estados: mapea estado → handler
├── whatsapp.client.ts         # HTTP client Meta Graph API v21.0 (envío mensajes)
├── whatsapp.types.ts          # Tipos: Session, BotCart, ConversationState
├── session.repository.ts      # CRUD whatsapp_sessions en PostgreSQL
└── handlers/
    ├── registration.handler.ts   # Nuevo usuario: pedir nombre → crear cuenta
    ├── menu.handler.ts            # Menú principal (estado: idle)
    ├── catalog.handler.ts         # category_menu → catalog_search → catalog_results → awaiting_quantity
    ├── cart.handler.ts            # Mostrar carrito
    └── checkout.handler.ts        # Confirmar pedido → crear orden → link MP
```

### Infraestructura nueva

```
apps/api/src/infrastructure/external/
└── mercadopago.ts    # Crear preference → devuelve init_point
```

### Migración DB

```
apps/api/src/infrastructure/database/migrations/
└── 033_create_whatsapp_sessions.sql
```

---

## Base de Datos

### Tabla `whatsapp_sessions`

```sql
CREATE TABLE whatsapp_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone        VARCHAR(20) UNIQUE NOT NULL,  -- E.164: +5491122334455
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  state        VARCHAR(50) NOT NULL DEFAULT 'idle',
  context      JSONB NOT NULL DEFAULT '{}',
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_sessions_phone ON whatsapp_sessions(phone);
CREATE INDEX idx_whatsapp_sessions_expires_at ON whatsapp_sessions(expires_at);
```

**Limpieza:** Cron con `node-cron` a las 4 AM ART (ya instalado en el proyecto): `DELETE FROM whatsapp_sessions WHERE expires_at < NOW()`.

---

## Estados de Conversación

```typescript
type ConversationState =
  | 'idle' // Menú principal
  | 'awaiting_name' // Esperando nombre para registro
  | 'catalog_menu' // Mostrando categorías
  | 'catalog_search' // Esperando texto de búsqueda (context: categoryId)
  | 'catalog_results' // Mostrando resultados (context: categoryId, query, page, total)
  | 'awaiting_quantity' // Esperando cantidad (context: + productId, productName, unitPrice)
  | 'cart_view' // Mostrando carrito
  | 'checkout_confirm'; // Resumen antes de confirmar

interface BotCartItem {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
}

interface SessionContext {
  categoryId?: string;
  query?: string;
  page?: number;
  total?: number;
  productId?: string;
  productName?: string;
  unitPrice?: number;
  cart: BotCartItem[]; // El carrito vive aquí (no en cookie como el web)
}
```

---

## Flujos Detallados

### 1. Registro (número desconocido)

```
Mensaje entrante de +5491122334455 (no existe en DB)
→ Crear sesión: { phone, state: 'awaiting_name', user_id: null }
→ Enviar: "¡Hola! Soy el bot de Valplas 👋 Para empezar, ¿cómo te llamás?"

Usuario escribe "Juan" (handler: registration)
→ userRepository.createUser({ phone, first_name: 'Juan', role: 'customer' }, randomHash)
→ Actualizar sesión: { user_id: nuevoId, state: 'idle' }
→ Mostrar menú principal
```

> **Nota de implementación:** Usar `userRepository.createUser()` directamente (no el domain) para evitar el check RBAC. Generar password random con `crypto.randomBytes(32).toString('hex')` + bcrypt hash.

### 2. Menú Principal (`idle`)

```
🛒 *Valplas Tienda*
¿Qué querés hacer?

1️⃣ Ver catálogo
2️⃣ Mi carrito
3️⃣ Finalizar pedido
0️⃣ Hablar con un asesor
```

- `1` → `state: 'catalog_menu'`
- `2` → `state: 'cart_view'`
- `3` → `state: 'checkout_confirm'`
- `0` → Enviar mensaje de contacto con número del admin (`ADMIN_WHATSAPP_NUMBER` en env)

### 3. Catálogo

**catalog_menu:**

```
Elegí una categoría:

1️⃣ Bolsas y Films
2️⃣ Artículos de Limpieza
3️⃣ Electrodomésticos
...
0️⃣ Volver al menú
```

→ Usa `categoryRepository.findAllCategories()` (filtrar activas)

**catalog_search** (context: `{ categoryId }`):

```
¿Qué producto buscás? Escribí el nombre o código.
```

**catalog_results** (context: `{ categoryId, query, page, total }`):

```
Encontré 12 productos (pág. 1/2):

1️⃣ Bolsa Camiseta 40x50 Transp - $1.240
2️⃣ Bolsa Camiseta 40x50 Negra  - $1.350
...
8️⃣ Bolsa Camiseta 40x50 Azul   - $1.290

➡️ s = siguiente  ⬅️ a = anterior
🔍 n = nueva búsqueda  🏠 0 = menú
```

→ Usa `catalogRepository.findPublicProducts({ search: query, category_id, page, limit: 8 })`

**awaiting_quantity** (context: `+ productId, productName, unitPrice`):

```
¿Cuántas unidades de "Bolsa Camiseta 40x50 Transp" querés?
```

→ Usuario escribe número → validar que es entero positivo → agregar a `context.cart` → volver a catalog_results

### 4. Carrito (`cart_view`)

```
🛒 *Tu carrito*

• Bolsa Camiseta 40x50 Transp x100 → $124.000
• Desengrasante 1L x10             →  $45.000

Subtotal: $169.000
Envío: se calcula al confirmar

1️⃣ Confirmar pedido
2️⃣ Vaciar carrito
0️⃣ Volver al menú
```

### 5. Checkout (`checkout_confirm`)

```typescript
// checkout.handler.ts
const address = await addressRepository.findDefaultAddress(userId);
if (!address) → "No tenés dirección cargada. Pedile al administrador que la configure."

const zone = await shippingRepository.findZoneByPostcode(address.postcode);
if (!zone) → "No hay envíos disponibles para tu zona (CP: XXXX)."

const rates = await shippingRepository.findRatesByZoneAndAmount(zone.id, subtotal);
if (!rates.length) → "No hay tarifas de envío disponibles para tu zona."
const selectedRate = rates[0]; // más barato (ya viene ordenado ASC)
```

Mensaje de confirmación:

```
📦 *Resumen del pedido*

Dirección: Av. Corrientes 1234, CABA (CP: 1043)
Envío: Correo Argentino — $1.500

Subtotal:  $169.000
Envío:       $1.500
*Total: $170.500*

1️⃣ Confirmar y pagar
0️⃣ Cancelar
```

Al confirmar:

```typescript
const order = await orderDomain.createOrder(userId, {
  shipping_address_id: address.id,
  shipping_carrier_id: selectedRate.carrier_id,
  payment_method: 'mercado_pago',
  items: cart.map((item) => ({ product_id: item.productId, quantity: item.quantity }))
});

const paymentUrl = await createOrderPreference({
  orderNumber: order.order_number,
  items: cart.map((item) => ({
    title: item.productName,
    quantity: item.quantity,
    unit_price: item.unitPrice
  })),
  total: order.total,
  notificationUrl: process.env.MERCADOPAGO_NOTIFICATION_URL
});
```

Mensaje final:

```
✅ *Pedido creado: VLP-20260322-0001*

💳 Pagá con Mercado Pago:
https://www.mercadopago.com.ar/...

El pedido se confirma automáticamente al recibir el pago.
```

---

## Seguridad

### Verificación de firma Meta

```typescript
// whatsapp.controller.ts (usar body raw, antes de parse JSON)
const signature = req.headers['x-hub-signature-256'] as string;
const expectedSignature =
  'sha256=' +
  crypto
    .createHmac('sha256', process.env.WHATSAPP_APP_SECRET)
    .update(req.rawBody) // rawBody guardado en middleware
    .digest('hex');
if (signature !== expectedSignature) return res.status(401).end();
```

> Express necesita guardar el body raw. Configurar middleware antes de `express.json()`:
>
> ```typescript
> app.use('/webhooks', express.raw({ type: 'application/json' }));
> ```

### Idempotencia

Guardar último `message_id` procesado en `context.lastMessageId` para evitar duplicados.

### Rate limit

Aplicar rate limiter específico para `/webhooks` (separado del `/api`).

---

## Variables de Entorno

```env
# WhatsApp (Meta Cloud API)
WHATSAPP_PHONE_NUMBER_ID=xxx
WHATSAPP_ACCESS_TOKEN=xxx         # Token permanente de Meta
WHATSAPP_APP_SECRET=xxx           # Para verificar firma HMAC-SHA256
WHATSAPP_VERIFY_TOKEN=xxx         # Para verificación inicial del webhook
ADMIN_WHATSAPP_NUMBER=+5491122334455  # Número del admin para "Hablar con asesor"

# Mercado Pago
MERCADOPAGO_ACCESS_TOKEN=TEST-xxx     # TEST-xxx dev / APP_USR-xxx prod
MERCADOPAGO_NOTIFICATION_URL=https://api.valplas.net/api/orders/webhook/mp
```

---

## Funciones Existentes a Reutilizar

| Función                                    | Archivo                                | Uso                           |
| ------------------------------------------ | -------------------------------------- | ----------------------------- |
| `findPublicProducts(filters)`              | `catalog/catalog.repository.ts:35`     | Búsqueda + paginación         |
| `findAllCategories()`                      | `categories/category.repository.ts:12` | Lista de categorías           |
| `findDefaultAddress(userId)`               | `addresses/address.repository.ts:94`   | Dirección del cliente         |
| `findZoneByPostcode(postcode)`             | `shipping/shipping.repository.ts:70`   | Zona de envío                 |
| `findRatesByZoneAndAmount(zoneId, amount)` | `shipping/shipping.repository.ts:378`  | Tarifas (usar `[0]`)          |
| `createOrder(userId, data)`                | `orders/order.domain.ts:89`            | Crear pedido con validaciones |
| `userRepository.createUser(data, hash)`    | `users/user.repository.ts:166`         | Registro de nuevo cliente     |

---

## Archivos a Modificar

- **`apps/api/src/server.ts`**:
  - Agregar middleware de raw body para `/webhooks`
  - Registrar `app.use('/webhooks', whatsappRoutes)`
  - Agregar cron de limpieza de sesiones expiradas
- **`apps/api/.env.example`**: Agregar variables WHATSAPP*\* y MERCADOPAGO*\*
- **`apps/api/package.json`**: Agregar dependencia `mercadopago`

---

## Orden de Implementación

1. `033_create_whatsapp_sessions.sql` — migración DB
2. `whatsapp.types.ts` — tipos e interfaces
3. `session.repository.ts` — CRUD de sesiones
4. `whatsapp.client.ts` — cliente Meta Graph API
5. `infrastructure/external/mercadopago.ts` — preferencias de pago
6. `handlers/registration.handler.ts`
7. `handlers/menu.handler.ts`
8. `handlers/catalog.handler.ts`
9. `handlers/cart.handler.ts`
10. `handlers/checkout.handler.ts`
11. `whatsapp.service.ts` — router principal de estados
12. `whatsapp.controller.ts` — verificación HMAC + entry point
13. `whatsapp.routes.ts` — definición de rutas
14. `server.ts` — registrar módulo WhatsApp
15. `.env.example` — documentar variables nuevas

---

## Verificación

1. **Setup webhook**: Configurar ngrok (dev) o Railway URL como webhook en Meta for Developers console
2. **Verificar webhook**: Meta envía GET con `hub.challenge` → servidor responde con el challenge → ✅
3. **Test firma inválida**: POST con firma incorrecta → 401 ✅
4. **Test registro**: Número nuevo → bot pide nombre → cuenta creada en DB → menú principal ✅
5. **Test catálogo**: Categoría → "bolsa camiseta 40x50" → 8 resultados → elegir → ingresar cantidad → confirmación ✅
6. **Test paginación**: Búsqueda con >8 resultados → "s" para siguiente página ✅
7. **Test carrito**: Ver items, subtotal correcto ✅
8. **Test checkout**: Confirmar → orden en DB → link MP enviado ✅
9. **Test sin dirección**: Usuario sin dirección → mensaje correcto (no crash) ✅
10. **Test sin zona de envío**: CP no configurado → mensaje correcto ✅
11. **Verificar en admin**: Pedido creado via bot aparece en backoffice web con status `pending_payment` ✅
