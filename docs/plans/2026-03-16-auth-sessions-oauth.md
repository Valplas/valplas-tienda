# Auth — Secure Sessions & Google OAuth Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Mover el access token de localStorage a cookie HttpOnly, agregar refresh automático, proteger rutas correctamente y agregar login con Google.

**Architecture:** El backend setea ambos tokens como cookies HttpOnly (mismo patrón que el refreshToken actual). El browser los envía automáticamente con `credentials: 'include'`. El cliente intercepta 401s, hace refresh silencioso y reintenta. La protección de rutas se centraliza en un hook reutilizable. Google OAuth usa una estrategia Passport en el backend con redirect flow.

**Tech Stack:** Express + jsonwebtoken + passport-google-oauth20 / Next.js + Zustand + shadcn/ui

---

## Contexto del código actual

- `apps/api/src/modules/auth/auth.controller.ts` — ya setea cookie `refreshToken`; `accessToken` va en el body
- `apps/api/src/shared/middleware/auth.middleware.ts` — solo lee de `Authorization: Bearer`, hay que agregar cookies
- `apps/web/src/lib/api.ts` — guarda token en `localStorage`, envía `Authorization: Bearer` manualmente
- `apps/web/src/lib/services/auth.service.ts` — llama `setAccessToken()` tras login/register
- `apps/web/src/stores/auth-store.ts` — hidrata via `GET /auth/me` en mount
- Última migración: `028_fix_legacy_order_number_padding.sql`

---

## Parte 1: Sesiones Seguras

### Tarea 1: Backend — Enviar accessToken como cookie HttpOnly

**Archivos:**

- Modificar: `apps/api/src/modules/auth/auth.controller.ts`

El accessToken actualmente va en el body de la respuesta. Hay que moverlo a una cookie HttpOnly con las mismas opciones que el refreshToken pero con 15 minutos de expiración.

**Paso 1: Agregar la constante y helper para la cookie del accessToken**

```typescript
// Agregar junto a REFRESH_TOKEN_COOKIE_NAME (línea 6)
const ACCESS_TOKEN_COOKIE_NAME = 'accessToken';
const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000; // 15 min en ms

const getAccessTokenCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
  maxAge: ACCESS_TOKEN_MAX_AGE,
  path: '/'
});
```

**Paso 2: En `register` y `login`, setear la cookie y sacar accessToken del body**

```typescript
// Reemplazar el return en login y register:
res.cookie(ACCESS_TOKEN_COOKIE_NAME, result.accessToken, getAccessTokenCookieOptions());
res.cookie(REFRESH_TOKEN_COOKIE_NAME, result.refreshToken, getCookieOptions());

return res.json(
  ApiResponse.success({ user: result.user })
  // ↑ sin accessToken ni refreshToken en el body
);
```

**Paso 3: En `refreshToken`, setear nueva cookie (no devolver en body)**

```typescript
res.cookie(ACCESS_TOKEN_COOKIE_NAME, newAccessToken, getAccessTokenCookieOptions());

return res.json(ApiResponse.success({ message: 'Token renovado' }));
```

**Paso 4: En `logout`, limpiar ambas cookies**

```typescript
const cookieOptions = getCookieOptions();
const { maxAge: _r, ...clearRefreshOptions } = cookieOptions;
const { maxAge: _a, ...clearAccessOptions } = getAccessTokenCookieOptions();

res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, clearRefreshOptions);
res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, clearAccessOptions);

return res.json(ApiResponse.success({ message: 'Sesión cerrada exitosamente' }));
```

**Paso 5: Actualizar `AuthResponse` en `auth.types.ts` — los tokens ya no son necesarios en el tipo de respuesta HTTP**

```typescript
// auth.types.ts — el AuthResponse interno del servicio no cambia,
// pero documentar que el controller no los expone en el body
```

**Paso 6: Verificar typecheck**

```bash
cd apps/api && bun run typecheck
```

**Paso 7: Commit**

```bash
git add apps/api/src/modules/auth/auth.controller.ts
git commit -m "feat(auth): send accessToken as HttpOnly cookie, remove from body"
```

---

### Tarea 2: Backend — Auth middleware lee de cookie (con fallback a header)

**Archivos:**

- Modificar: `apps/api/src/shared/middleware/auth.middleware.ts`

El middleware actual solo acepta `Authorization: Bearer`. Hay que agregar lectura de la cookie `accessToken` primero (browsers), con fallback al header (Postman/API externos).

**Paso 1: Actualizar `authMiddleware`**

```typescript
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Cookie primero (browsers con HttpOnly), luego Authorization header (API clients)
    const token =
      req.cookies?.['accessToken'] ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.split(' ')[1]
        : undefined);

    if (!token) {
      res.status(401).json(ApiResponse.error('UNAUTHORIZED', 'No autenticado'));
      return;
    }

    const payload = verifyAccessToken(token);

    req.user = {
      userId: payload.userId,
      email: payload.email,
      role: payload.role
    } as AuthenticatedUser;

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json(ApiResponse.error('INVALID_TOKEN', 'Token inválido o expirado'));
      return;
    }
    next(error);
  }
}
```

**Paso 2: Correr tests existentes**

```bash
cd apps/api && bun test src/tests/auth/
```

Expected: todos en verde (los tests usan Authorization header, que sigue siendo fallback).

**Paso 3: Commit**

```bash
git add apps/api/src/shared/middleware/auth.middleware.ts
git commit -m "feat(auth): read accessToken from cookie with Authorization header fallback"
```

---

### Tarea 3: Frontend — Eliminar localStorage, usar cookies

**Archivos:**

- Modificar: `apps/web/src/lib/api.ts`
- Modificar: `apps/web/src/lib/services/auth.service.ts`

El browser ya envía las cookies automáticamente con `credentials: 'include'` (ya está configurado). Solo hay que limpiar el código que maneja tokens manualmente.

**Paso 1: En `api.ts`, eliminar las funciones de localStorage y el header Authorization**

Eliminar estas funciones completamente:

```typescript
// BORRAR:
function getAccessToken(): string | null { ... }
export function setAccessToken(token: string): void { ... }
export function removeAccessToken(): void { ... }
```

En `fetchApi`, eliminar:

```typescript
// BORRAR estas líneas:
const token = getAccessToken();
// y dentro de headers:
...(token && { Authorization: `Bearer ${token}` }),
```

El `fetchApi` simplificado queda:

```typescript
async function fetchApi<T>(endpoint: string, options?: FetchOptions): Promise<ApiResponse<T>> {
  const url = `${API_URL}${endpoint}`;
  const { silentErrors, ...fetchOptions } = options || {};

  try {
    const res = await fetch(url, {
      ...fetchOptions,
      headers: {
        'Content-Type': 'application/json',
        ...fetchOptions?.headers
      },
      credentials: 'include' // Envía cookies automáticamente
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error?.message || 'Error de conexión');
    }

    return data;
  } catch (error) {
    if (!silentErrors) console.error('API Error:', error);
    throw error;
  }
}
```

**Paso 2: En `auth.service.ts`, eliminar manejo de tokens**

```typescript
// Actualizar AuthResponse (el body ya no trae accessToken):
export interface AuthResponse {
  user: User;
  // accessToken ya no viene en el body — es cookie HttpOnly
}

// login: eliminar setAccessToken
export async function login(data: LoginData): Promise<AuthResponse> {
  const response = await post<AuthResponse>('/auth/login', data);
  if (response.success && response.data) {
    return response.data; // sin setAccessToken()
  }
  throw new Error(response.error?.message || 'Error al iniciar sesión');
}

// register: eliminar setAccessToken
export async function register(data: RegisterData): Promise<AuthResponse> {
  const response = await post<AuthResponse>('/auth/register', data);
  if (response.success && response.data) {
    return response.data; // sin setAccessToken()
  }
  throw new Error(response.error?.message || 'Error al registrar usuario');
}

// logout: eliminar removeAccessToken (el backend limpia las cookies)
export async function logout(): Promise<void> {
  await post('/auth/logout');
  // sin removeAccessToken() — el backend borra las cookies
}

// refreshAccessToken: simplificar, no hay token en body
export async function refreshAccessToken(): Promise<void> {
  const response = await post('/auth/refresh');
  if (!response.success) {
    throw new Error(response.error?.message || 'Error al renovar token');
  }
}
```

**Paso 3: Verificar typecheck**

```bash
cd apps/web && bun run typecheck
```

**Paso 4: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/lib/services/auth.service.ts
git commit -m "feat(auth): remove localStorage token storage, rely on HttpOnly cookies"
```

---

### Tarea 4: Frontend — Refresh automático al recibir 401

**Archivos:**

- Modificar: `apps/web/src/lib/api.ts`

Cuando el backend devuelve 401 (accessToken expirado), el cliente debe hacer refresh silencioso y reintentar el request original. Hay que evitar loops: no reintentar si el request fallido ES `/auth/refresh`.

**Paso 1: Agregar lógica de refresh en `fetchApi`**

```typescript
// Flag para evitar múltiples refreshes simultáneos
let isRefreshing = false;

async function fetchApi<T>(endpoint: string, options?: FetchOptions): Promise<ApiResponse<T>> {
  const url = `${API_URL}${endpoint}`;
  const { silentErrors, ...fetchOptions } = options || {};

  const res = await fetch(url, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions?.headers
    },
    credentials: 'include'
  });

  if (!res.ok) {
    // 401: intentar refresh (solo si no es el endpoint de refresh mismo)
    if (res.status === 401 && !endpoint.includes('/auth/refresh') && !isRefreshing) {
      isRefreshing = true;

      try {
        const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include'
        });

        isRefreshing = false;

        if (refreshRes.ok) {
          // Token renovado — reintentar el request original
          return fetchApi<T>(endpoint, options);
        }
      } catch {
        isRefreshing = false;
      }

      // Refresh falló — redirigir a login
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }

    const errorData = await res.json().catch(() => ({}));
    if (!silentErrors) console.error('API Error:', errorData);
    throw new Error((errorData as ApiResponse<unknown>).error?.message || 'Error de conexión');
  }

  return res.json();
}
```

**Paso 2: Verificar typecheck**

```bash
cd apps/web && bun run typecheck
```

**Paso 3: Probar manualmente**

1. Hacer login en el browser
2. En DevTools → Application → Cookies, borrar `accessToken` (dejar `refreshToken`)
3. Hacer cualquier acción que llame a la API (e.g., ir a /cuenta)
4. Verificar: la cookie `accessToken` vuelve a aparecer automáticamente sin que el usuario note nada

**Paso 4: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(auth): automatic silent token refresh on 401"
```

---

### Tarea 5: Frontend — Hook `useRequireAuth` y protección de rutas

**Archivos:**

- Crear: `apps/web/src/hooks/use-require-auth.ts`
- Modificar: páginas en `apps/web/src/app/(account)/`
- Modificar: páginas en `apps/web/src/app/admin/`

**Paso 1: Crear el hook**

```typescript
// apps/web/src/hooks/use-require-auth.ts
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { UserRole } from '@/types';

interface UseRequireAuthOptions {
  redirectTo?: string;
  allowedRoles?: UserRole[];
}

/**
 * Verifica que el usuario esté autenticado y tenga el rol correcto.
 * Redirige si no cumple. Usar en páginas protegidas.
 */
export function useRequireAuth(options: UseRequireAuthOptions = {}) {
  const { redirectTo = '/login', allowedRoles } = options;
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    if (isLoading) return; // Esperar hidratación

    if (!isAuthenticated) {
      router.replace(redirectTo);
      return;
    }

    if (allowedRoles && user && !allowedRoles.includes(user.role)) {
      router.replace('/'); // Sin permisos → home
    }
  }, [isAuthenticated, isLoading, user, router, redirectTo, allowedRoles]);

  return { user, isAuthenticated, isLoading };
}
```

**Paso 2: Aplicar a páginas de cuenta**

En cada página de `(account)/` reemplazar el patrón manual de verificación:

```typescript
// Antes (patrón actual):
const { user } = useAuthStore();
// sin redirect explícito

// Después:
import { useRequireAuth } from '@/hooks/use-require-auth';

export default function CuentaPage() {
  const { user, isLoading } = useRequireAuth();

  if (isLoading || !user) return null; // se redirige automáticamente

  // ... resto del componente
}
```

**Paso 3: Aplicar a páginas de admin con verificación de rol**

```typescript
import { useRequireAuth } from '@/hooks/use-require-auth';
import { UserRole } from '@/types';

export default function AdminPage() {
  const { user, isLoading } = useRequireAuth({
    allowedRoles: [UserRole.OWNER, UserRole.ADMIN]
  });

  if (isLoading || !user) return null;

  // ... resto del componente
}
```

**Paso 4: Verificar typecheck**

```bash
cd apps/web && bun run typecheck
```

**Paso 5: Probar manualmente**

- Sin sesión → ir a `/cuenta` → debe redirigir a `/login`
- Con sesión customer → ir a `/admin` → debe redirigir a `/`
- Con sesión admin → ir a `/admin` → debe cargar normalmente

**Paso 6: Commit**

```bash
git add apps/web/src/hooks/use-require-auth.ts
git add apps/web/src/app/\(account\)/
git add apps/web/src/app/admin/
git commit -m "feat(auth): add useRequireAuth hook and enforce route protection"
```

---

## Parte 2: Google OAuth

### Tarea 6: Backend — Migración DB para OAuth

**Archivos:**

- Crear: `apps/api/src/infrastructure/database/migrations/029_add_google_oauth.sql`

Los usuarios de Google no tienen contraseña, y `username` puede ser null también. Además se necesita columna `google_id`.

**Paso 1: Crear la migración**

```sql
-- 029_add_google_oauth.sql
-- Agrega soporte para Google OAuth en la tabla users

-- Columna para el ID de Google
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;

-- La contraseña pasa a ser opcional (usuarios OAuth no tienen password)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- El username también puede ser null (usuarios OAuth se crean sin username)
ALTER TABLE users ALTER COLUMN username DROP NOT NULL;

-- Rollback:
-- ALTER TABLE users DROP COLUMN IF EXISTS google_id;
-- ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;
-- ALTER TABLE users ALTER COLUMN username SET NOT NULL;
```

**Paso 2: Ejecutar la migración**

```bash
cd /c/Programacion/ValplasTienda/valplas-tienda
bun db:migrate
```

**Paso 3: Commit**

```bash
git add apps/api/src/infrastructure/database/migrations/029_add_google_oauth.sql
git commit -m "feat(auth): migration to add google_id and make password/username optional"
```

---

### Tarea 7: Backend — Instalar dependencias de Google OAuth

**Paso 1: Instalar**

```bash
cd apps/api && bun add passport passport-google-oauth20
bun add -d @types/passport @types/passport-google-oauth20
```

**Paso 2: Commit**

```bash
git add apps/api/package.json bun.lockb
git commit -m "chore(auth): add passport and passport-google-oauth20"
```

---

### Tarea 8: Backend — Exportar generadores de tokens

**Archivos:**

- Modificar: `apps/api/src/modules/auth/auth.service.ts`

Las funciones `generateAccessToken` y `generateRefreshToken` son privadas. El controller de OAuth las necesita. Exportarlas.

**Paso 1: Agregar `export` a ambas funciones**

```typescript
// Cambiar:
function generateAccessToken(...) { ... }
function generateRefreshToken(...) { ... }

// Por:
export function generateAccessToken(...) { ... }
export function generateRefreshToken(...) { ... }
```

**Paso 2: Commit**

```bash
git add apps/api/src/modules/auth/auth.service.ts
git commit -m "refactor(auth): export token generator functions for OAuth reuse"
```

---

### Tarea 9: Backend — Repositorio, servicio y controller de Google OAuth

**Archivos:**

- Modificar: `apps/api/src/modules/auth/auth.repository.ts` (agregar métodos OAuth)
- Crear: `apps/api/src/modules/auth/oauth.controller.ts`
- Modificar: `apps/api/src/modules/auth/auth.routes.ts`
- Modificar: `apps/api/src/env.ts`
- Modificar: `apps/api/src/server.ts`

**Paso 1: Agregar variables de entorno en `env.ts`**

```typescript
// Agregar en el schema de Zod:
GOOGLE_CLIENT_ID: z.string(),
GOOGLE_CLIENT_SECRET: z.string(),
GOOGLE_CALLBACK_URL: z.string(),
FRONTEND_URL: z.string().default('http://localhost:3000'),
```

**Paso 2: Agregar métodos OAuth en `auth.repository.ts`**

```typescript
/**
 * Buscar usuario por Google ID
 */
export async function findUserByGoogleId(googleId: string): Promise<User | null> {
  const result = await query<User>(
    `SELECT * FROM users
     WHERE google_id = $1
       AND deleted_at IS NULL
     LIMIT 1`,
    [googleId]
  );
  return result.rows[0] || null;
}

/**
 * Vincular Google ID a usuario existente
 */
export async function linkGoogleId(userId: string, googleId: string): Promise<void> {
  await query(`UPDATE users SET google_id = $1, updated_at = NOW() WHERE id = $2`, [
    googleId,
    userId
  ]);
}

/**
 * Crear usuario via OAuth (sin password)
 */
export async function createOAuthUser(data: {
  email: string;
  firstName: string;
  lastName: string;
  googleId: string;
}): Promise<User> {
  const result = await query<User>(
    `INSERT INTO users (email, first_name, last_name, google_id, role, is_active)
     VALUES ($1, $2, $3, $4, 'customer', true)
     RETURNING *`,
    [data.email, data.firstName, data.lastName, data.googleId]
  );
  return result.rows[0];
}
```

**Paso 3: Crear `oauth.controller.ts`**

```typescript
// apps/api/src/modules/auth/oauth.controller.ts
import type { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { env } from '../../env.js';
import * as authRepository from './auth.repository.js';
import { generateAccessToken, generateRefreshToken } from './auth.service.js';

const COOKIE_OPTIONS_BASE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
  path: '/'
};

// Configurar estrategia de Google
passport.use(
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: env.GOOGLE_CALLBACK_URL
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;

        if (!email) {
          return done(new Error('No se pudo obtener el email de Google'));
        }

        // Buscar por Google ID primero
        let user = await authRepository.findUserByGoogleId(profile.id);

        if (!user) {
          // Buscar por email (cuenta local existente)
          user = await authRepository.findUserByEmail(email);

          if (user) {
            // Vincular Google ID a cuenta existente
            await authRepository.linkGoogleId(user.id, profile.id);
          } else {
            // Crear nueva cuenta
            user = await authRepository.createOAuthUser({
              email,
              firstName: profile.name?.givenName || '',
              lastName: profile.name?.familyName || '',
              googleId: profile.id
            });
          }
        }

        done(null, user);
      } catch (error) {
        done(error as Error);
      }
    }
  )
);

/**
 * GET /api/auth/google
 * Redirige a la pantalla de consent de Google
 */
export function googleAuth(req: Request, res: Response, next: NextFunction) {
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false
  })(req, res, next);
}

/**
 * GET /api/auth/google/callback
 * Google redirige aquí con el code. Setea cookies y redirige al frontend.
 */
export function googleCallback(req: Request, res: Response, next: NextFunction) {
  passport.authenticate(
    'google',
    { session: false },
    (err: Error | null, user: { id: string; email: string | null; role: string } | false) => {
      if (err || !user) {
        return res.redirect(`${env.FRONTEND_URL}/login?error=oauth_failed`);
      }

      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user.id);

      res.cookie('accessToken', accessToken, {
        ...COOKIE_OPTIONS_BASE,
        maxAge: 15 * 60 * 1000
      });

      res.cookie('refreshToken', refreshToken, {
        ...COOKIE_OPTIONS_BASE,
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      return res.redirect(`${env.FRONTEND_URL}/cuenta`);
    }
  )(req, res, next);
}
```

**Paso 4: Agregar rutas en `auth.routes.ts`**

```typescript
import * as oauthController from './oauth.controller.js';

// Agregar al final del router:
router.get('/google', oauthController.googleAuth);
router.get('/google/callback', oauthController.googleCallback);
```

**Paso 5: Inicializar Passport en `server.ts`**

```typescript
import passport from 'passport';
import './modules/auth/oauth.controller.js'; // Registra la estrategia de Google

// Agregar antes de las rutas:
app.use(passport.initialize());
```

**Paso 6: Agregar variables al `.env` y `.env.example`**

```bash
# .env (valores reales — NO commitear)
GOOGLE_CLIENT_ID=tu_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=tu_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback
FRONTEND_URL=http://localhost:3000
```

Para configurar el proyecto en Google Cloud Console:

- Ir a https://console.cloud.google.com → APIs & Services → Credentials
- Crear OAuth 2.0 Client ID (tipo: Web application)
- Authorized redirect URIs: `http://localhost:3001/api/auth/google/callback`
- Copiar Client ID y Client Secret al `.env`

**Paso 7: Verificar typecheck**

```bash
cd apps/api && bun run typecheck
```

**Paso 8: Commit**

```bash
git add apps/api/src/modules/auth/auth.repository.ts
git add apps/api/src/modules/auth/oauth.controller.ts
git add apps/api/src/modules/auth/auth.routes.ts
git add apps/api/src/server.ts
git add apps/api/src/env.ts
git add .env.example
git commit -m "feat(auth): add Google OAuth backend with Passport"
```

---

### Tarea 10: Frontend — Botón de Google OAuth

**Archivos:**

- Crear: `apps/web/src/components/auth/google-auth-button.tsx`
- Modificar: `apps/web/src/app/(auth)/login/page.tsx`
- Modificar: `apps/web/src/app/(auth)/registro/page.tsx`

**Paso 1: Crear el componente**

```tsx
// apps/web/src/components/auth/google-auth-button.tsx
'use client';

import { Button } from '@/components/ui/button';

interface GoogleAuthButtonProps {
  label?: string;
}

export function GoogleAuthButton({ label = 'Continuar con Google' }: GoogleAuthButtonProps) {
  const handleClick = () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    window.location.href = `${apiUrl}/auth/google`;
  };

  return (
    <Button type="button" variant="outline" className="w-full" onClick={handleClick}>
      <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          fill="#4285F4"
        />
        <path
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          fill="#34A853"
        />
        <path
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          fill="#FBBC05"
        />
        <path
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          fill="#EA4335"
        />
      </svg>
      {label}
    </Button>
  );
}
```

**Paso 2: Agregar a la página de login**

Insertar debajo del formulario de login existente:

```tsx
import { GoogleAuthButton } from '@/components/auth/google-auth-button';

// Dentro del JSX, después del botón de submit:
<div className="relative my-4">
  <div className="absolute inset-0 flex items-center">
    <span className="w-full border-t" />
  </div>
  <div className="relative flex justify-center text-xs uppercase">
    <span className="bg-background px-2 text-muted-foreground">o</span>
  </div>
</div>

<GoogleAuthButton label="Iniciar sesión con Google" />
```

**Paso 3: Agregar a la página de registro**

Mismo patrón, con label diferente:

```tsx
<GoogleAuthButton label="Registrarse con Google" />
```

**Paso 4: Verificar typecheck**

```bash
cd apps/web && bun run typecheck
```

**Paso 5: Probar el flow completo**

1. Ir a `/login`
2. Hacer click en "Iniciar sesión con Google"
3. Completar el consent de Google
4. Verificar redirección a `/cuenta`
5. Verificar cookies `accessToken` y `refreshToken` en DevTools

**Paso 6: Commit**

```bash
git add apps/web/src/components/auth/google-auth-button.tsx
git add apps/web/src/app/\(auth\)/login/
git add apps/web/src/app/\(auth\)/registro/
git commit -m "feat(auth): add Google OAuth button to login and register pages"
```

---

## Checklist de verificación final

### Sesiones

- [ ] Login setea cookies `accessToken` (15min) y `refreshToken` (7d) en DevTools
- [ ] NO hay `access_token` en localStorage después del login
- [ ] Requests a endpoints protegidos funcionan sin header Authorization manual
- [ ] Borrar cookie `accessToken` → siguiente request renueva automáticamente
- [ ] Borrar ambas cookies → redirige a `/login`
- [ ] Logout limpia ambas cookies

### Protección de rutas

- [ ] Sin sesión → `/cuenta` redirige a `/login`
- [ ] Sin sesión → `/admin` redirige a `/login`
- [ ] Como customer → `/admin` redirige a `/`
- [ ] Como admin → `/admin` carga correctamente

### Google OAuth

- [ ] Botón "Continuar con Google" visible en login y registro
- [ ] Click redirige a consent de Google
- [ ] Post-auth → cookies seteadas, redirige a `/cuenta`
- [ ] Login con Google en cuenta que ya existe por email → vincula sin error
- [ ] Login con Google en cuenta nueva → crea usuario automáticamente

---

## Variables de entorno a agregar

### Backend (`.env`)

```
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxx
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback
FRONTEND_URL=http://localhost:3000
```

### Producción

```
GOOGLE_CALLBACK_URL=https://api.valplas.net/api/auth/google/callback
FRONTEND_URL=https://valplas.net
```
