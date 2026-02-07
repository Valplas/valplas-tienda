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
