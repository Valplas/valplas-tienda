# Refresh Token Sessions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persistir refresh tokens en la base de datos con rotación en cada uso, duración de 30 minutos, y limpieza automática diaria a las 3 AM.

**Architecture:** Cada refresh token se hashea (SHA-256) y se guarda en una tabla `refresh_tokens`. Al hacer refresh, el token viejo se revoca y se emite uno nuevo (rotación). El logout revoca el token en DB además de limpiar la cookie. Un cron job con `node-cron` corre diariamente a las 3 AM (Buenos Aires) para eliminar tokens expirados y revocados.

**Tech Stack:** PostgreSQL + node-cron + crypto (built-in Node.js) + jsonwebtoken (ya instalado)

---

## Contexto del código actual

- `apps/api/src/modules/auth/auth.service.ts` — genera tokens; `refreshAccessToken` solo verifica JWT, no toca DB
- `apps/api/src/modules/auth/auth.controller.ts` — setea cookies; `logout` no revoca nada en DB
- `apps/api/src/modules/auth/auth.repository.ts` — queries de usuarios; sin tabla de tokens
- `apps/api/src/env.ts` — `JWT_REFRESH_EXPIRES_IN` default `'7d'`; hay que cambiarlo a `'30m'`
- Última migración: `028_fix_legacy_order_number_padding.sql`
- BullMQ no está instalado (Iteración 2) — usar `node-cron` para el cleanup

---

## Tarea 1: Migración DB — tabla refresh_tokens

**Archivos:**

- Crear: `apps/api/src/infrastructure/database/migrations/029_create_refresh_tokens.sql`

**Paso 1: Crear la migración**

```sql
-- 029_create_refresh_tokens.sql
-- Description: Persist refresh tokens for rotation and revocation

CREATE TABLE refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE, -- SHA-256 del token, nunca el token plano
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,                 -- NULL = activo
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Búsqueda por hash (en cada refresh y logout)
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

-- Búsqueda por usuario (para revocar todas las sesiones)
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);

-- Cleanup eficiente por fecha
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- Rollback:
-- DROP INDEX IF EXISTS idx_refresh_tokens_expires_at;
-- DROP INDEX IF EXISTS idx_refresh_tokens_user_id;
-- DROP INDEX IF EXISTS idx_refresh_tokens_token_hash;
-- DROP TABLE IF EXISTS refresh_tokens;
```

**Paso 2: Ejecutar la migración**

```bash
cd C:/Programacion/ValplasTienda/valplas-tienda
bun db:migrate
```

Expected: `✅ Migration 029_create_refresh_tokens.sql applied`

**Paso 3: Verificar en DB que la tabla existe**

```bash
# En psql o cualquier cliente SQL:
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'refresh_tokens';
```

Expected: columnas id, user_id, token_hash, expires_at, revoked_at, created_at

**Paso 4: Commit**

```bash
git add apps/api/src/infrastructure/database/migrations/029_create_refresh_tokens.sql
git commit -m "feat(auth): migration to create refresh_tokens table"
```

---

## Tarea 2: Repository — refresh-token.repository.ts

**Archivos:**

- Crear: `apps/api/src/modules/auth/refresh-token.repository.ts`

**Paso 1: Crear el archivo**

```typescript
// apps/api/src/modules/auth/refresh-token.repository.ts
import { query } from '../../infrastructure/database/client.js';

interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}

/**
 * Guardar nuevo refresh token en DB
 */
export async function saveRefreshToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date
): Promise<void> {
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );
}

/**
 * Buscar un token válido (no expirado, no revocado)
 */
export async function findValidToken(tokenHash: string): Promise<RefreshTokenRow | null> {
  const result = await query<RefreshTokenRow>(
    `SELECT * FROM refresh_tokens
     WHERE token_hash = $1
       AND revoked_at IS NULL
       AND expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  );
  return result.rows[0] || null;
}

/**
 * Revocar un token específico
 */
export async function revokeToken(tokenHash: string): Promise<void> {
  await query(
    `UPDATE refresh_tokens
     SET revoked_at = NOW()
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash]
  );
}

/**
 * Revocar todos los tokens activos de un usuario (logout de todos los dispositivos)
 */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  await query(
    `UPDATE refresh_tokens
     SET revoked_at = NOW()
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
}

/**
 * Eliminar tokens expirados y revocados hace más de 30 días.
 * Llamado por el cron job diario.
 */
export async function deleteExpiredAndRevoked(): Promise<number> {
  const result = await query(
    `DELETE FROM refresh_tokens
     WHERE expires_at < NOW()
        OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '30 days')`,
    []
  );
  return result.rowCount ?? 0;
}
```

**Paso 2: Typecheck**

```bash
cd apps/api && bun run typecheck
```

Expected: sin errores

**Paso 3: Commit**

```bash
git add apps/api/src/modules/auth/refresh-token.repository.ts
git commit -m "feat(auth): add refresh token repository"
```

---

## Tarea 3: Auth Service — integrar DB en login, register y logout

**Archivos:**

- Modificar: `apps/api/src/modules/auth/auth.service.ts`

El servicio necesita:

1. Una función utilitaria `hashToken(token)` para hashear antes de guardar
2. En `login` y `register`: guardar el hash del refresh token en DB
3. Nueva función `revokeRefreshToken(token)` para el logout

**Paso 1: Agregar import del repository y la función hash**

```typescript
import { createHash } from 'crypto';
import * as refreshTokenRepository from './refresh-token.repository.js';
import ms from 'ms';

/**
 * Hashear token para almacenamiento seguro (nunca guardar el token plano)
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
```

**Paso 2: Actualizar `register` para guardar el token en DB**

Después de `const refreshToken = generateRefreshToken(user.id);`, agregar:

```typescript
// Guardar refresh token en DB
const tokenHash = hashToken(refreshToken);
const expiresAt = new Date(Date.now() + ms(env.JWT_REFRESH_EXPIRES_IN as string));
await refreshTokenRepository.saveRefreshToken(user.id, tokenHash, expiresAt);
```

**Paso 3: Igual en `login`**

Mismo bloque después de `const refreshToken = generateRefreshToken(user.id);`

**Paso 4: Agregar función `revokeRefreshToken`**

```typescript
/**
 * Revocar un refresh token (logout)
 * Falla silenciosamente si el token no existe — el token expirará solo
 */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  try {
    const tokenHash = hashToken(refreshToken);
    await refreshTokenRepository.revokeToken(tokenHash);
  } catch {
    // Ignorar errores — la cookie ya se va a limpiar de todas formas
  }
}
```

**Paso 5: Typecheck**

```bash
cd apps/api && bun run typecheck
```

**Paso 6: Commit**

```bash
git add apps/api/src/modules/auth/auth.service.ts
git commit -m "feat(auth): save refresh token to DB on login/register, add revokeRefreshToken"
```

---

## Tarea 4: Auth Service — rotación del refresh token en refreshAccessToken

**Archivos:**

- Modificar: `apps/api/src/modules/auth/auth.service.ts`

La función actual solo verifica el JWT. Ahora debe:

1. Verificar el JWT
2. Verificar que el token existe y es válido en DB (no revocado)
3. Revocar el token viejo
4. Generar nuevos access + refresh tokens
5. Guardar el nuevo refresh token en DB
6. Retornar ambos tokens (el controller seteará la nueva cookie)

**Paso 1: Reemplazar `refreshAccessToken`**

```typescript
/**
 * Rotar refresh token: verifica en DB, revoca el viejo, emite uno nuevo
 * Retorna ambos tokens para que el controller setee las cookies
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; newRefreshToken: string }> {
  // 1. Verificar firma del JWT
  let payload: RefreshTokenPayload;
  try {
    payload = jwt.verify(refreshToken, env.JWT_SECRET) as RefreshTokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError('TOKEN_EXPIRED', 'Sesión expirada', 401);
    }
    throw new AppError('INVALID_TOKEN', 'Token inválido', 401);
  }

  // 2. Verificar que existe y es válido en DB
  const tokenHash = hashToken(refreshToken);
  const storedToken = await refreshTokenRepository.findValidToken(tokenHash);

  if (!storedToken) {
    throw new AppError('INVALID_TOKEN', 'Token inválido o ya utilizado', 401);
  }

  // 3. Verificar que el usuario sigue activo
  const user = await authRepository.findUserById(payload.userId);
  if (!user || !user.is_active) {
    throw new AppError('INVALID_TOKEN', 'Token inválido', 401);
  }

  // 4. Revocar el token viejo
  await refreshTokenRepository.revokeToken(tokenHash);

  // 5. Generar nuevos tokens
  const accessToken = generateAccessToken(user);
  const newRefreshToken = generateRefreshToken(user.id);

  // 6. Guardar nuevo refresh token en DB
  const newTokenHash = hashToken(newRefreshToken);
  const expiresAt = new Date(Date.now() + ms(env.JWT_REFRESH_EXPIRES_IN as string));
  await refreshTokenRepository.saveRefreshToken(user.id, newTokenHash, expiresAt);

  return { accessToken, newRefreshToken };
}
```

**Paso 2: Typecheck**

```bash
cd apps/api && bun run typecheck
```

**Paso 3: Commit**

```bash
git add apps/api/src/modules/auth/auth.service.ts
git commit -m "feat(auth): rotate refresh token on refresh with DB validation"
```

---

## Tarea 5: Auth Controller — actualizar logout y refreshToken

**Archivos:**

- Modificar: `apps/api/src/modules/auth/auth.controller.ts`

**Cambio 1: `logout` — revocar en DB antes de limpiar cookie**

```typescript
export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const refreshToken = req.cookies[REFRESH_TOKEN_COOKIE_NAME];

    // Revocar en DB si hay token (falla silenciosamente si no existe)
    if (refreshToken) {
      await authService.revokeRefreshToken(refreshToken);
    }

    const cookieOptions = getCookieOptions();
    const { maxAge: _r, ...clearRefreshOptions } = cookieOptions;
    const { maxAge: _a, ...clearAccessOptions } = getAccessTokenCookieOptions();
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, clearRefreshOptions);
    res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, clearAccessOptions);

    return res.json(ApiResponse.success({ message: 'Sesión cerrada exitosamente' }));
  } catch (error) {
    next(error);
  }
}
```

**Cambio 2: `refreshToken` — setear nueva cookie con el token rotado**

```typescript
export async function refreshToken(req: Request, res: Response, next: NextFunction) {
  try {
    const refreshToken = req.cookies[REFRESH_TOKEN_COOKIE_NAME];

    if (!refreshToken) {
      throw new AppError('NO_REFRESH_TOKEN', 'Refresh token no encontrado', 401);
    }

    // Rotar: invalida el viejo, emite ambos tokens nuevos
    const { accessToken, newRefreshToken } = await authService.refreshAccessToken(refreshToken);

    // Setear ambas cookies nuevas
    res.cookie(ACCESS_TOKEN_COOKIE_NAME, accessToken, getAccessTokenCookieOptions());
    res.cookie(REFRESH_TOKEN_COOKIE_NAME, newRefreshToken, getCookieOptions());

    return res.json(ApiResponse.success({ message: 'Token renovado' }));
  } catch (error) {
    next(error);
  }
}
```

**Paso 3: Typecheck**

```bash
cd apps/api && bun run typecheck
```

**Paso 4: Commit**

```bash
git add apps/api/src/modules/auth/auth.controller.ts
git commit -m "feat(auth): controller revokes token on logout, sets rotated refresh cookie"
```

---

## Tarea 6: Cambiar duración del refresh token a 30 minutos

**Archivos:**

- Modificar: `apps/api/src/env.ts`
- Modificar: `.env` (si tiene JWT_REFRESH_EXPIRES_IN)

**Paso 1: Cambiar el default en `env.ts`**

```typescript
// Cambiar:
JWT_REFRESH_EXPIRES_IN: getEnv('JWT_REFRESH_EXPIRES_IN', '7d');

// Por:
JWT_REFRESH_EXPIRES_IN: getEnv('JWT_REFRESH_EXPIRES_IN', '30m');
```

**Paso 2: Actualizar `.env` si tiene la variable definida**

```bash
# En .env, si existe:
JWT_REFRESH_EXPIRES_IN=30m
```

**Paso 3: Typecheck**

```bash
cd apps/api && bun run typecheck
```

**Paso 4: Commit**

```bash
git add apps/api/src/env.ts
git commit -m "feat(auth): change refresh token expiry from 7d to 30m"
```

---

## Tarea 7: Instalar node-cron y crear cleanup job

**Archivos:**

- Crear: `apps/api/src/infrastructure/jobs/cleanup-tokens.job.ts`
- Modificar: `apps/api/src/server.ts`

**Paso 1: Instalar node-cron**

```bash
cd apps/api && bun add node-cron
bun add -d @types/node-cron
```

**Paso 2: Crear el job**

```typescript
// apps/api/src/infrastructure/jobs/cleanup-tokens.job.ts
import cron from 'node-cron';
import { deleteExpiredAndRevoked } from '../../modules/auth/refresh-token.repository.js';

/**
 * Cleanup job — elimina refresh tokens expirados y revocados.
 * Corre todos los días a las 3 AM (Buenos Aires, UTC-3).
 *
 * Sin BullMQ (Iteración 2+), usar node-cron directamente.
 * Migrar a BullMQ cuando esté disponible.
 */
export function startCleanupJobs(): void {
  cron.schedule(
    '0 3 * * *',
    async () => {
      console.log('[Cron] Iniciando limpieza de refresh tokens...');
      try {
        const deleted = await deleteExpiredAndRevoked();
        console.log(`[Cron] ✅ ${deleted} refresh tokens eliminados`);
      } catch (error) {
        console.error('[Cron] ❌ Error limpiando refresh tokens:', error);
      }
    },
    { timezone: 'America/Argentina/Buenos_Aires' }
  );

  console.log('✅ Cron jobs iniciados (cleanup tokens: 3 AM Buenos Aires)');
}
```

**Paso 3: Registrar el job en server.ts**

Agregar al inicio del servidor, después de la configuración pero antes de `app.listen`:

```typescript
import { startCleanupJobs } from './infrastructure/jobs/cleanup-tokens.job.js';

// Dentro del bloque de inicialización del servidor:
startCleanupJobs();
```

**Paso 4: Typecheck**

```bash
cd apps/api && bun run typecheck
```

**Paso 5: Commit**

```bash
git add apps/api/src/infrastructure/jobs/cleanup-tokens.job.ts
git add apps/api/src/server.ts
git add apps/api/package.json bun.lockb
git commit -m "feat(auth): add daily cleanup job for expired refresh tokens"
```

---

## Checklist de verificación final

### Flujo de login

- [ ] Login exitoso → fila nueva en `refresh_tokens` con `token_hash` y `expires_at` 30 min desde ahora
- [ ] `revoked_at` es NULL en la fila nueva

### Flujo de refresh

- [ ] Hacer refresh → fila vieja tiene `revoked_at` seteado
- [ ] Nueva fila en `refresh_tokens` con nuevo hash
- [ ] Cookie `refreshToken` actualizada en el browser
- [ ] Cookie `accessToken` actualizada en el browser

### Flujo de logout

- [ ] Logout → fila del token tiene `revoked_at` seteado
- [ ] Intentar usar el mismo token después de logout → 401 `INVALID_TOKEN`
- [ ] Cookies limpias en el browser

### Seguridad

- [ ] La tabla `refresh_tokens` nunca contiene el token plano — solo el hash SHA-256
- [ ] Un token revocado no puede ser reutilizado (aunque el JWT siga siendo válido temporalmente)

### Cleanup job

- [ ] El servidor inicia con el mensaje: `✅ Cron jobs iniciados (cleanup tokens: 3 AM Buenos Aires)`
- [ ] Invocar `deleteExpiredAndRevoked()` manualmente en una sesión de prueba y verificar que elimina filas viejas

### Duración

- [ ] Token expira en 30 minutos (verificar `expires_at` en DB = NOW() + 30 min)
