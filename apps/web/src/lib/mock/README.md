# Mock System - Valplas E-commerce

Sistema de datos mock completo para desarrollo frontend sin backend.

## Estructura

```
lib/mock/
├── utils/
│   ├── fake-fetch.ts          # Simulador async con delay 300-800ms
│   └── local-storage.ts       # Helpers de persistencia con namespace valplas_*
├── data/
│   ├── users.ts               # Owner, admin, driver, 6 customers
│   ├── brands.ts              # 7 marcas argentinas
│   ├── categories.ts          # Árbol jerárquico (3 niveles)
│   ├── products.ts            # 20 productos realistas ($500-$15,000)
│   ├── addresses.ts           # Direcciones de clientes
│   ├── shipping-zones.ts      # Zonas y tarifas de envío argentinas
│   ├── orders.ts              # 8 pedidos en diferentes estados
│   └── index.ts               # Re-exports
└── services/
    ├── fake-auth.service.ts       # Login, registro, sesión
    ├── fake-product.service.ts    # CRUD productos, filtros, paginación
    ├── fake-cart.service.ts       # Carrito, stock validation
    ├── fake-user.service.ts       # Perfil, direcciones
    ├── fake-shipping.service.ts   # Cálculo de envío por CP
    ├── fake-order.service.ts      # Crear y gestionar pedidos
    └── index.ts                   # Re-exports
```

## Características

### ✅ Datos Realistas

- **Productos argentinos**: Bolsas plásticas, productos de limpieza, electrodomésticos
- **Precios en ARS**: $500 - $15,000 (formato: $1.234,56)
- **Teléfonos E.164**: +5491122334455
- **Zonas de envío reales**: CABA, GBA, provincias con CPs correctos

### ✅ Persistencia

- Todos los datos en `localStorage` con namespace `valplas_*`
- Carga inicial de MOCK_DATA si no existe
- Modificaciones persisten entre recargas

### ✅ Async Simulado

- Delay aleatorio 300-800ms en todas las operaciones
- Simula latencia de red realista

### ✅ Validaciones

- Stock disponible (`available_stock = stock - reserved_stock`)
- Duplicados (email, username, SKU, slug)
- Zonas de envío por código postal
- Monto mínimo para envío gratis

## Usuarios de Prueba

| Email              | Username       | Password    | Rol      |
| ------------------ | -------------- | ----------- | -------- |
| owner@valplas.net  | owner_valplas  | Valplas123  | owner    |
| admin@valplas.net  | admin_valplas  | Admin123    | admin    |
| driver@valplas.net | driver_valplas | Driver123   | driver   |
| cliente1@gmail.com | juanperez      | Customer123 | customer |
| cliente2@gmail.com | analopez       | Customer123 | customer |

## Uso Básico

### Auth

```typescript
import { fake_login, fake_register, fake_getCurrentSession } from '@/lib/mock/services';

// Login
const response = await fake_login({
  identifier: 'owner@valplas.net',
  password: 'Valplas123'
});

if (response.success) {
  const { user, access_token } = response.data;
  console.log('Logged in:', user.email);
}

// Obtener sesión actual
const session = await fake_getCurrentSession();
```

### Productos

```typescript
import {
  fake_getProducts,
  fake_getProductById,
  fake_getFeaturedProducts
} from '@/lib/mock/services';

// Listar con filtros y paginación
const products = await fake_getProducts(
  {
    category_id: 'cat-004',
    min_price: 1000,
    max_price: 5000,
    search: 'bolsas'
  },
  { page: 1, limit: 20 }
);

// Productos destacados
const featured = await fake_getFeaturedProducts(8);

// Por ID o slug
const product = await fake_getProductById('prod-001');
const product2 = await fake_getProductBySlug('bolsas-plasticas-40x60');
```

### Carrito

```typescript
import { fake_getCart, fake_addToCart, fake_updateCartItem } from '@/lib/mock/services';

const userId = 'user-004'; // O undefined para guest

// Agregar producto
await fake_addToCart('prod-001', 2, userId);

// Actualizar cantidad
await fake_updateCartItem('prod-001', 5, userId);

// Obtener carrito con productos enriquecidos
const cart = await fake_getCart(userId);
console.log('Total:', cart.data.total);
```

### Envíos

```typescript
import { fake_getShippingOptions } from '@/lib/mock/services';

// Calcular envío según CP y monto
const options = await fake_getShippingOptions('1043', 15000);

if (options.success) {
  const { carrier_name, cost, estimated_days } = options.data[0];
  console.log(`Envío: ${carrier_name} - $${cost} - ${estimated_days} días`);
}
```

### Pedidos

```typescript
import { fake_createOrder, fake_getUserOrders } from '@/lib/mock/services';

// Crear pedido
const order = await fake_createOrder({
  user_id: 'user-004',
  items: [
    { product_id: 'prod-001', quantity: 2 },
    { product_id: 'prod-005', quantity: 1 }
  ],
  shipping_address: addressData,
  shipping_carrier: 'Valplas Express',
  shipping_cost: 2500,
  payment_method: 'mercadopago'
});

// Listar pedidos del usuario
const orders = await fake_getUserOrders('user-004', { page: 1, limit: 10 });
```

## Convenciones

### Nombres de Funciones

Todas las funciones mock están prefijadas con `fake_`:

- ✅ `fake_login()`
- ✅ `fake_getProducts()`
- ✅ `fake_createOrder()`

### LocalStorage Keys

Namespace `valplas_*`:

- `valplas_users`
- `valplas_products`
- `valplas_cart_user-004` (con user ID)
- `valplas_cart_guest` (sin auth)
- `valplas_session`

### Ordenamiento de Productos

**SIEMPRE** ordenar por `final_price` (precio con descuentos), no `base_price`.

### Paginación

Todos los listados soportan paginación:

```typescript
{
  page: 1,
  limit: 20
}
```

### Respuestas API

Formato consistente con `ApiResponse<T>`:

```typescript
// Éxito
{ success: true, data: {...} }

// Error
{ success: false, error: { code: 'ERROR_CODE', message: '...' } }

// Paginado
{ success: true, data: [...], pagination: { page, limit, total, hasMore } }
```

## Limpieza de Datos

```typescript
import { clearAll } from '@/lib/mock/utils/local-storage';

// Limpiar TODOS los datos de valplas_*
clearAll();

// Los datos se reinicializarán con MOCK_DATA en el próximo request
```

## Notas de Desarrollo

1. **Stock**: Verificado en 3 capas (frontend UX, service, DB constraint simulado)
2. **Precios**: Solo usar `final_price` para ordenar/mostrar
3. **Envío gratis**: Calculado automáticamente según monto y zona
4. **Sesión**: Almacenada en `valplas_session`, limpiada en logout
5. **Migración de carrito**: Guest → User al hacer login (ver `fake_migrateCart`)

## Próximos Pasos

Para integrar con backend real:

1. Reemplazar imports:

```typescript
// Antes
import { fake_getProducts } from '@/lib/mock/services';

// Después
import { getProducts } from '@/lib/api/products';
```

2. El formato de respuesta es idéntico (`ApiResponse<T>`), no se requieren cambios en componentes.

3. Eliminar carpeta `lib/mock/` cuando backend esté listo.
