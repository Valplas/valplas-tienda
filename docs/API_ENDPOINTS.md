# API Endpoints Reference

Base URL: `http://localhost:3001/api` (desarrollo) / `https://valplas-tienda-develop.up.railway.app/api` (producción)

## 🔐 Authentication

| Method | Endpoint         | Auth | Description             |
| ------ | ---------------- | ---- | ----------------------- |
| POST   | `/auth/register` | ❌   | Registrar nuevo usuario |
| POST   | `/auth/login`    | ❌   | Iniciar sesión          |
| POST   | `/auth/logout`   | ✅   | Cerrar sesión           |
| GET    | `/auth/me`       | ✅   | Obtener usuario actual  |
| POST   | `/auth/refresh`  | ✅   | Renovar access token    |

## 📦 Products

| Method | Endpoint               | Auth | Roles        | Description                |
| ------ | ---------------------- | ---- | ------------ | -------------------------- |
| GET    | `/products`            | ❌   | -            | Listar productos (público) |
| GET    | `/products/slug/:slug` | ❌   | -            | Obtener producto por slug  |
| GET    | `/products/:id`        | ❌   | -            | Obtener producto por ID    |
| POST   | `/products`            | ✅   | admin, owner | Crear producto             |
| PUT    | `/products/:id`        | ✅   | admin, owner | Actualizar producto        |
| DELETE | `/products/:id`        | ✅   | admin, owner | Eliminar producto          |

## 📂 Categories

| Method | Endpoint                        | Auth | Roles        | Description                  |
| ------ | ------------------------------- | ---- | ------------ | ---------------------------- |
| GET    | `/categories`                   | ❌   | -            | Listar categorías (público)  |
| GET    | `/categories/:id`               | ❌   | -            | Obtener categoría por ID     |
| POST   | `/categories`                   | ✅   | admin, owner | Crear categoría              |
| PUT    | `/categories/:id`               | ✅   | admin, owner | Actualizar categoría         |
| DELETE | `/categories/:id`               | ✅   | admin, owner | Eliminar categoría           |
| PATCH  | `/categories/:id/toggle-active` | ✅   | admin, owner | Activar/desactivar categoría |

## 🏷️ Brands

| Method | Endpoint             | Auth | Roles        | Description             |
| ------ | -------------------- | ---- | ------------ | ----------------------- |
| GET    | `/brands`            | ❌   | -            | Listar marcas (público) |
| GET    | `/brands/slug/:slug` | ❌   | -            | Obtener marca por slug  |
| GET    | `/brands/:id`        | ❌   | -            | Obtener marca por ID    |
| POST   | `/brands`            | ✅   | admin, owner | Crear marca             |
| PUT    | `/brands/:id`        | ✅   | admin, owner | Actualizar marca        |
| DELETE | `/brands/:id`        | ✅   | admin, owner | Eliminar marca          |

## 🗂️ Catalog

| Method | Endpoint            | Auth | Description                                                            |
| ------ | ------------------- | ---- | ---------------------------------------------------------------------- |
| GET    | `/catalog/products` | ❌   | Catálogo público: productos activos con stock, precio y presentaciones |

## 🛒 Cart

| Method | Endpoint                 | Auth | Description                 |
| ------ | ------------------------ | ---- | --------------------------- |
| GET    | `/cart`                  | ✅   | Obtener carrito del usuario |
| POST   | `/cart/items`            | ✅   | Agregar item al carrito     |
| PUT    | `/cart/items/:productId` | ✅   | Actualizar cantidad de item |
| DELETE | `/cart/items/:productId` | ✅   | Eliminar item del carrito   |
| DELETE | `/cart`                  | ✅   | Vaciar carrito              |
| POST   | `/cart/sync`             | ✅   | Sincronizar carrito         |

## 📍 Addresses

| Method | Endpoint                     | Auth | Description                      |
| ------ | ---------------------------- | ---- | -------------------------------- |
| GET    | `/addresses/me`              | ✅   | Listar mis direcciones           |
| GET    | `/addresses/me/default`      | ✅   | Obtener mi dirección por defecto |
| POST   | `/addresses`                 | ✅   | Crear dirección                  |
| GET    | `/addresses/:id`             | ✅   | Obtener dirección por ID         |
| PATCH  | `/addresses/:id`             | ✅   | Actualizar dirección             |
| DELETE | `/addresses/:id`             | ✅   | Eliminar dirección               |
| POST   | `/addresses/:id/set-default` | ✅   | Establecer como predeterminada   |

## 📋 Orders

| Method | Endpoint                      | Auth | Roles                | Description                 |
| ------ | ----------------------------- | ---- | -------------------- | --------------------------- |
| GET    | `/orders/me`                  | ✅   | customer             | Listar mis pedidos          |
| GET    | `/orders/me/summary`          | ✅   | customer             | Resumen de mis pedidos      |
| POST   | `/orders`                     | ✅   | customer             | Crear pedido                |
| GET    | `/orders/:id`                 | ✅   | -                    | Obtener pedido por ID       |
| GET    | `/orders/number/:orderNumber` | ✅   | -                    | Obtener pedido por número   |
| PATCH  | `/orders/:id/status`          | ✅   | admin, owner         | Actualizar estado de pedido |
| POST   | `/orders/:id/cancel`          | ✅   | -                    | Cancelar pedido             |
| GET    | `/orders`                     | ✅   | admin, owner, driver | Listar todos los pedidos    |

## 🚚 Shipping

| Method | Endpoint                 | Auth | Roles        | Description              |
| ------ | ------------------------ | ---- | ------------ | ------------------------ |
| GET    | `/shipping/quote`        | ❌   | -            | Cotizar envío (público)  |
| GET    | `/shipping/zones`        | ✅   | admin, owner | Listar zonas de envío    |
| POST   | `/shipping/zones`        | ✅   | admin, owner | Crear zona de envío      |
| PATCH  | `/shipping/zones/:id`    | ✅   | admin, owner | Actualizar zona          |
| DELETE | `/shipping/zones/:id`    | ✅   | admin, owner | Eliminar zona            |
| GET    | `/shipping/carriers`     | ✅   | admin, owner | Listar transportistas    |
| POST   | `/shipping/carriers`     | ✅   | admin, owner | Crear transportista      |
| PATCH  | `/shipping/carriers/:id` | ✅   | admin, owner | Actualizar transportista |
| DELETE | `/shipping/carriers/:id` | ✅   | admin, owner | Eliminar transportista   |
| GET    | `/shipping/rates`        | ✅   | admin, owner | Listar tarifas           |
| POST   | `/shipping/rates`        | ✅   | admin, owner | Crear tarifa             |
| PATCH  | `/shipping/rates/:id`    | ✅   | admin, owner | Actualizar tarifa        |
| DELETE | `/shipping/rates/:id`    | ✅   | admin, owner | Eliminar tarifa          |

## 📦 Shipments (Andreani)

Backoffice de envíos. Todas las rutas son solo `admin`/`owner`. Detalle y flujos: [ANDREANI_INTEGRATION.md](./ANDREANI_INTEGRATION.md).
Si `ANDREANI_MODE=disabled` responden 503.

| Method | Endpoint                             | Auth  | Roles        | Description                                                    |
| ------ | ------------------------------------ | ----- | ------------ | -------------------------------------------------------------- |
| POST   | `/shipments/branches/search`         | ✅    | admin, owner | Sucursales de retiro cerca de un CP (body `postcode`, `limit`) |
| GET    | `/shipments/orders/:orderId/preview` | ✅    | admin, owner | Bultos, contrato, localidad y warnings antes de crear el envío |
| POST   | `/shipments/orders/:orderId`         | ✅    | admin, owner | Crear envío en Andreani (pre-envío + etiqueta)                 |
| POST   | `/shipments/:id/cancel`              | ✅    | admin, owner | Cancelar envío (asíncrono; confirma el job)                    |
| POST   | `/shipments/:id/refresh`             | ✅    | admin, owner | Actualizar tracking ahora                                      |
| GET    | `/shipments/:id/label`               | ✅    | admin, owner | Descargar etiqueta (PDF)                                       |
| POST   | `/webhooks/andreani`                 | Basic | Andreani     | Novedades PUSH (opcional; 404 si no hay credenciales PUSH)     |

Notas de pedidos: `GET /orders/:id` incluye `shipments` (con eventos) y `GET /orders` incluye `active_shipment`;
`PATCH /orders/:id/status` es solo admin/owner y devuelve 409 `ORDER_STATUS_CONFLICT` si el estado cambió en el medio;
los clientes solo pueden cancelar pedidos `pending_payment`; cancelar un pedido con envío activo da 409 `SHIPMENT_ACTIVE`.

## 👥 Users

| Method | Endpoint                | Auth | Roles        | Description              |
| ------ | ----------------------- | ---- | ------------ | ------------------------ |
| GET    | `/users`                | ✅   | admin, owner | Listar usuarios          |
| GET    | `/users/stats`          | ✅   | admin, owner | Estadísticas de usuarios |
| POST   | `/users`                | ✅   | admin, owner | Crear usuario            |
| GET    | `/users/:id`            | ✅   | admin, owner | Obtener usuario por ID   |
| GET    | `/users/:id/stats`      | ✅   | admin, owner | Estadísticas de usuario  |
| PATCH  | `/users/:id`            | ✅   | admin, owner | Actualizar usuario       |
| PATCH  | `/users/:id/role`       | ✅   | owner        | Cambiar rol de usuario   |
| DELETE | `/users/:id`            | ✅   | owner        | Eliminar usuario         |
| POST   | `/users/:id/activate`   | ✅   | admin, owner | Activar usuario          |
| POST   | `/users/:id/deactivate` | ✅   | admin, owner | Desactivar usuario       |

## 🤖 Bot de WhatsApp

Auth por header `X-Api-Key` (server-to-server, sin cookies ni CSRF). Contrato completo, ejemplos y
webhook saliente: [BOT_API.md](./BOT_API.md).

| Method | Endpoint                                | Description                                   |
| ------ | --------------------------------------- | --------------------------------------------- |
| GET    | `/bot/catalog/categories`               | Árbol de categorías activas                   |
| GET    | `/bot/catalog/products`                 | Buscar productos con stock y presentaciones   |
| GET    | `/bot/catalog/products/:id`             | Detalle de producto (precio y stock actuales) |
| GET    | `/bot/customers/by-phone/:phone`        | Buscar cliente por teléfono                   |
| POST   | `/bot/customers`                        | Buscar o crear cliente por teléfono           |
| GET    | `/bot/customers/:id/addresses`          | Direcciones del cliente                       |
| POST   | `/bot/customers/:id/addresses`          | Agregar dirección                             |
| GET    | `/bot/customers/:id/orders`             | Órdenes del cliente                           |
| POST   | `/bot/quote`                            | Cotizar carrito (precio, stock y envío)       |
| POST   | `/bot/orders`                           | Crear orden `WSP-` y link de Mercado Pago     |
| GET    | `/bot/orders/:orderNumber`              | Estado y detalle de la orden                  |
| POST   | `/bot/orders/:orderNumber/payment-link` | Regenerar link de pago                        |
| POST   | `/bot/orders/:orderNumber/cancel`       | Cancelar orden pendiente de pago              |

## 🔑 Roles y Permisos

| Rol        | Descripción                                       |
| ---------- | ------------------------------------------------- |
| `customer` | Cliente - puede comprar y ver sus pedidos         |
| `driver`   | Chofer - puede ver y actualizar pedidos asignados |
| `admin`    | Administrador - gestión completa excepto usuarios |
| `owner`    | Dueño - acceso completo a todo el sistema         |

## 📝 Notas

- **Auth**: ✅ = Requiere autenticación (Bearer token), ❌ = Público
- **Base URL producción**: Las rutas NO incluyen `/admin` - todas las operaciones administrativas se protegen con roles
- **Formato de respuesta**: Todas las respuestas siguen el formato `ApiResponse`:
  ```typescript
  {
    success: boolean;
    data?: T;
    error?: { code: string; message: string; };
    pagination?: { page, limit, total, totalPages };
  }
  ```
