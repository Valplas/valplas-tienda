# Plan de Migración a Auth0

**Proyecto:** Valplas E-commerce
**Versión:** 1.0
**Fecha:** Febrero 2026
**Estado:** Planificación

---

## 📋 Tabla de Contenidos

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Situación Actual](#situación-actual)
3. [¿Por qué Auth0?](#por-qué-auth0)
4. [Arquitectura Propuesta](#arquitectura-propuesta)
5. [Estrategia de Migración](#estrategia-de-migración)
6. [Plan de Implementación](#plan-de-implementación)
7. [Cambios Técnicos Detallados](#cambios-técnicos-detallados)
8. [Migración de Usuarios](#migración-de-usuarios)
9. [Testing y Validación](#testing-y-validación)
10. [Consideraciones y Riesgos](#consideraciones-y-riesgos)
11. [Costos](#costos)
12. [Plan de Rollback](#plan-de-rollback)

---

## 1. Resumen Ejecutivo

### Objetivo

Migrar el sistema de autenticación custom (JWT + bcrypt) a Auth0 para mejorar seguridad, escalabilidad y reducir la carga de mantenimiento.

### Duración Estimada

**4-6 semanas** (implementación + testing + migración gradual)

### Impacto

- ✅ **Positivo:** Seguridad mejorada, OAuth social, MFA, gestión de sesiones avanzada
- ⚠️ **Riesgo:** Migración de usuarios existentes, cambios en frontend/backend, costos

### Resultado Final

Sistema de autenticación enterprise-grade con Auth0, manteniendo compatibilidad con usuarios existentes y agregando nuevas capacidades (OAuth, MFA, etc.)

---

## 2. Situación Actual

### Sistema de Autenticación Custom

**Backend (Express API):**

- JWT personalizado (access token 15min + refresh token 7 días)
- bcrypt para hash de contraseñas (12 rounds)
- Refresh token en cookie HttpOnly
- Middleware de autenticación (`authMiddleware`)
- Roles: `owner`, `admin`, `driver`, `customer`

**Frontend (Next.js):**

- Zustand para estado de autenticación
- Access token en memoria
- Refresh token en cookie HttpOnly
- Auth provider para inicializar sesión

**Base de Datos:**

```sql
users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  username VARCHAR(50) UNIQUE,
  phone VARCHAR(20) UNIQUE,
  password_hash VARCHAR(255),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  role user_role,
  is_active BOOLEAN,
  email_verified BOOLEAN,
  phone_verified BOOLEAN,
  ...
)
```

### Limitaciones Actuales

1. **Seguridad:**
   - Sin MFA (multi-factor authentication)
   - Sin detección de intentos de login sospechosos
   - Sin gestión avanzada de sesiones
   - Responsabilidad total sobre la seguridad

2. **Funcionalidad:**
   - Solo login por email/username + password
   - Sin OAuth social (Google, Facebook)
   - Sin login passwordless (magic links)
   - Sin recuperación de contraseña implementada

3. **Mantenimiento:**
   - Código custom que mantener
   - Actualizaciones de seguridad manuales
   - Sin analytics de autenticación

4. **Escalabilidad:**
   - Gestión de sesiones en memoria/Redis
   - Sin rate limiting avanzado
   - Sin gestión de dispositivos

---

## 3. ¿Por qué Auth0?

### Ventajas Clave

#### 🔒 Seguridad Enterprise

- MFA nativo (SMS, TOTP, push notifications)
- Detección de anomalías y breached passwords
- Cumplimiento con GDPR, SOC2, ISO 27001
- Actualizaciones de seguridad automáticas
- Rate limiting y protección DDoS

#### 🚀 Funcionalidades Avanzadas

- OAuth social (Google, Facebook, Apple)
- Passwordless (magic links, OTP)
- Single Sign-On (SSO)
- Login adaptativo (risk-based)
- Gestión de sesiones multi-dispositivo

#### 📊 Gestión y Analytics

- Dashboard completo de usuarios
- Logs de autenticación detallados
- Métricas de uso y conversión
- Exportación de datos

#### 🛠️ Developer Experience

- SDKs oficiales (Node.js, React, Next.js)
- Documentación excelente
- Webhooks y extensibility
- Testing sandbox

#### 💰 Reducción de Costos de Mantenimiento

- No mantener código de auth custom
- No preocuparse por vulnerabilidades
- Menor carga en el equipo

### Auth0 vs Custom

| Característica      | Custom    | Auth0       |
| ------------------- | --------- | ----------- |
| MFA                 | ❌        | ✅          |
| OAuth Social        | ❌        | ✅          |
| Passwordless        | ❌        | ✅          |
| Detección anomalías | ❌        | ✅          |
| Dashboard           | ❌        | ✅          |
| Analytics           | ❌        | ✅          |
| Breached passwords  | ❌        | ✅          |
| Rate limiting       | ⚠️ Básico | ✅ Avanzado |
| Costo desarrollo    | Alto      | Bajo        |
| Costo operacional   | Bajo      | Medio       |

---

## 4. Arquitectura Propuesta

### Flujo de Autenticación con Auth0

```
┌──────────────┐
│  Next.js App │
│  (Frontend)  │
└──────┬───────┘
       │
       │ 1. Login redirect
       ▼
┌──────────────┐
│    Auth0     │
│  (Universal  │◄───── Verifica credenciales
│   Login)     │       + MFA (opcional)
└──────┬───────┘       + OAuth social
       │
       │ 2. Callback con code
       ▼
┌──────────────┐
│  Next.js App │
│  (Frontend)  │◄───── Exchange code for tokens
└──────┬───────┘
       │
       │ 3. API calls con Access Token
       ▼
┌──────────────┐
│  Express API │
│  (Backend)   │◄───── Verifica JWT (Auth0)
└──────────────┘       + Claims personalizados
```

### Componentes Clave

#### Auth0 Tenant

- **Environment:** Production + Development
- **Region:** US (más cercano a Railway)
- **Database:** Auth0 Database Connection
- **Social:** Google OAuth, Facebook (opcional)

#### Backend (Express API)

- **Validación JWT:** express-oauth2-jwt-bearer
- **Claims personalizados:** roles, permissions
- **User metadata:** first_name, last_name, phone
- **Sincronización:** Auth0 → PostgreSQL (via webhooks/actions)

#### Frontend (Next.js)

- **SDK:** @auth0/nextjs-auth0
- **Session:** Cookie encriptada (server-side)
- **Estado:** Zustand (mantener para UX)

#### Base de Datos

- Mantener tabla `users` para datos de negocio
- `auth0_user_id` como FK (no guardar password_hash)
- Sincronizar perfiles via webhooks

---

## 5. Estrategia de Migración

### Opción Recomendada: Migración Híbrida

**Fase 1: Coexistencia (2 semanas)**

- Auth0 y sistema custom funcionan en paralelo
- Nuevos usuarios → Auth0
- Usuarios existentes → Custom (con opción de migrar)

**Fase 2: Migración Gradual (2 semanas)**

- Migración automática en próximo login
- Opción de "Migrar a Auth0" en dashboard
- Email a usuarios inactivos

**Fase 3: Deprecación Custom (1 semana)**

- Solo Auth0 permitido
- Migración forzada de usuarios restantes
- Cleanup de código custom

**Fase 4: Optimización (1 semana)**

- Habilitar MFA opcional
- Configurar OAuth social
- Fine-tuning de UX

### Migración de Contraseñas

Auth0 soporta dos métodos:

#### Opción A: Migración en Próximo Login (RECOMENDADO)

1. Importar usuarios a Auth0 SIN contraseña
2. Configurar Custom Database Script
3. En próximo login:
   - Auth0 llama a nuestro endpoint `/auth/migrate-verify`
   - Verificamos password con bcrypt
   - Si válido, Auth0 guarda el hash internamente
   - Usuario migrado automáticamente

**Ventajas:**

- ✅ No expone hashes de contraseñas
- ✅ Migración transparente
- ✅ Usuario no nota cambios

**Desventajas:**

- ⚠️ Requiere endpoint custom
- ⚠️ Usuarios inactivos quedan sin migrar

#### Opción B: Bulk Import con Hashes

1. Exportar usuarios + bcrypt hashes
2. Importar a Auth0 con script
3. Auth0 verifica hashes en login

**Ventajas:**

- ✅ Migración inmediata
- ✅ Sin endpoints custom

**Desventajas:**

- ❌ Expone hashes (aunque bcrypt es seguro)
- ❌ Auth0 solo soporta bcrypt < 10 rounds (tenemos 12)

**DECISIÓN:** Usar **Opción A** (migración en próximo login)

---

## 6. Plan de Implementación

### Fase 1: Setup y Configuración (Semana 1)

#### 1.1 Crear Auth0 Tenant

- [ ] Crear cuenta Auth0
- [ ] Configurar tenant development
- [ ] Configurar tenant production
- [ ] Habilitar Database Connection
- [ ] Configurar Google OAuth (opcional)

#### 1.2 Configurar Backend

- [ ] Instalar `express-oauth2-jwt-bearer`
- [ ] Crear middleware Auth0: `auth0.middleware.ts`
- [ ] Configurar validación JWT con Auth0
- [ ] Crear endpoint `/auth/migrate-verify` (para migración)
- [ ] Configurar claims personalizados (roles, app_metadata)

#### 1.3 Configurar Frontend

- [ ] Instalar `@auth0/nextjs-auth0`
- [ ] Configurar Auth0Provider
- [ ] Crear route handlers: `/api/auth/[auth0].ts`
- [ ] Actualizar Zustand store para Auth0
- [ ] Crear UI de login/registro con Auth0

#### 1.4 Sincronización de Datos

- [ ] Crear webhook endpoint: `/webhooks/auth0`
- [ ] Configurar Auth0 Actions (post-registration)
- [ ] Mapear user_metadata a tabla users
- [ ] Agregar columna `auth0_user_id` a tabla users

### Fase 2: Coexistencia (Semana 2)

#### 2.1 Sistema Dual

- [ ] Feature flag: `ENABLE_AUTH0`
- [ ] Login page con opción "Login con Auth0"
- [ ] Mantener login custom funcionando
- [ ] Middleware híbrido (acepta JWT custom O Auth0)

#### 2.2 Nuevos Usuarios

- [ ] Registros nuevos → Auth0 por defecto
- [ ] Guardar `auth0_user_id` en tabla users
- [ ] Sincronizar metadata vía webhook

#### 2.3 Testing

- [ ] Test E2E: registro con Auth0
- [ ] Test E2E: login con Auth0
- [ ] Test E2E: API calls autenticadas
- [ ] Test roles y permisos

### Fase 3: Migración Gradual (Semana 3-4)

#### 3.1 Custom Database Script

- [ ] Configurar Auth0 Custom Database
- [ ] Implementar script `login` (llama a `/auth/migrate-verify`)
- [ ] Testing en sandbox

#### 3.2 Importación de Usuarios

- [ ] Script para importar usuarios sin password
- [ ] Mapear campos: email, username, first_name, last_name
- [ ] Marcar como `email_verified: false` (requerir verificación)

#### 3.3 Migración Automática

- [ ] Endpoint `/auth/migrate-verify`:
  ```typescript
  POST /auth/migrate-verify
  { email, password }
  → Verifica con bcrypt
  → Retorna { success: true/false }
  ```
- [ ] Auth0 migra usuario en próximo login exitoso

#### 3.4 Migración Manual (Dashboard)

- [ ] Botón "Migrar a Auth0" en `/cuenta`
- [ ] Modal para ingresar password actual
- [ ] Migra usuario manualmente vía Management API

#### 3.5 Notificaciones

- [ ] Email a usuarios inactivos (>30 días)
- [ ] Banner en app: "Migra tu cuenta para más seguridad"

### Fase 4: Deprecación Custom Auth (Semana 5)

#### 4.1 Forzar Migración

- [ ] Deshabilitar login custom
- [ ] Redirect automático a Auth0
- [ ] Migrar usuarios restantes (resetear password)

#### 4.2 Cleanup

- [ ] Remover código de auth custom
- [ ] Remover columna `password_hash` de DB
- [ ] Remover endpoints custom: `/auth/register`, `/auth/login`
- [ ] Remover middleware custom

#### 4.3 Documentación

- [ ] Actualizar README con Auth0
- [ ] Actualizar CLAUDE.md
- [ ] Documentar flujo de autenticación

### Fase 5: Optimización (Semana 6)

#### 5.1 Features Avanzadas

- [ ] Habilitar MFA opcional (TOTP)
- [ ] Configurar Google OAuth
- [ ] Configurar passwordless (magic links) para móviles
- [ ] Personalizar Universal Login (branding)

#### 5.2 Monitoring

- [ ] Configurar logs en Sentry
- [ ] Dashboard de Auth0 Analytics
- [ ] Alertas de anomalías

---

## 7. Cambios Técnicos Detallados

### 7.1 Backend Changes

#### Nuevo Middleware Auth0

```typescript
// apps/api/src/shared/middleware/auth0.middleware.ts
import { auth } from 'express-oauth2-jwt-bearer';
import { env } from '../../env.js';

// Validar JWT de Auth0
const checkJwt = auth({
  audience: env.AUTH0_AUDIENCE,
  issuerBaseURL: env.AUTH0_ISSUER_BASE_URL,
  tokenSigningAlg: 'RS256'
});

export async function auth0Middleware(req: Request, res: Response, next: NextFunction) {
  await checkJwt(req, res, () => {
    if (!req.auth) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Extraer claims personalizados
    const { sub, permissions, ...claims } = req.auth.payload;

    req.user = {
      userId: sub,
      email: claims.email,
      role: claims['https://valplas.net/role'], // Custom claim
      permissions: permissions || []
    };

    next();
  });
}
```

#### Endpoint de Migración

```typescript
// apps/api/src/modules/auth/auth0-migration.controller.ts
import bcrypt from 'bcryptjs';
import * as authRepository from '../auth/auth.repository.js';

/**
 * POST /auth/migrate-verify
 * Verifica contraseña para migración de Auth0
 * Solo accesible desde Auth0 (IP whitelisting)
 */
export async function verifyPasswordForMigration(req: Request, res: Response) {
  const { email, password } = req.body;

  // Validar que solo Auth0 pueda llamar este endpoint
  const auth0IP = req.ip;
  if (!isAuth0IP(auth0IP)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Buscar usuario
  const user = await authRepository.findUserByEmail(email);
  if (!user || !user.password_hash) {
    return res.json({ success: false });
  }

  // Verificar password
  const isValid = await bcrypt.compare(password, user.password_hash);

  if (isValid) {
    // Retornar perfil para que Auth0 lo guarde
    return res.json({
      success: true,
      profile: {
        user_id: user.id,
        email: user.email,
        username: user.username,
        email_verified: user.email_verified,
        user_metadata: {
          first_name: user.first_name,
          last_name: user.last_name,
          phone: user.phone
        },
        app_metadata: {
          role: user.role,
          is_active: user.is_active
        }
      }
    });
  }

  return res.json({ success: false });
}
```

#### Webhook de Sincronización

```typescript
// apps/api/src/modules/webhooks/auth0.webhook.ts
import { createOrUpdateUser } from '../users/users.service.js';

/**
 * POST /webhooks/auth0
 * Sincroniza usuarios de Auth0 con PostgreSQL
 */
export async function handleAuth0Webhook(req: Request, res: Response) {
  const { type, data } = req.body;

  switch (type) {
    case 'post-registration':
      await handlePostRegistration(data);
      break;
    case 'post-login':
      await handlePostLogin(data);
      break;
    case 'user-updated':
      await handleUserUpdated(data);
      break;
  }

  return res.status(200).json({ received: true });
}

async function handlePostRegistration(data: any) {
  const { user_id, email, user_metadata, app_metadata } = data;

  await createOrUpdateUser({
    auth0_user_id: user_id,
    email,
    username: user_metadata.username || email.split('@')[0],
    first_name: user_metadata.first_name,
    last_name: user_metadata.last_name,
    phone: user_metadata.phone,
    role: app_metadata.role || 'customer',
    email_verified: data.email_verified
  });
}
```

### 7.2 Frontend Changes

#### Auth0 Provider Setup

```typescript
// apps/web/src/app/providers.tsx
import { UserProvider } from '@auth0/nextjs-auth0/client';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      {/* Otros providers */}
      {children}
    </UserProvider>
  );
}
```

#### Auth0 Route Handlers

```typescript
// apps/web/src/app/api/auth/[auth0]/route.ts
import { handleAuth, handleLogin, handleCallback } from '@auth0/nextjs-auth0';

export const GET = handleAuth({
  login: handleLogin({
    returnTo: '/cuenta'
  }),
  callback: handleCallback({
    afterCallback: async (req, session) => {
      // Sync con backend si es necesario
      return session;
    }
  })
});
```

#### Updated Zustand Store

```typescript
// apps/web/src/stores/auth-store.ts
import { useUser } from '@auth0/nextjs-auth0/client';
import { create } from 'zustand';

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: () => {
    // Redirect a Auth0
    window.location.href = '/api/auth/login';
  },

  logout: () => {
    window.location.href = '/api/auth/logout';
  }
}));
```

### 7.3 Database Changes

#### Migration SQL

```sql
-- Migration: add_auth0_support
-- Agregar columna auth0_user_id
ALTER TABLE users
ADD COLUMN auth0_user_id VARCHAR(255) UNIQUE;

-- Índice para búsqueda rápida
CREATE INDEX idx_users_auth0_id
ON users(auth0_user_id)
WHERE auth0_user_id IS NOT NULL;

-- Hacer password_hash nullable (usuarios Auth0 no lo necesitan)
ALTER TABLE users
ALTER COLUMN password_hash DROP NOT NULL;

-- Agregar constraint: si no hay auth0_user_id, debe haber password_hash
ALTER TABLE users
ADD CONSTRAINT check_auth_method
CHECK (
  (auth0_user_id IS NOT NULL) OR
  (password_hash IS NOT NULL)
);
```

#### Cleanup Migration (Fase 4)

```sql
-- Migration: remove_custom_auth
-- Remover constraint temporal
ALTER TABLE users
DROP CONSTRAINT check_auth_method;

-- Hacer auth0_user_id obligatorio
ALTER TABLE users
ALTER COLUMN auth0_user_id SET NOT NULL;

-- Remover columna password_hash
ALTER TABLE users
DROP COLUMN password_hash;

-- Remover columnas de verificación custom
ALTER TABLE users
DROP COLUMN email_verified,
DROP COLUMN phone_verified;
-- Auth0 maneja estas verificaciones
```

### 7.4 Environment Variables

#### Backend (.env)

```bash
# Auth0
AUTH0_DOMAIN=valplas-dev.us.auth0.com
AUTH0_AUDIENCE=https://api.valplas.net
AUTH0_ISSUER_BASE_URL=https://valplas-dev.us.auth0.com
AUTH0_CLIENT_ID=xxx
AUTH0_CLIENT_SECRET=xxx

# Auth0 Management API (para webhooks)
AUTH0_MANAGEMENT_DOMAIN=valplas-dev.us.auth0.com
AUTH0_MANAGEMENT_CLIENT_ID=xxx
AUTH0_MANAGEMENT_CLIENT_SECRET=xxx

# Feature flag (Fase 1-3)
ENABLE_AUTH0=true
ENABLE_CUSTOM_AUTH=true  # Fase 1-3, luego false
```

#### Frontend (.env.local)

```bash
# Auth0
AUTH0_SECRET=your-secret-at-least-32-chars
AUTH0_BASE_URL=http://localhost:3000
AUTH0_ISSUER_BASE_URL=https://valplas-dev.us.auth0.com
AUTH0_CLIENT_ID=xxx
AUTH0_CLIENT_SECRET=xxx
```

---

## 8. Migración de Usuarios

### 8.1 Importación Inicial

**Script de Importación:**

```typescript
// scripts/import-users-to-auth0.ts
import { ManagementClient } from 'auth0';
import { getAllUsers } from '../api/src/modules/users/users.repository';

const auth0 = new ManagementClient({
  domain: process.env.AUTH0_MANAGEMENT_DOMAIN!,
  clientId: process.env.AUTH0_MANAGEMENT_CLIENT_ID!,
  clientSecret: process.env.AUTH0_MANAGEMENT_CLIENT_SECRET!
});

async function importUsers() {
  const users = await getAllUsers();

  for (const user of users) {
    try {
      await auth0.users.create({
        connection: 'Username-Password-Authentication',
        email: user.email,
        username: user.username,
        email_verified: false, // Requerir verificación
        user_metadata: {
          first_name: user.first_name,
          last_name: user.last_name,
          phone: user.phone
        },
        app_metadata: {
          role: user.role,
          legacy_user_id: user.id,
          migrated: false
        }
      });

      console.log(`✅ Imported: ${user.email}`);
    } catch (error) {
      console.error(`❌ Failed: ${user.email}`, error);
    }
  }
}
```

### 8.2 Custom Database Script (Auth0)

**Login Script:**

```javascript
// Auth0 Custom Database → Login Script
function login(email, password, callback) {
  const request = require('request');

  request.post(
    {
      url: 'https://api.valplas.net/auth/migrate-verify',
      json: { email, password },
      headers: {
        'X-Auth0-Migration': configuration.MIGRATION_SECRET
      }
    },
    function (err, response, body) {
      if (err) return callback(err);
      if (response.statusCode === 401) return callback();

      if (body.success) {
        const profile = body.profile;

        callback(null, {
          user_id: profile.user_id,
          email: profile.email,
          username: profile.username,
          email_verified: profile.email_verified,
          ...profile
        });
      } else {
        callback();
      }
    }
  );
}
```

### 8.3 Migración Manual desde Dashboard

**Componente React:**

```typescript
// apps/web/src/components/account/migrate-to-auth0-button.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function MigrateToAuth0Button() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleMigrate() {
    setLoading(true);

    try {
      const response = await fetch('/api/auth/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      if (response.ok) {
        alert('¡Cuenta migrada! Por favor inicia sesión nuevamente.');
        window.location.href = '/api/auth/logout';
      } else {
        alert('Contraseña incorrecta');
      }
    } catch (error) {
      alert('Error al migrar cuenta');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border rounded-lg p-4">
      <h3 className="font-semibold mb-2">
        Migrar a Auth0 (más seguro)
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        Mejora la seguridad de tu cuenta con MFA y OAuth social.
      </p>
      <div className="flex gap-2">
        <Input
          type="password"
          placeholder="Contraseña actual"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button onClick={handleMigrate} disabled={loading}>
          Migrar
        </Button>
      </div>
    </div>
  );
}
```

---

## 9. Testing y Validación

### 9.1 Unit Tests

```typescript
// apps/api/src/tests/auth0/auth0.middleware.test.ts
describe('Auth0 Middleware', () => {
  it('should validate Auth0 JWT', async () => {
    const token = generateAuth0Token({ sub: 'auth0|123' });
    const req = mockRequest({ headers: { authorization: `Bearer ${token}` } });
    const res = mockResponse();
    const next = jest.fn();

    await auth0Middleware(req, res, next);

    expect(req.user).toMatchObject({
      userId: 'auth0|123',
      role: 'customer'
    });
    expect(next).toHaveBeenCalled();
  });

  it('should reject invalid token', async () => {
    const req = mockRequest({ headers: { authorization: 'Bearer invalid' } });
    const res = mockResponse();
    const next = jest.fn();

    await auth0Middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
```

### 9.2 Integration Tests

```typescript
// apps/api/src/tests/auth0/auth0.integration.test.ts
describe('Auth0 Integration', () => {
  it('should register new user via Auth0', async () => {
    const response = await request(app).post('/auth/register').send({
      email: 'test@example.com',
      password: 'Test123!@#',
      firstName: 'Test',
      lastName: 'User'
    });

    expect(response.status).toBe(201);
    expect(response.body.data.user).toHaveProperty('auth0_user_id');
  });

  it('should migrate existing user on login', async () => {
    // Crear usuario con auth custom
    const user = await createTestUser({
      email: 'migrate@example.com',
      passwordHash: await bcrypt.hash('password123', 12)
    });

    // Login via Auth0 (trigger migration)
    const response = await request(app).post('/auth/migrate-verify').send({
      email: 'migrate@example.com',
      password: 'password123'
    });

    expect(response.body.success).toBe(true);
    expect(response.body.profile).toHaveProperty('user_id', user.id);
  });
});
```

### 9.3 E2E Tests (Playwright)

```typescript
// apps/web/tests/auth0/auth0.e2e.test.ts
import { test, expect } from '@playwright/test';

test.describe('Auth0 Authentication', () => {
  test('should login with Auth0', async ({ page }) => {
    await page.goto('/login');

    // Click Auth0 login button
    await page.click('text=Iniciar sesión con Auth0');

    // Auth0 Universal Login
    await expect(page).toHaveURL(/auth0\.com/);
    await page.fill('input[name=username]', 'test@example.com');
    await page.fill('input[name=password]', 'Test123!@#');
    await page.click('button[type=submit]');

    // Redirect back to app
    await expect(page).toHaveURL('/cuenta');
    await expect(page.locator('text=Mi Cuenta')).toBeVisible();
  });

  test('should logout', async ({ page }) => {
    // Asume usuario ya logueado
    await page.goto('/cuenta');
    await page.click('text=Cerrar sesión');

    await expect(page).toHaveURL('/');
  });
});
```

### 9.4 Checklist de Validación

**Funcionalidad:**

- [ ] Registro de nuevos usuarios via Auth0
- [ ] Login de usuarios nuevos
- [ ] Login de usuarios migrados
- [ ] Logout
- [ ] Refresh de tokens
- [ ] Validación de roles
- [ ] Webhook de sincronización

**Seguridad:**

- [ ] JWT signature válida
- [ ] Token expirado rechazado
- [ ] Sin token rechazado
- [ ] Token de otro tenant rechazado
- [ ] Roles correctos en claims
- [ ] Endpoint de migración protegido (IP whitelist)

**UX:**

- [ ] Login redirect smooth
- [ ] Logout redirect correcto
- [ ] Mensajes de error claros
- [ ] Loading states
- [ ] Session persistence

**Migración:**

- [ ] Usuarios importados correctamente
- [ ] Custom database script funciona
- [ ] Migración automática en login
- [ ] Migración manual desde dashboard
- [ ] No hay pérdida de datos

---

## 10. Consideraciones y Riesgos

### 10.1 Riesgos

| Riesgo                                 | Impacto | Probabilidad | Mitigación                                            |
| -------------------------------------- | ------- | ------------ | ----------------------------------------------------- |
| Pérdida de usuarios durante migración  | Alto    | Bajo         | Backup completo, plan de rollback, testing exhaustivo |
| Usuarios no migrados quedan bloqueados | Medio   | Medio        | Sistema híbrido temporal, notificaciones, soporte     |
| Downtime durante migración             | Alto    | Bajo         | Migración gradual sin downtime, feature flags         |
| Costos más altos de lo estimado        | Bajo    | Medio        | Calcular MAU con precisión, optimizar uso             |
| UX peor con redirects                  | Medio   | Medio        | Universal Login personalizado, embedded login (Pro+)  |
| Problemas con custom claims            | Medio   | Bajo         | Testing exhaustivo, documentación Auth0               |
| Sincronización fallida (webhook)       | Medio   | Medio        | Retry logic, queue, monitoreo                         |

### 10.2 Requerimientos Técnicos

**Backend:**

- Node.js 18+
- express-oauth2-jwt-bearer
- Auth0 Management API client

**Frontend:**

- Next.js 14+
- @auth0/nextjs-auth0
- React 18+

**Infrastructure:**

- HTTPS obligatorio (Auth0 require secure callbacks)
- Webhook endpoint público
- IPs de Auth0 whitelisted (para custom DB)

### 10.3 Limitaciones

**Auth0 Free Tier:**

- 7,500 MAU (monthly active users)
- Solo 2 social connections
- Sin MFA
- Sin custom domains
- Branding Auth0 en Universal Login

**Auth0 Essentials ($35/mes):**

- 500 MAU base + $0.05/MAU adicional
- MFA incluido
- Unlimited social connections
- Custom domain ($5/mes extra)
- Sin branding Auth0

**Para Valplas:**

- Estimar 200-500 MAU inicial
- Plan Essentials recomendado
- Costo mensual: ~$35-60/mes

### 10.4 Dependencies

**Nuevas dependencias backend:**

```json
{
  "express-oauth2-jwt-bearer": "^1.6.0",
  "auth0": "^4.0.0",
  "jwks-rsa": "^3.1.0"
}
```

**Nuevas dependencias frontend:**

```json
{
  "@auth0/nextjs-auth0": "^3.5.0"
}
```

**Remover (Fase 4):**

```json
{
  "jsonwebtoken": "^9.0.0",
  "bcryptjs": "^2.4.3"
}
```

---

## 11. Costos

### 11.1 Costos de Desarrollo

| Fase                  | Horas    | Costo (asumiendo $50/hora) |
| --------------------- | -------- | -------------------------- |
| Setup y configuración | 40h      | $2,000                     |
| Coexistencia          | 30h      | $1,500                     |
| Migración gradual     | 40h      | $2,000                     |
| Deprecación           | 20h      | $1,000                     |
| Optimización          | 20h      | $1,000                     |
| Testing               | 30h      | $1,500                     |
| **Total**             | **180h** | **$9,000**                 |

### 11.2 Costos Operacionales

**Auth0 (Essentials):**

- Base: $35/mes
- 500 MAU: incluidos
- MAU adicional: $0.05/mes
- Custom domain: $5/mes

**Estimado Año 1:**

- Mes 1-3: 200 MAU → $35/mes
- Mes 4-6: 400 MAU → $35/mes
- Mes 7-12: 600 MAU → $40/mes

**Total Año 1:** ~$480

**Ahorros en mantenimiento:**

- No mantener código de auth: ~20h/año ($1,000)
- No parches de seguridad: ~10h/año ($500)
- **Total ahorros:** ~$1,500/año

**ROI:** Positivo después de ~6 meses

---

## 12. Plan de Rollback

### 12.1 Rollback durante Fase 1-3 (Coexistencia)

Si Auth0 falla, sistema custom sigue funcionando:

```bash
# Deshabilitar Auth0
export ENABLE_AUTH0=false

# Frontend: ocultar botón Auth0
export NEXT_PUBLIC_ENABLE_AUTH0=false

# Restart services
pm2 restart api
```

**Impacto:** Usuarios nuevos registrados en Auth0 no podrán hacer login temporalmente (hasta que Auth0 se recupere)

### 12.2 Rollback durante Fase 4 (Deprecación)

Si hay problemas críticos después de deprecar custom auth:

1. **Restaurar código custom:**

   ```bash
   git revert <commit-hash-deprecation>
   git push
   deploy
   ```

2. **Re-habilitar password_hash:**

   ```sql
   -- Rollback migration: remove_custom_auth
   ALTER TABLE users
   ADD COLUMN password_hash VARCHAR(255);
   ```

3. **Resetear contraseñas:**
   - Forzar reset de password para todos
   - Email con link de recuperación
   - Usuarios hacen reset y vuelven a custom auth

**Impacto:** Downtime de ~1-2 horas, usuarios deben resetear contraseñas

### 12.3 Rollback Total (Emergency)

En caso de fallo catastrófico:

1. **Backup de BD:** Restaurar snapshot pre-migración
2. **Código:** Revert a commit antes de Auth0
3. **DNS:** Rollback si hubo cambios
4. **Comunicación:** Email a usuarios explicando

**Impacto:** Pérdida de datos de usuarios registrados durante migración (backups diarios minimizan esto)

---

## 13. Siguiente Pasos

### Inmediatos

1. ✅ **Aprobar plan** (este documento)
2. [ ] Crear cuenta Auth0
3. [ ] Setup de tenants (dev + prod)
4. [ ] Kickoff técnico con equipo

### Corto Plazo (Semana 1-2)

5. [ ] Implementar Fase 1 (Setup)
6. [ ] Implementar Fase 2 (Coexistencia)
7. [ ] Testing inicial

### Mediano Plazo (Semana 3-5)

8. [ ] Fase 3 (Migración gradual)
9. [ ] Fase 4 (Deprecación)
10. [ ] Validación completa

### Largo Plazo (Semana 6+)

11. [ ] Fase 5 (Optimización)
12. [ ] Habilitar MFA
13. [ ] OAuth social
14. [ ] Monitoreo y analytics

---

## 14. Recursos y Referencias

### Documentación Oficial

- [Auth0 Docs](https://auth0.com/docs)
- [Auth0 Next.js SDK](https://github.com/auth0/nextjs-auth0)
- [Auth0 Express SDK](https://github.com/auth0/express-oauth2-jwt-bearer)
- [Auth0 Custom Database](https://auth0.com/docs/authenticate/database-connections/custom-db)

### Guías de Migración

- [Auth0 Migration Guide](https://auth0.com/docs/authenticate/database-connections/custom-db/migrate-users)
- [Bulk User Import](https://auth0.com/docs/manage-users/user-migration/bulk-user-imports)

### Seguridad

- [Auth0 Security](https://auth0.com/security)
- [OWASP Auth Cheatsheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

---

## 15. Glosario

| Término               | Definición                                                    |
| --------------------- | ------------------------------------------------------------- |
| **Auth0 Tenant**      | Instancia de Auth0 (como una cuenta)                          |
| **Universal Login**   | Página de login hosteada por Auth0                            |
| **Custom Database**   | Script para migrar usuarios desde DB propia                   |
| **Social Connection** | OAuth con Google, Facebook, etc.                              |
| **MFA**               | Multi-Factor Authentication (2FA, TOTP, SMS)                  |
| **MAU**               | Monthly Active Users (usuarios únicos que hacen login al mes) |
| **Management API**    | API de Auth0 para gestionar usuarios programáticamente        |
| **Actions**           | Serverless functions que se ejecutan en flujos de Auth0       |
| **Claims**            | Datos incluidos en el JWT (roles, permisos, metadata)         |
| **JWKS**              | JSON Web Key Set (llaves públicas para verificar JWT)         |

---

## Aprobaciones

| Rol           | Nombre | Firma | Fecha |
| ------------- | ------ | ----- | ----- |
| Tech Lead     |        |       |       |
| Product Owner |        |       |       |
| Security Lead |        |       |       |

---

**Fin del documento**

_Versión 1.0 - Febrero 2026_
