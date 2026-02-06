# Frontend Services - Mock vs Real API

## 🎯 Problema Original

El frontend estaba hardcodeado para usar servicios **mock** (datos simulados en localStorage) en todas las páginas. Esto significaba que las páginas NO llamaban a la API real de Railway, incluso en producción.

## ✅ Solución

Sistema de servicios configurables que permite cambiar entre **mock** y **API real** mediante una variable de entorno.

---

## 📦 Cómo Usar

### Importar Servicios (NUEVO)

**❌ ANTES (hardcodeado a mock):**

```typescript
import { fake_getProducts } from '@/lib/mock/services';
```

**✅ AHORA (configurable):**

```typescript
import { productService } from '@/services';

// Usar el servicio (mock o real según configuración)
const products = await productService.getProducts(filters);
```

### Servicios Disponibles

```typescript
import {
  productService, // getProducts, getProductById, getProductBySlug
  categoryService, // getCategories, getCategoryBySlug
  cartService, // getCart, addToCart, updateCartItem, removeFromCart, clearCart
  authService, // login, register, logout, getCurrentSession
  brandService, // getBrands, getBrandBySlug (solo mock por ahora)
  shippingService, // getShippingZones (solo mock por ahora)
  orderService // createOrder, getOrders, getOrderById (solo mock por ahora)
} from '@/services';
```

---

## ⚙️ Configuración

### Development (Localhost)

**Usar API real (recomendado):**

```env
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_USE_MOCK=false
```

**Usar mock (para desarrollo offline):**

```env
# .env.local
NEXT_PUBLIC_USE_MOCK=true
```

### Production (Vercel)

**Vercel Dashboard → Settings → Environment Variables:**

| Variable               | Valor                                | Importante            |
| ---------------------- | ------------------------------------ | --------------------- |
| `NEXT_PUBLIC_API_URL`  | `https://tu-backend.railway.app/api` | ✅ Requerida          |
| `NEXT_PUBLIC_USE_MOCK` | `false`                              | ✅ **MUY IMPORTANTE** |

**⚠️ CRÍTICO:** Si no configuras `NEXT_PUBLIC_USE_MOCK=false`, Vercel usará datos mock en lugar de la API real.

---

## 🔍 Cómo Verificar

### En el navegador (F12 → Console)

Verás un log al cargar la app:

```
🔧 App Configuration: {
  USE_MOCK_SERVICES: false,
  API_URL: 'https://tu-backend.railway.app/api',
  NODE_ENV: 'production'
}
📦 Services Mode: 🌐 REAL API (https://tu-backend.railway.app/api)
```

**Si dice "MOCK":** Estás usando datos locales (localStorage)
**Si dice "REAL API":** Estás llamando al backend ✅

### En Railway (Backend Logs)

```bash
railway logs --tail
```

Si estás usando API real, deberías ver logs de requests:

```
GET /api/products 200 45ms
POST /api/auth/login 200 123ms
```

---

## 🔄 Migrar Páginas Existentes

### Ejemplo: Página de Productos

**ANTES:**

```typescript
import { fake_getProducts } from '@/lib/mock/services';

// En el componente
const response = await fake_getProducts(filters);
```

**DESPUÉS:**

```typescript
import { productService } from '@/services';

// En el componente
const response = await productService.getProducts(filters);
```

### Ejemplo: Auth Store

**ANTES:**

```typescript
import { fake_login } from '@/lib/mock/services';

const response = await fake_login(credentials);
```

**DESPUÉS:**

```typescript
import { authService } from '@/services';

const response = await authService.login(credentials);
```

---

## 🧪 Testing

### Test con Mock (rápido, offline)

```env
NEXT_PUBLIC_USE_MOCK=true
```

```bash
bun dev
```

### Test con API Real (validación end-to-end)

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_USE_MOCK=false
```

```bash
# Terminal 1: Backend
cd apps/api
bun dev

# Terminal 2: Frontend
cd apps/web
bun dev
```

---

## 📝 Checklist de Deploy

Antes de hacer deploy a Vercel:

- [ ] Configurar `NEXT_PUBLIC_API_URL` con URL de Railway
- [ ] Configurar `NEXT_PUBLIC_USE_MOCK=false`
- [ ] Verificar que Railway tenga `ALLOWED_ORIGINS` con URL de Vercel
- [ ] Deploy y verificar logs en consola del navegador
- [ ] Verificar que Railway reciba requests

---

## 🐛 Troubleshooting

### "Estoy viendo datos de prueba en producción"

**Causa:** `NEXT_PUBLIC_USE_MOCK` no está configurada o está en `true`

**Solución:**

1. Ir a Vercel → Settings → Environment Variables
2. Agregar/editar: `NEXT_PUBLIC_USE_MOCK=false`
3. Redeploy

### "El frontend no llama al backend"

**Verificar en consola del navegador (F12):**

```
📦 Services Mode: 🎭 MOCK (localStorage)  ← Problema!
```

**Debería decir:**

```
📦 Services Mode: 🌐 REAL API (https://...)  ← Correcto
```

### "Network tab no muestra llamadas API"

Si `Services Mode: MOCK`, las llamadas no salen del navegador. Todo es localStorage.

Configura `NEXT_PUBLIC_USE_MOCK=false` y redeploy.

---

## 🎓 Best Practices

1. **Desarrollo:** Usa API real para validar integración
2. **Testing E2E:** Usa API real
3. **Testing unitario:** Usa mock
4. **Producción:** **SIEMPRE** API real (`NEXT_PUBLIC_USE_MOCK=false`)
5. **Offline dev:** Usa mock si no tienes backend corriendo

---

## 📚 Estructura de Archivos

```
apps/web/src/
├── lib/
│   ├── config.ts                  # Configuración (USE_MOCK_SERVICES)
│   ├── services/                  # Servicios REALES (llaman API)
│   │   ├── auth.service.ts
│   │   ├── products.service.ts
│   │   ├── categories.service.ts
│   │   └── cart.service.ts
│   └── mock/
│       └── services/              # Servicios MOCK (localStorage)
│           ├── fake-auth.service.ts
│           ├── fake-product.service.ts
│           └── ...
└── services/
    └── index.ts                   # ADAPTER (selecciona mock o real)
```

**Importa siempre desde `/services`:**

```typescript
import { productService } from '@/services';  ✅
```

**NO importes directamente desde `/lib/mock` o `/lib/services`:**

```typescript
import { fake_getProducts } from '@/lib/mock/services';  ❌
import { getProducts } from '@/lib/services/products.service';  ❌
```
