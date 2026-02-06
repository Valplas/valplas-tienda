# Migración de Mock Services a API Real

## 🎯 Estado Actual

### ✅ Completado

Los **servicios reales** ya están implementados y listos para usar:

- `auth.service.ts` - Login, registro, logout, getCurrentUser
- `products.service.ts` - Productos, búsqueda, filtros
- `categories.service.ts` - Categorías
- `brands.service.ts` - Marcas
- `cart.service.ts` - Carrito
- `shipping.service.ts` - Envíos
- `orders.service.ts` - Órdenes

Todos exportados desde `@/services` para fácil importación.

### ⏳ Pendiente

Las **páginas y componentes** todavía usan servicios mock (localStorage) en lugar de la API real.

---

## 🚀 Deploy Inmediato (Opción Temporal)

Si necesitas deployar **AHORA** sin migrar:

### En Vercel:

```env
NEXT_PUBLIC_API_URL=https://tu-backend.railway.app/api
NEXT_PUBLIC_USE_MOCK=true  ← Seguir usando mock por ahora
```

El frontend funcionará con datos de prueba (localStorage) mientras migras.

---

## 🔄 Migración Completa (Cuando tengas tiempo)

### Paso 1: Actualizar importaciones

**ANTES:**

```typescript
import { fake_getProducts } from '@/lib/mock/services';
```

**DESPUÉS:**

```typescript
import { getProducts } from '@/services';
```

### Paso 2: Actualizar llamadas

Los servicios reales **lanzan errores** en lugar de devolver `ApiResponse`.

**ANTES (Mock):**

```typescript
const response = await fake_getProducts(filters);
if (response.success && response.data) {
  setProducts(response.data);
} else {
  console.error(response.error?.message);
}
```

**DESPUÉS (API Real):**

```typescript
try {
  const response = await getProducts(filters);
  if (response.success && response.data) {
    setProducts(response.data);
  }
} catch (error) {
  console.error('Error:', error.message);
}
```

### Paso 3: Archivos a migrar (13 en total)

#### Páginas públicas:

- `src/app/(public)/page.tsx`
- `src/app/(public)/productos/page.tsx`
- `src/app/(public)/productos/[slug]/page.tsx`
- `src/app/(public)/confirmacion/[orderId]/page.tsx`

#### Páginas de cuenta:

- `src/app/(account)/cuenta/page.tsx`
- `src/app/(account)/cuenta/pedidos/page.tsx`
- `src/app/(account)/cuenta/pedidos/[id]/page.tsx`
- `src/app/(account)/cuenta/direcciones/page.tsx`

#### Páginas de auth:

- `src/app/(auth)/login/page.tsx`
- `src/app/(auth)/registro/page.tsx`

#### Componentes:

- `src/components/checkout/payment-step.tsx`
- `src/components/checkout/shipping-step.tsx`
- `src/components/layout/search-bar.tsx`
- `src/components/product/product-filters.tsx`

#### Stores:

- `src/stores/auth-store.ts`
- `src/stores/cart-store.ts`

### Paso 4: Mapeo de servicios

| Mock Service             | API Real            | Notas                            |
| ------------------------ | ------------------- | -------------------------------- |
| `fake_login`             | `login`             | Devuelve `AuthResponse`          |
| `fake_register`          | `register`          | Devuelve `AuthResponse`          |
| `fake_logout`            | `logout`            | Devuelve `Promise<void>`         |
| `fake_getCurrentSession` | `getCurrentUser`    | Devuelve `User`                  |
| `fake_getProducts`       | `getProducts`       | Recibe filtros en un solo objeto |
| `fake_getProductById`    | `getProductById`    |                                  |
| `fake_getProductBySlug`  | `getProductBySlug`  |                                  |
| `fake_getCategories`     | `getCategories`     |                                  |
| `fake_getCategoryBySlug` | `getCategoryBySlug` |                                  |
| `fake_getBrands`         | `getBrands`         |                                  |
| `fake_getBrandBySlug`    | `getBrandBySlug`    |                                  |
| `fake_getCart`           | `getCart`           |                                  |
| `fake_addToCart`         | `addToCart`         |                                  |
| `fake_updateCartItem`    | `updateCartItem`    |                                  |
| `fake_removeFromCart`    | `removeFromCart`    |                                  |
| `fake_clearCart`         | `clearCart`         |                                  |
| `fake_createOrder`       | `createOrder`       |                                  |
| `fake_getUserOrders`     | `getUserOrders`     |                                  |
| `fake_getOrderById`      | `getOrderById`      |                                  |
| `fake_getOrderByNumber`  | `getOrderByNumber`  |                                  |
| `fake_getShippingZones`  | `getShippingZones`  |                                  |
| `fake_migrateCart`       | ❌ No existe        | Eliminar esta funcionalidad      |

### Paso 5: Cambiar a API real en Vercel

Después de migrar todos los archivos:

```env
NEXT_PUBLIC_USE_MOCK=false  ← Usar API real
```

Redeploy y verificar que funcione.

---

## 📝 Ejemplo Completo: Migrar auth-store.ts

### ANTES:

```typescript
import { fake_login, fake_logout } from '@/lib/mock/services';

const response = await fake_login(credentials);
if (response.success && response.data) {
  setUser(response.data.user);
}
```

### DESPUÉS:

```typescript
import { login, logout, getCurrentUser } from '@/services';

try {
  const authResponse = await login(credentials);
  setUser(authResponse.user);
} catch (error) {
  console.error('Login failed:', error);
  throw error;
}
```

---

## ⚠️ Diferencias importantes

1. **Tipos diferentes**: Los tipos en `@/services` pueden diferir de los tipos en `@/types`. Usa los tipos exportados por los servicios.

2. **No hay ApiResponse wrapper**: Los servicios reales devuelven datos directamente o lanzan errores.

3. **LoginCredentials vs LoginData**:
   - Mock usa `identifier` (email o username)
   - API real usa `emailOrUsername`

4. **RegisterData**: API real requiere `firstName` y `lastName` separados.

5. **Cart.total**: API real devuelve `subtotal` y `total`, mock solo `subtotal`.

---

## 🧪 Testing

### Test con Mock (actual):

```bash
# Frontend sigue usando localStorage
bun dev
```

### Test con API Real (después de migrar):

```bash
# Terminal 1: Backend
cd apps/api
bun dev

# Terminal 2: Frontend
cd apps/web
NEXT_PUBLIC_USE_MOCK=false bun dev
```

---

## ✅ Checklist de Migración

- [ ] Migrar stores (auth-store.ts, cart-store.ts)
- [ ] Migrar páginas públicas (4 archivos)
- [ ] Migrar páginas de cuenta (4 archivos)
- [ ] Migrar páginas de auth (2 archivos)
- [ ] Migrar componentes (4 archivos)
- [ ] Actualizar tipos si es necesario
- [ ] Testing local con API real
- [ ] Configurar `NEXT_PUBLIC_USE_MOCK=false` en Vercel
- [ ] Deploy y verificar en producción

---

## 🐛 Problemas Comunes

### "Cannot find module '@/services'"

Verificar que `tsconfig.json` tenga el path alias configurado.

### "Property 'success' does not exist"

El servicio real no devuelve `ApiResponse`, devuelve los datos directamente.

### "Type mismatch"

Usar los tipos exportados por los servicios, no los de `@/types`.

---

## 📚 Recursos

- Servicios reales: `apps/web/src/lib/services/`
- Servicios mock (referencia): `apps/web/src/lib/mock/services/`
- Tipos compartidos: `packages/shared/`
