# CLAUDE.md - Valplas E-commerce

## Contexto del Proyecto

Valplas es una plataforma e-commerce para una distribuidora de artículos plásticos, productos de limpieza y electrodomésticos ubicada en Buenos Aires, Argentina. El proyecto extiende un CRM interno existente (.NET) migrando a stack PERN con Next.js. El proyecto está en el directorio valplas-tienda

**Dominio:** valplas.net  
**Cliente objetivo:** B2C/B2B, minoristas y pequeños comercios  
**Región:** Argentina (envíos a todo el país)  
**Moneda:** ARS (Pesos argentinos)  
**Timezone:** America/Argentina/Buenos_Aires

## Stack Tecnológico

### Frontend

- **Next.js 16** (App Router, Server Components, React 19)
- **TypeScript** (strict mode)
- **shadcn/ui** (componentes base)
- **Tailwind CSS** (utility-first, mobile-first)
- **Zustand** (estado cliente)
- **React Hook Form + Zod** (formularios)

### Backend

- **Node.js + Express + TypeScript**
- **PostgreSQL** (Supabase)
- **BullMQ + Redis** (jobs en background)
- **In-memory cache** (node-cache) + **Redis** (Upstash)
- **JWT + Cookies HttpOnly** (autenticación)
- **Sharp** (procesamiento de imágenes)
- **Zod** (validación)

### Herramientas de Desarrollo

- **Package Manager:** Bun (rápido, compatible con Node.js)
- **Runtime:** Bun/Node.js (Bun para desarrollo, Node.js para producción)
- **Monorepo:** Bun workspaces

### Infraestructura

- **Frontend:** Vercel
- **Backend:** Railway
- **Base de datos:** Supabase (PostgreSQL)
- **Cache/Jobs:** Upstash Redis
- **Storage:** Supabase Storage
- **DNS/CDN:** Cloudflare
- **Email:** Resend
- **Monitoring:** Sentry

### Integraciones Externas

- Mercado Pago (pagos)
- Google Maps API (direcciones)
- Andreani (envíos - Iteración 2)
- libphonenumber-js (validación teléfonos)

## Estructura del Proyecto

```
valplas-tienda/
├── apps/
│   ├── web/                          # Frontend Next.js
│   │   ├── src/
│   │   │   ├── app/                  # App Router
│   │   │   │   ├── (public)/         # Home, catálogo, producto
│   │   │   │   ├── (auth)/           # Login, registro
│   │   │   │   ├── (account)/        # Dashboard cliente
│   │   │   │   ├── admin/            # Backoffice
│   │   │   │   └── api/              # Route handlers (si necesario)
│   │   │   ├── components/
│   │   │   │   ├── ui/               # shadcn/ui
│   │   │   │   ├── layout/
│   │   │   │   ├── product/
│   │   │   │   ├── cart/
│   │   │   │   └── admin/
│   │   │   ├── hooks/
│   │   │   ├── stores/               # Zustand
│   │   │   ├── lib/                  # Utils, API client
│   │   │   └── types/
│   │   └── package.json
│   │
│   └── api/                          # Backend Express
│       ├── src/
│       │   ├── modules/              # Por dominio (auth, products, orders...)
│       │   ├── shared/               # Middlewares, utils, validators
│       │   ├── infrastructure/
│       │   │   ├── database/         # Migrations, seeds, client
│       │   │   ├── cache/            # Memory + Redis
│       │   │   ├── jobs/             # BullMQ queues y workers
│       │   │   ├── logger/           # Structured logging
│       │   │   └── external/         # MP, Andreani, Resend, Google
│       │   └── config/
│       └── package.json
│
├── packages/
│   └── shared/                       # Tipos compartidos
│
├── docs/
│   └── PRD.md
│
├── CLAUDE.md
├── package.json                      # Root con Bun workspaces
└── bun.lockb                         # Bun lockfile
```

## Convenciones de Código

### TypeScript

- Strict mode habilitado
- Interfaces para objetos, types para unions
- Enums en UPPER_SNAKE_CASE: `ORDER_STATUS`, `USER_ROLE`
- Funciones y variables en camelCase
- Constantes en UPPER_SNAKE_CASE

### Next.js

- Server Components por defecto
- `'use client'` solo cuando necesario (interactividad)
- Metadata API para SEO
- Route Groups para organizar: `(public)`, `(auth)`, `(account)`
- Middleware para auth checks

### shadcn/ui

- Componentes en `components/ui/`
- Customizar en el archivo, no crear wrappers
- Usar variants de CVA para estilos

### Estilos (Tailwind)

- Mobile-first siempre
- Colores del tema: `primary-500`, `secondary-300`
- No usar `@apply` salvo excepciones justificadas

### API

- REST con verbos HTTP correctos
- Rutas en kebab-case: `/api/shipping-zones`
- **Todos los listados paginados** (cursor-based preferido)
- Respuestas consistentes:

```typescript
// Éxito
{ success: true, data: {...} }

// Error
{ success: false, error: { code: 'VALIDATION_ERROR', message: '...' } }

// Lista paginada
{
  success: true,
  data: [...],
  pagination: {
    page?: number,
    limit: number,
    total: number,
    totalPages?: number,
    cursor?: string,
    hasMore: boolean
  }
}
```

### Base de Datos

- UUIDs para primary keys
- snake_case para tablas y columnas
- **`is_active`** para desactivar temporalmente
- **`deleted_at`** para soft delete
- Timestamps: `created_at`, `updated_at`
- Índices para FKs y campos de búsqueda

```sql
-- Semántica de estados
is_active = true  AND deleted_at IS NULL  → Visible y operativo
is_active = false AND deleted_at IS NULL  → Oculto temporalmente
deleted_at IS NOT NULL                    → Borrado lógico
```

#### Migraciones

- **NUNCA editar una migración existente** a menos que se indique explícitamente
- Si una migración ya fue ejecutada, crear una nueva para el cambio
- Las migraciones son inmutables una vez commiteadas
- Usar rollback SQL comentado en cada migración

### Teléfonos

- Formato E.164: `+5491122334455`
- Validar con libphonenumber-js
- Almacenar normalizado, mostrar formateado

### Git

- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`
- Branches: `feature/nombre`, `fix/nombre`, `hotfix/nombre`
- PRs con descripción y checklist

### Seguridad

#### Secrets y Credenciales

- **CRÍTICO:** Verificar que NO se commitean API keys, tokens, secrets o passwords
- Usar archivos `.env` (incluidos en `.gitignore`)
- Usar `.env.example` con valores placeholder para documentación
- NUNCA hardcodear credenciales en el código
- Verificar antes de cada commit con `git diff --staged`

**Archivos que NUNCA deben commitearse:**

```
.env
.env.local
.env.production
*.pem
*.key
credentials.json
secrets.*
```

**Qué hacer si se commitea un secret accidentalmente:**

1. Rotar inmediatamente la credencial comprometida
2. Usar `git filter-branch` o BFG Repo-Cleaner para eliminar del historial
3. Notificar al equipo

## Comandos Útiles

```bash
# Desarrollo
bun dev                    # Frontend y backend
bun dev:web               # Solo frontend (Next.js)
bun dev:api               # Solo backend

# Build
bun build
bun build:web
bun build:api

# Testing
bun test
bun test:unit
bun test:e2e

# Base de datos
bun db:migrate
bun db:migrate:create nombre
bun db:seed
bun db:reset

# Jobs
bun jobs:start            # Iniciar workers

# Linting
bun lint
bun lint:fix
bun format
bun typecheck
```

## Variables de Entorno

### Frontend (.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_MP_PUBLIC_KEY=TEST-xxx
NEXT_PUBLIC_GOOGLE_MAPS_KEY=xxx
```

### Backend (.env)

```env
# Server
PORT=3001
NODE_ENV=development

# Database
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# Auth
JWT_SECRET=xxx
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Redis (Upstash)
REDIS_URL=redis://...

# Mercado Pago
MP_ACCESS_TOKEN=TEST-xxx
MP_WEBHOOK_SECRET=xxx

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=xxx

# Email (Resend)
RESEND_API_KEY=re_xxx
EMAIL_FROM=Valplas <no-reply@valplas.net>

# Google
GOOGLE_MAPS_API_KEY=xxx

# Sentry
SENTRY_DSN=xxx
```

## Roles y Permisos

### Jerarquía de roles

```
owner > admin > driver > customer
```

| Rol        | Descripción                                                                              |
| ---------- | ---------------------------------------------------------------------------------------- |
| `owner`    | Dueño del negocio, configuración global , gestión de usuarios y privilegios a los admins |
| `admin`    | Administrador operativo (productos, pedidos)                                             |
| `driver`   | Chofer/repartidor (entregas)                                                             |
| `customer` | Cliente (compras)                                                                        |

### Datos de usuarios (sin encriptación)

MVP sin encriptación para permitir búsquedas LIKE. Columnas separadas:

```sql
users (
  email, username, phone,      -- Login
  first_name, last_name,       -- Datos personales
  password_hash,               -- Bcrypt (único dato protegido)
  ...
)

user_addresses (
  street, street_number, floor, apartment,
  city, province, postcode,
  latitude, longitude, place_id,  -- Google Maps
  ...
)
```

**Control de acceso:** Customer solo ve sus propios datos. Otros roles ven todos si tienen privilegios.

## Reglas de Negocio Críticas

### Stock

1. `stock_disponible = stock - reserved_stock`
2. Crear pedido → reservar stock (trigger DB)
3. Pago confirmado → descontar stock real (trigger DB)
4. Cancelar/fallar → liberar reserva (trigger DB)
5. Reembolso → restituir stock (trigger DB)
6. **Validar en 3 capas:** frontend (UX), backend (400), database (constraint)

### Precios

1. `base_price` = precio público sin descuentos
2. `final_price` = calculado con tiers + descuentos activos
3. **Ordenar siempre por `final_price`**, no `base_price`
4. Función DB: `get_product_final_price(product_id, quantity)`
5. IVA opcional, configurable en settings

### Autenticación (MVP)

1. Login por: email o username + contraseña
2. Access token: 15 min, en memoria (Zustand)
3. Refresh token: 7 días, cookie HttpOnly
4. Login por teléfono con OTP → Iteración 4+
5. OAuth (Google/Facebook) → Iteración 2

### Envíos

1. Zona determinada por código postal
2. CP puede estar excluido de zona (no entregan)
3. Una zona puede tener múltiples carriers
4. Tarifa según monto del carrito y carrier
5. Andreani: cotización en tiempo real (Iteración 2)

### Pedidos

1. `order_number`: VLP-YYYYMMDD-NNNN
2. Estados según flujo definido
3. Todo cambio → audit_logs + order_status_history
4. Webhook MP actualiza estado automáticamente

## Estrategia de Cache

En iteración 3

```
IN-MEMORY (node-cache)          REDIS (Upstash)
─────────────────────          ─────────────────
• Categorías (árbol)           • Sesiones
• Marcas activas               • Carrito (auth)
• Settings                     • Rate limiting
• Productos destacados         • Jobs (BullMQ)

TTL: 60-300 seg                TTL: Variable
Latencia: ~0ms                 Latencia: 1-5ms
```

### Invalidación (Invalidate-only pattern)

- Worker solo BORRA del cache, no reconstruye
- Siguiente request hace cache miss y recarga
- TTL corto (60s) como safety net por race conditions

```typescript
// Worker solo invalida
await memoryCache.del(`product:${productId}`);
await memoryCache.del('products:featured');

// Siguiente GET reconstruye automáticamente
```

## Jobs en Background (BullMQ)

Iteración 2+

```typescript
// Queues disponibles
cacheInvalidationQueue; // Invalidar cache
emailQueue; // Emails transaccionales
notificationQueue; // Push notifications
auditQueue; // Logging async
```

## Auditoría

Iteración 3
Eventos a loggear en `audit_logs`:

- **Orders:** create, status_change, cancel, refund
- **Products:** create, update, price_change, stock_adjustment
- **Users:** register, login, logout, role_change, profile_update
- **Payments:** preference_created, approved, rejected, refunded
- **Discounts:** create, update, usage
- **Settings:** any change

## Iteración Actual: MVP (Fase 1)

**Timeline:** 4 semanas

**Incluye:**

- Catálogo público con búsqueda y filtros
- Carrito y checkout con Mercado Pago
- Auth por email/username + contraseña
- Dashboard cliente básico
- Backoffice: productos, categorías, pedidos
- Cambio manual de estado de pedidos

**NO incluye (próximas iteraciones):**

- Login por teléfono con OTP
- Login con Google/Facebook
- Precios por cantidad (tiers)
- Integración Andreani
- Códigos de descuento
- Módulo chofer
- Privilegios granulares para admins

## Performance Targets

| Métrica        | Objetivo     |
| -------------- | ------------ |
| LCP            | < 2.5s       |
| FID            | < 100ms      |
| CLS            | < 0.1        |
| API p95        | < 300ms      |
| Bundle inicial | < 200KB gzip |

## Notas para Claude

0. **🔄 Context7 OBLIGATORIO:** Antes de iniciar cualquier tarea de desarrollo, usar Context7 (`mcp__plugin_context7_context7__resolve-library-id` + `mcp__plugin_context7_context7__query-docs`) para consultar la documentación actualizada de las librerías involucradas (Next.js, Express, Zod, shadcn/ui, etc.)
1. **Mobile-first:** 80% del tráfico esperado es mobile
2. **Español Argentina:** UI en español, "vos" si es conversacional
3. **Moneda:** ARS, formato `$1.234,56`
4. **Precios:** Ordenar siempre por `final_price` (con descuentos)
5. **Estados:** Usar `is_active` para temporal, `deleted_at` para permanente
6. **Paginación:** Todos los listados paginados, siempre
7. **Cache:** Invalidate-only pattern, TTL corto como safety net
8. **Teléfonos:** Formato E.164 (+5491122334455)
9. **Auditoría:** Loggear todo cambio importante
10. **🔒 SEGURIDAD CRÍTICA:** NUNCA commitear API keys, tokens, secrets o passwords. Verificar siempre antes de commit
11. **🚫 MIGRACIONES:** NUNCA editar una migración existente. Crear nueva migración para cambios

## Agentes/Roles Sugeridos

### Backend Agent

- APIs REST, validaciones, servicios
- Integración MP, Andreani
- Jobs BullMQ
- Cache strategy

### Frontend Agent

- Next.js App Router, Server Components
- shadcn/ui, Tailwind
- SEO, metadata
- Performance

### Database Agent

- Schema design, migrations
- Triggers para stock
- Índices, constraints
- Queries optimizadas

### QA Agent

- Tests unitarios (Vitest)
- Tests E2E (Playwright)
- Flujos críticos de compra
