# Login con Google + merge de cuentas legacy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arreglar el login con Google existente y agregar el merge (no bloqueante, hecho por el admin) entre cuentas nuevas y cuentas legacy migradas del CRM.

**Architecture:** Backend Express (`apps/api`): migración 040 (`is_legacy`, `merged_into_id`, `user_merge_dismissals`, `normalize_street()`), un submódulo `user-merge.*` dentro de `modules/users` (identidad pura → repositorio transaccional → domain → controller/routes), y un refactor de `modules/auth` (cookies compartidas, `issueSession`, state store de Passport en cookie, `resolveGoogleUser`). Frontend Next.js (`apps/web`): `ApiError` en el cliente HTTP, botón Google con redirect y loading, toast de errores OAuth, y en el admin `MergeUsersDialog`, `/admin/usuarios/duplicados` y la integración en `/admin/usuarios`.

**Tech Stack:** Express 5, pg, Zod 4, Passport + passport-google-oauth20, libphonenumber-js, Vitest (contra la DB real), Next.js 16 / React 19, shadcn/ui, sonner.

**Spec:** `docs/superpowers/specs/2026-10-05-google-auth-account-merge-design.md`

## Global Constraints

- Rama: `feature/google-auth-merge`. Nunca commitear en `develop` ni `main` (verificar con `git branch --show-current` antes de cada commit).
- Commits convencionales (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`), y cada mensaje termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Respuestas JSON: el backend arma objetos en snake_case y `camelCaseResponse` los convierte (incluido `error.details`). Los tipos del frontend van en camelCase; los bodies y query params que se envían al backend, en snake_case.
- `password_hash` nunca aparece en respuestas ni pasa por objetos JS del merge (se copia en SQL).
- Sin N+1: nada de `Promise.all(items.map(fetch))`. `Promise.all` solo para recursos independientes.
- Migraciones inmutables: solo se crea `040_add_user_merge_support.sql`, con el rollback comentado.
- Botones que disparan async: estado `loading` local, `disabled`, `Loader2` + label "…ando..." y reset en `finally`.
- UI en español rioplatense ("vos"), mobile-first.
- Teléfonos en E.164 (`+5491122334455`) normalizados con libphonenumber-js.
- Tests API: Vitest contra la DB de `apps/api/.env` (compartida). Los datos de test usan email `*@vitest.local` o `vitest.*@sinmail.local`; los limpia `src/tests/setup.ts`.
- Comandos de test desde `apps/api`: `bunx vitest run <ruta>`.

## Review Focus

1. El admin carga un email con otra capitalización ("Maria@Gmail.com") que ya usa una cuenta Google: tiene que dar conflicto 409, no crear un duplicado (test en Task 2).
2. El admin carga el teléfono en formato local ("11 4123-4567") y ya existe guardado en E.164: tiene que detectar el conflicto (test en Task 2).
3. Redirect malicioso en `/auth/google?redirect=` (`//evil.com`, `/\evil.com`, `/\t/evil.com`, `https://evil.com`): siempre cae en el default por rol (tests en Task 7).
4. Direcciones legacy `s/n` o de órdenes del CRM con ciudad fija "Buenos Aires": ni falsos matches ni exclusión por ciudad (tests en Task 5).
5. Dos admins fusionan el mismo par, o se re-envía el merge: el segundo intento devuelve 404 sin tocar datos (test en Task 4).

---

### Task 1: Migración 040 + soporte de tests

**Files:**

- Create: `apps/api/src/infrastructure/database/migrations/040_add_user_merge_support.sql`
- Modify: `apps/api/src/tests/setup.ts`
- Modify: `apps/api/src/tests/helpers.ts` (agregar fábricas al final)
- Test: `apps/api/src/tests/users/normalize-street.test.ts`

**Interfaces:**

- Produces: columnas `users.is_legacy`, `users.merged_into_id`, `users.merged_at`; tabla `user_merge_dismissals(user_id, legacy_user_id, dismissed_by, created_at)`; función SQL `normalize_street(text) → text`.
- Produces (helpers de test): `createLegacyUser(overrides?) → { id, email, username }`, `createGoogleUser(overrides?) → { id, email, googleId }`, `createRawAddress(userId, { street, streetNumber, city, isDefault? }) → id`, `createRawOrder(userId, shippingStreet?) → id`, `lettersSuffix() → string`.

- [ ] **Step 1: Escribir la migración**

`apps/api/src/infrastructure/database/migrations/040_add_user_merge_support.sql`:

```sql
-- Migration 040: soporte para merge de cuentas (Google ↔ legacy del CRM)
--
-- - users.is_legacy: cuenta migrada del CRM (lo setea tools/migration/src/migrate-clients.ts)
-- - users.merged_into_id / merged_at: trazabilidad de la cuenta absorbida en un merge
-- - user_merge_dismissals: pares sugeridos que el admin marcó como "No es la misma persona"
-- - normalize_street(): normalización de calles para sugerir duplicados por dirección

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_legacy BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS merged_into_id UUID NULL REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_users_merged_into
  ON users(merged_into_id) WHERE merged_into_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_legacy
  ON users(is_legacy) WHERE is_legacy = true AND deleted_at IS NULL;

-- Backfill: cuentas migradas del CRM presentes hoy (email placeholder del script)
UPDATE users SET is_legacy = true
WHERE role = 'customer' AND email LIKE '%@sinmail.local';

CREATE TABLE IF NOT EXISTS user_merge_dismissals (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  legacy_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dismissed_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, legacy_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_merge_dismissals_legacy
  ON user_merge_dismissals(legacy_user_id);
CREATE INDEX IF NOT EXISTS idx_user_merge_dismissals_dismissed_by
  ON user_merge_dismissals(dismissed_by);

-- STABLE (no IMMUTABLE) porque unaccent() es STABLE
CREATE OR REPLACE FUNCTION normalize_street(p TEXT) RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT trim(regexp_replace(
    regexp_replace(
      regexp_replace(unaccent(lower(coalesce(p, ''))), '[^a-z0-9 ]', ' ', 'g'),
      '^\s*(av|avda|avenida|calle|pje|pasaje|bv|boulevard)\s+', '', 'g'),
    '\s+', ' ', 'g'))
$$;

-- Rollback:
-- DROP FUNCTION IF EXISTS normalize_street(TEXT);
-- DROP TABLE IF EXISTS user_merge_dismissals;
-- DROP INDEX IF EXISTS idx_users_legacy;
-- DROP INDEX IF EXISTS idx_users_merged_into;
-- ALTER TABLE users DROP COLUMN IF EXISTS merged_at;
-- ALTER TABLE users DROP COLUMN IF EXISTS merged_into_id;
-- ALTER TABLE users DROP COLUMN IF EXISTS is_legacy;
```

- [ ] **Step 2: Escribir el test de `normalize_street` (falla: la función no existe)**

`apps/api/src/tests/users/normalize-street.test.ts`:

```ts
// apps/api/src/tests/users/normalize-street.test.ts
//
// normalize_street() (migración 040) es la base del matching de duplicados por dirección.

import { describe, it, expect } from 'vitest';
import { query } from '../../infrastructure/database/client.js';

describe('normalize_street', () => {
  it.each([
    ['Av. Corrientes', 'corrientes'],
    ['AVENIDA  Rivadavia', 'rivadavia'],
    ['Avda Gaona', 'gaona'],
    ['Calle San Martín', 'san martin'],
    ['Pje. Los Álamos', 'los alamos'],
    ['  Belgrano  ', 'belgrano'],
    ['Avellaneda', 'avellaneda']
  ])('normalize_street(%s) = %s', async (input, expected) => {
    const result = await query<{ n: string }>('SELECT normalize_street($1) AS n', [input]);
    expect(result.rows[0].n).toBe(expected);
  });

  it('devuelve string vacío para NULL', async () => {
    const result = await query<{ n: string }>('SELECT normalize_street(NULL) AS n');
    expect(result.rows[0].n).toBe('');
  });
});
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `cd apps/api && bunx vitest run src/tests/users/normalize-street.test.ts`
Expected: FAIL con `function normalize_street(unknown) does not exist`.

- [ ] **Step 4: Aplicar la migración — PEDIR CONFIRMACIÓN AL USUARIO ANTES**

`apps/api/.env` apunta a la DB Supabase compartida. Antes de correr, confirmar con el usuario. Después:

Run: `cd apps/api && bun run db:migrate`
Expected: `040_add_user_merge_support.sql` ejecutada sin error. Si falla con timeout de conexión (pooler frío), reintentar.

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `cd apps/api && bunx vitest run src/tests/users/normalize-street.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Actualizar la limpieza de tests**

Reemplazar el contenido de `apps/api/src/tests/setup.ts` por:

```ts
// apps/api/src/tests/setup.ts
//
// Limpieza post-test SCOPED a datos creados por los tests:
// - usuarios `*@vitest.local` (ver helpers.ts)
// - usuarios legacy de test `vitest.*@sinmail.local` (createLegacyUser)
// - cuentas absorbidas en un merge de test (email NULL, merged_into_id → usuario de test)
// - carriers/zonas de envío con prefijo `vitest-`
//
// IMPORTANTE: no borrar por `%test.com` — los usuarios seed (cliente@test.com,
// maria@test.com) usan ese dominio y el cleanup viejo los destruía, rompiendo
// cualquier suite que dependiera del seed.

import { afterEach } from 'vitest';
import { query } from '../infrastructure/database/client.js';

const TEST_USER_MATCH = "(email LIKE '%@vitest.local' OR email LIKE 'vitest.%@sinmail.local')";
const TEST_USERS = `SELECT id FROM users WHERE ${TEST_USER_MATCH}
  OR merged_into_id IN (SELECT id FROM users WHERE ${TEST_USER_MATCH})`;
const TEST_ORDERS = `SELECT id FROM orders WHERE user_id IN (${TEST_USERS})`;

afterEach(async () => {
  // Orden: hijos → padres (FKs sin CASCADE en varios casos)
  await query(`DELETE FROM refresh_tokens WHERE user_id IN (${TEST_USERS})`);
  await query(`DELETE FROM order_items WHERE order_id IN (${TEST_ORDERS})`);
  await query(`DELETE FROM order_status_history WHERE order_id IN (${TEST_ORDERS})`);
  await query(`DELETE FROM orders WHERE user_id IN (${TEST_USERS})`);
  await query(`DELETE FROM user_addresses WHERE user_id IN (${TEST_USERS})`);
  // Absorbidas primero: su merged_into_id apunta a usuarios de test
  await query(
    `DELETE FROM users WHERE merged_into_id IN (SELECT id FROM users WHERE ${TEST_USER_MATCH})`
  );
  await query(`DELETE FROM users WHERE ${TEST_USER_MATCH}`);
  // shipping_rates cae por CASCADE al borrar el carrier
  await query("DELETE FROM shipping_carriers WHERE code LIKE 'vitest-%'");
  await query("DELETE FROM shipping_zones WHERE name LIKE 'vitest-%'");
});
```

- [ ] **Step 7: Agregar fábricas de test**

Agregar al final de `apps/api/src/tests/helpers.ts`:

```ts
/** Sufijo solo con letras: para calles de test (los dígitos romperían el parseo calle/número). */
export function lettersSuffix(): string {
  return Array.from({ length: 10 }, () =>
    String.fromCharCode(97 + Math.floor(Math.random() * 26))
  ).join('');
}

/**
 * Cliente legacy (como lo crea tools/migration/src/migrate-clients.ts): email placeholder,
 * password placeholder, nunca usó la web. El email `vitest.*@sinmail.local` lo limpia setup.ts.
 */
export async function createLegacyUser(
  overrides: Partial<{
    firstName: string;
    lastName: string | null;
    email: string;
    phone: string | null;
  }> = {}
): Promise<{ id: string; email: string; username: string }> {
  const suffix = uniqueSuffix();
  const result = await query<{ id: string; email: string; username: string }>(
    `INSERT INTO users (email, username, first_name, last_name, phone, password_hash,
                        role, is_active, is_legacy)
     VALUES ($1, $2, $3, $4, $5, 'legacy-placeholder-hash', 'customer', true, true)
     RETURNING id, email, username`,
    [
      overrides.email ?? `vitest.${suffix}@sinmail.local`,
      `vt_legacy_${suffix}`,
      overrides.firstName ?? 'Legacy',
      overrides.lastName ?? null,
      overrides.phone ?? null
    ]
  );
  return result.rows[0];
}

/** Cuenta creada por Google OAuth: sin password ni username, con google_id. */
export async function createGoogleUser(
  overrides: Partial<{ firstName: string; lastName: string; email: string }> = {}
): Promise<{ id: string; email: string; googleId: string }> {
  const suffix = uniqueSuffix();
  const email = overrides.email ?? `google-${suffix}@vitest.local`;
  const googleId = `vitest-google-${suffix}`;
  const result = await query<{ id: string }>(
    `INSERT INTO users (email, first_name, last_name, google_id, role, is_active,
                        email_verified, last_login_at)
     VALUES ($1, $2, $3, $4, 'customer', true, true, NOW())
     RETURNING id`,
    [email, overrides.firstName ?? 'Google', overrides.lastName ?? 'User', googleId]
  );
  return { id: result.rows[0].id, email, googleId };
}

export async function createRawAddress(
  userId: string,
  data: { street: string; streetNumber: string; city: string; isDefault?: boolean }
): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO user_addresses (user_id, street, street_number, city, province, postcode, is_default)
     VALUES ($1, $2, $3, $4, 'Buenos Aires', '1744', $5)
     RETURNING id`,
    [userId, data.street, data.streetNumber, data.city, data.isDefault ?? false]
  );
  return result.rows[0].id;
}

/** Orden mínima como las del CRM: dirección en texto libre, ciudad fija. */
export async function createRawOrder(
  userId: string,
  shippingStreet = 'Av. Vitest 123'
): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO orders (user_id, order_number, status, subtotal, shipping_cost, total,
                         shipping_street, shipping_street_number, shipping_city,
                         shipping_province, shipping_postcode, payment_method)
     VALUES ($1, $2, 'delivered', 1000, 0, 1000, $3, 'S/N', 'Buenos Aires',
             'Buenos Aires', '0000', 'cash')
     RETURNING id`,
    [userId, `VT-${uniqueSuffix()}`, shippingStreet]
  );
  return result.rows[0].id;
}
```

- [ ] **Step 8: Correr la suite completa para verificar que el cleanup no rompe nada**

Run: `cd apps/api && bunx vitest run`
Expected: misma cantidad de tests en verde que antes, más los 8 nuevos.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/infrastructure/database/migrations/040_add_user_merge_support.sql apps/api/src/tests/setup.ts apps/api/src/tests/helpers.ts apps/api/src/tests/users/normalize-street.test.ts
git commit -m "$(cat <<'EOF'
feat(db): add user merge support (migration 040)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Teléfono E.164 y conflictos 409 al editar usuarios

**Files:**

- Create: `apps/api/src/shared/utils/phone.ts`
- Modify: `apps/api/src/modules/users/user.repository.ts` (`findUserByEmail` case-insensitive; nueva `findUserByPhone`)
- Modify: `apps/api/src/modules/users/user.domain.ts` (`updateUser`)
- Test: `apps/api/src/tests/shared/phone.test.ts`, `apps/api/src/tests/users/user-update-conflicts.test.ts`

**Interfaces:**

- Consumes: `createLegacyUser`, `createGoogleUser`, `uniqueSuffix` (Task 1).
- Produces: `normalizePhone(raw: string): string | null`; `userRepository.findUserByPhone(phone: string): Promise<User | null>`; `updateUser` lanza `AppError` 409 `EMAIL_IN_USE` / `PHONE_IN_USE` con `details: { conflict_user_id, conflict_user_name, conflict_user_created_at }` y 400 `INVALID_PHONE`.

- [ ] **Step 1: Test de `normalizePhone` (falla: no existe)**

`apps/api/src/tests/shared/phone.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizePhone } from '../../shared/utils/phone.js';

describe('normalizePhone', () => {
  it('mantiene un número ya en E.164', () => {
    expect(normalizePhone('+5491122334455')).toBe('+5491122334455');
  });

  it('normaliza formato local argentino', () => {
    expect(normalizePhone('11 4123-4567')).toBe('+541141234567');
  });

  it('devuelve null para valores inválidos', () => {
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('123')).toBeNull();
  });
});
```

Run: `cd apps/api && bunx vitest run src/tests/shared/phone.test.ts`
Expected: FAIL (`Cannot find module '../../shared/utils/phone.js'`).

- [ ] **Step 2: Implementar `normalizePhone`**

`apps/api/src/shared/utils/phone.ts`:

```ts
import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Normaliza un teléfono a E.164 (+5491122334455). Sin prefijo internacional asume Argentina.
 * Devuelve null si el número no es válido.
 */
export function normalizePhone(raw: string): string | null {
  const parsed = parsePhoneNumberFromString(raw.trim(), 'AR');
  return parsed && parsed.isValid() ? parsed.number : null;
}
```

Run: `cd apps/api && bunx vitest run src/tests/shared/phone.test.ts`
Expected: PASS.

- [ ] **Step 3: Test de conflictos en `updateUser` (falla)**

`apps/api/src/tests/users/user-update-conflicts.test.ts`:

```ts
// apps/api/src/tests/users/user-update-conflicts.test.ts
//
// El admin completa a mano email/teléfono de clientes legacy. Si el dato ya pertenece a otra
// cuenta (ej: la que el cliente creó con Google), el guardado devuelve 409 con la cuenta en
// conflicto para ofrecer el merge — no un 500 por violación de UNIQUE.

import { describe, it, expect } from 'vitest';
import * as userDomain from '../../modules/users/user.domain.js';
import { normalizePhone } from '../../shared/utils/phone.js';
import { createGoogleUser, createLegacyUser, uniqueSuffix } from '../helpers.js';

const ADMIN_ID = '00000000-0000-4000-8000-000000000000';

describe('updateUser — conflictos de email/teléfono', () => {
  it('devuelve 409 EMAIL_IN_USE con la cuenta en conflicto, sin importar mayúsculas', async () => {
    const legacy = await createLegacyUser();
    const google = await createGoogleUser({ firstName: 'María', lastName: 'Gómez' });

    const err = await userDomain
      .updateUser(legacy.id, { email: google.email.toUpperCase() }, ADMIN_ID, 'admin')
      .catch((e: unknown) => e);

    expect(err).toMatchObject({
      statusCode: 409,
      code: 'EMAIL_IN_USE',
      details: { conflict_user_id: google.id, conflict_user_name: 'María Gómez' }
    });
  });

  it('normaliza el teléfono y detecta conflicto aunque venga en formato local', async () => {
    const local = `4${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
    const owner = await createLegacyUser({ phone: normalizePhone(`11${local}`) });
    const legacy = await createLegacyUser();

    const err = await userDomain
      .updateUser(
        legacy.id,
        { phone: `11 ${local.slice(0, 4)}-${local.slice(4)}` },
        ADMIN_ID,
        'admin'
      )
      .catch((e: unknown) => e);

    expect(err).toMatchObject({
      statusCode: 409,
      code: 'PHONE_IN_USE',
      details: { conflict_user_id: owner.id }
    });
  });

  it('rechaza un teléfono inválido con 400 INVALID_PHONE', async () => {
    const legacy = await createLegacyUser();
    const err = await userDomain
      .updateUser(legacy.id, { phone: '1234567890123' }, ADMIN_ID, 'admin')
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ statusCode: 400, code: 'INVALID_PHONE' });
  });

  it('guarda el email en minúsculas y el teléfono en E.164', async () => {
    const legacy = await createLegacyUser();
    const email = `Mixed-${uniqueSuffix()}@VITEST.local`;
    const local = `4${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;

    const updated = await userDomain.updateUser(
      legacy.id,
      { email, phone: `11 ${local}` },
      ADMIN_ID,
      'admin'
    );

    expect(updated.email).toBe(email.toLowerCase());
    expect(updated.phone).toBe(`+5411${local}`);
  });
});
```

Run: `cd apps/api && bunx vitest run src/tests/users/user-update-conflicts.test.ts`
Expected: FAIL (`Error: El email ya está en uso` en vez de AppError 409; el teléfono no se normaliza).

- [ ] **Step 4: Repositorio — email case-insensitive y búsqueda por teléfono**

En `apps/api/src/modules/users/user.repository.ts`, reemplazar `findUserByEmail` por:

```ts
/**
 * Find user by email (case-insensitive)
 */
export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await query<User>(
    `SELECT id, email, username, phone, first_name, last_name, role,
            is_active, email_verified, phone_verified, created_at, updated_at, deleted_at
     FROM users
     WHERE lower(email) = lower($1) AND deleted_at IS NULL`,
    [email]
  );

  return result.rows[0] || null;
}

/**
 * Find user by phone (E.164)
 */
export async function findUserByPhone(phone: string): Promise<User | null> {
  const result = await query<User>(
    `SELECT id, email, username, phone, first_name, last_name, role,
            is_active, email_verified, phone_verified, created_at, updated_at, deleted_at
     FROM users
     WHERE phone = $1 AND deleted_at IS NULL`,
    [phone]
  );

  return result.rows[0] || null;
}
```

- [ ] **Step 5: Domain — normalizar y devolver 409**

En `apps/api/src/modules/users/user.domain.ts`:

1. Agregar imports:

```ts
import { AppError } from '../../shared/middleware/error.middleware.js';
import { normalizePhone } from '../../shared/utils/phone.js';
```

2. Agregar debajo de `canCreateRole`:

```ts
/**
 * 409 con la cuenta que ya tiene el dato: el admin puede ofrecer fusionarlas.
 */
function contactConflict(
  code: 'EMAIL_IN_USE' | 'PHONE_IN_USE',
  message: string,
  other: User
): AppError {
  return new AppError(code, message, 409, {
    conflict_user_id: other.id,
    conflict_user_name: `${other.first_name} ${other.last_name ?? ''}`.trim(),
    conflict_user_created_at: other.created_at
  });
}
```

3. En `updateUser`, reemplazar desde el comentario `// If changing email, check it's not in use` hasta `const updated = await userRepository.updateUser(id, data);` inclusive por:

```ts
const changes: UpdateUserInput = { ...data };
if (changes.email) changes.email = changes.email.trim().toLowerCase();
if (changes.phone) {
  const normalized = normalizePhone(changes.phone);
  if (!normalized) {
    throw new AppError('INVALID_PHONE', 'Teléfono inválido', 400);
  }
  changes.phone = normalized;
}

if (changes.email && changes.email !== user.email) {
  const existing = await userRepository.findUserByEmail(changes.email);
  if (existing && existing.id !== id) {
    throw contactConflict('EMAIL_IN_USE', 'El email ya pertenece a otra cuenta', existing);
  }
}

if (changes.phone && changes.phone !== user.phone) {
  const existing = await userRepository.findUserByPhone(changes.phone);
  if (existing && existing.id !== id) {
    throw contactConflict('PHONE_IN_USE', 'El teléfono ya pertenece a otra cuenta', existing);
  }
}

// If changing username, check it's not in use
if (changes.username && changes.username !== user.username) {
  const existingUsername = await userRepository.findUserByUsername(changes.username);
  if (existingUsername) {
    throw new Error('El nombre de usuario ya está en uso');
  }
}

const updated = await userRepository.updateUser(id, changes);
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `cd apps/api && bunx vitest run src/tests/shared/phone.test.ts src/tests/users/user-update-conflicts.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/shared/utils/phone.ts apps/api/src/modules/users/user.repository.ts apps/api/src/modules/users/user.domain.ts apps/api/src/tests/shared/phone.test.ts apps/api/src/tests/users/user-update-conflicts.test.ts
git commit -m "$(cat <<'EOF'
feat(users): return 409 with conflicting account on duplicate email/phone

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Resolución de identidad del merge (función pura)

**Files:**

- Create: `apps/api/src/modules/users/user-merge.types.ts`
- Create: `apps/api/src/modules/users/user-merge.identity.ts`
- Test: `apps/api/src/tests/users/user-merge.identity.test.ts`

**Interfaces:**

- Produces (types): `PLACEHOLDER_EMAIL_DOMAIN`, `MergeCandidate`, `MergedIdentity`, `DiscardedField`, `MergeResolution`, `MergeUserSummary`, `MergePreview`, `MergeResult`, `MergeSuggestion`.
- Produces: `isPlaceholderEmail(email: string | null): boolean`; `resolveMergedIdentity(target: MergeCandidate, source: MergeCandidate): MergeResolution` (lanza `AppError` 409 `GOOGLE_ID_CONFLICT`).

- [ ] **Step 1: Tipos**

`apps/api/src/modules/users/user-merge.types.ts`:

```ts
// apps/api/src/modules/users/user-merge.types.ts

import type { UserRole } from './user.types.js';

/** Dominio de los emails placeholder que genera tools/migration/src/migrate-clients.ts */
export const PLACEHOLDER_EMAIL_DOMAIN = '@sinmail.local';

/** Fila de users necesaria para resolver un merge. Nunca incluye password_hash. */
export interface MergeCandidate {
  id: string;
  email: string | null;
  username: string | null;
  phone: string | null;
  google_id: string | null;
  first_name: string;
  last_name: string | null;
  role: UserRole;
  is_legacy: boolean;
  last_login_at: Date | null;
  email_verified: boolean;
  has_password: boolean;
  created_at: Date;
}

export interface MergedIdentity {
  email: string | null;
  username: string | null;
  phone: string | null;
  google_id: string | null;
  email_verified: boolean;
  last_login_at: Date | null;
  has_password: boolean;
}

export interface DiscardedField {
  field: 'email' | 'username' | 'phone';
  value: string;
}

export interface MergeResolution {
  /** true: el password_hash del target se reemplaza por el de la source (aunque sea NULL) */
  take_source_password: boolean;
  identity: MergedIdentity;
  discarded: DiscardedField[];
}

export interface MergeUserSummary {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  username: string | null;
  phone: string | null;
  is_legacy: boolean;
  has_google: boolean;
  created_at: Date;
  orders_count: number;
  addresses_count: number;
}

export interface MergePreview {
  target: MergeUserSummary;
  source: MergeUserSummary;
  result: {
    email: string | null;
    username: string | null;
    phone: string | null;
    email_verified: boolean;
    has_password: boolean;
    has_google: boolean;
  };
  discarded: DiscardedField[];
}

export interface MergeResult {
  target_id: string;
  source_id: string;
  moved: { orders: number; addresses: number; status_history: number };
  discarded: DiscardedField[];
}

export interface MergeSuggestion {
  user: {
    id: string;
    first_name: string;
    last_name: string | null;
    email: string | null;
    has_google: boolean;
    created_at: Date;
  };
  legacy_user: {
    id: string;
    first_name: string;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    orders_count: number;
  };
  confidence: 'high' | 'medium';
  matched_address: { street: string; street_number: string; city: string };
}
```

- [ ] **Step 2: Tests (fallan: el módulo no existe)**

`apps/api/src/tests/users/user-merge.identity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveMergedIdentity } from '../../modules/users/user-merge.identity.js';
import type { MergeCandidate } from '../../modules/users/user-merge.types.js';

function candidate(overrides: Partial<MergeCandidate>): MergeCandidate {
  return {
    id: 'id',
    email: null,
    username: null,
    phone: null,
    google_id: null,
    first_name: 'X',
    last_name: null,
    role: 'customer',
    is_legacy: false,
    last_login_at: null,
    email_verified: false,
    has_password: false,
    created_at: new Date('2026-01-01'),
    ...overrides
  };
}

const unusedLegacy = candidate({
  id: 't',
  email: 'migrado.1234abcd@sinmail.local',
  username: 'maria',
  is_legacy: true,
  has_password: true
});

const google = candidate({
  id: 's',
  email: 'maria@gmail.com',
  google_id: 'g-1',
  email_verified: true,
  last_login_at: new Date('2026-10-01')
});

describe('resolveMergedIdentity', () => {
  it('legacy sin uso ↔ Google: toma credenciales e identidad de la cuenta Google', () => {
    const r = resolveMergedIdentity(unusedLegacy, google);
    expect(r.take_source_password).toBe(true);
    expect(r.identity).toEqual({
      email: 'maria@gmail.com',
      username: null,
      phone: null,
      google_id: 'g-1',
      email_verified: true,
      last_login_at: new Date('2026-10-01'),
      has_password: false
    });
    expect(r.discarded).toEqual([]);
  });

  it('legacy con email real cargado por el admin: conserva ese email y descarta el de Google', () => {
    const target = { ...unusedLegacy, email: 'maria.perez@hotmail.com' };
    const r = resolveMergedIdentity(target, google);
    expect(r.identity.email).toBe('maria.perez@hotmail.com');
    expect(r.identity.email_verified).toBe(false);
    expect(r.identity.google_id).toBe('g-1');
    expect(r.discarded).toEqual([{ field: 'email', value: 'maria@gmail.com' }]);
  });

  it('dos cuentas reales: gana el target y se rellenan los nulos', () => {
    const target = candidate({
      id: 't',
      email: 'a@x.com',
      username: 'a',
      has_password: true,
      last_login_at: new Date('2026-09-01')
    });
    const source = candidate({
      id: 's',
      email: 'b@x.com',
      username: 'b',
      phone: '+5491122334455',
      has_password: true,
      last_login_at: new Date('2026-10-02')
    });
    const r = resolveMergedIdentity(target, source);
    expect(r.take_source_password).toBe(false);
    expect(r.identity).toMatchObject({
      email: 'a@x.com',
      username: 'a',
      phone: '+5491122334455',
      last_login_at: new Date('2026-10-02'),
      has_password: true
    });
    expect(r.discarded).toEqual([
      { field: 'email', value: 'b@x.com' },
      { field: 'username', value: 'b' }
    ]);
  });

  it('dos legacy con placeholder: conserva el placeholder del target sin descartar', () => {
    const source = { ...unusedLegacy, id: 's', email: 'migrado.9999@sinmail.local' };
    const r = resolveMergedIdentity(unusedLegacy, source);
    expect(r.identity.email).toBe('migrado.1234abcd@sinmail.local');
    expect(r.discarded).toEqual([]);
  });

  it('lanza 409 GOOGLE_ID_CONFLICT si ambas tienen Google distinto', () => {
    const target = candidate({ id: 't', google_id: 'g-1' });
    const source = candidate({ id: 's', google_id: 'g-2' });
    expect(() => resolveMergedIdentity(target, source)).toThrowError(
      expect.objectContaining({ code: 'GOOGLE_ID_CONFLICT', statusCode: 409 })
    );
  });
});
```

Run: `cd apps/api && bunx vitest run src/tests/users/user-merge.identity.test.ts`
Expected: FAIL (`Cannot find module '../../modules/users/user-merge.identity.js'`).

- [ ] **Step 3: Implementar**

`apps/api/src/modules/users/user-merge.identity.ts`:

```ts
// apps/api/src/modules/users/user-merge.identity.ts
//
// Decide la identidad de la cuenta que sobrevive a un merge. Función pura: el repositorio
// aplica el resultado en SQL (password_hash incluido, sin pasar por JS).

import { AppError } from '../../shared/middleware/error.middleware.js';
import {
  PLACEHOLDER_EMAIL_DOMAIN,
  type DiscardedField,
  type MergeCandidate,
  type MergeResolution
} from './user-merge.types.js';

export function isPlaceholderEmail(email: string | null): boolean {
  return !!email && email.endsWith(PLACEHOLDER_EMAIL_DOMAIN);
}

function latest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * - Target legacy sin uso (is_legacy y nunca inició sesión): su username autogenerado y su
 *   password placeholder no son del cliente → se toman de la source.
 * - Email: si el del target es placeholder se usa el de la source; si el admin ya cargó uno
 *   real, gana el del target y el de la source se informa como descartado.
 * - Resto de los campos: gana el target y los nulos se rellenan con la source.
 */
export function resolveMergedIdentity(
  target: MergeCandidate,
  source: MergeCandidate
): MergeResolution {
  if (target.google_id && source.google_id && target.google_id !== source.google_id) {
    throw new AppError(
      'GOOGLE_ID_CONFLICT',
      'Las dos cuentas tienen Google vinculado con cuentas distintas',
      409
    );
  }

  const unusedLegacy = target.is_legacy && target.last_login_at === null;
  const discarded: DiscardedField[] = [];

  const keepTarget = (
    field: DiscardedField['field'],
    targetValue: string | null,
    sourceValue: string | null
  ): string | null => {
    if (targetValue) {
      if (sourceValue && sourceValue !== targetValue) {
        discarded.push({ field, value: sourceValue });
      }
      return targetValue;
    }
    return sourceValue;
  };

  const sourceEmail = source.email && !isPlaceholderEmail(source.email) ? source.email : null;
  const email =
    !target.email || isPlaceholderEmail(target.email)
      ? (sourceEmail ?? target.email)
      : keepTarget('email', target.email, sourceEmail);
  const emailFromSource = email !== null && email === source.email && email !== target.email;

  return {
    take_source_password: unusedLegacy,
    identity: {
      email,
      username: unusedLegacy
        ? source.username
        : keepTarget('username', target.username, source.username),
      phone: keepTarget('phone', target.phone, source.phone),
      google_id: target.google_id ?? source.google_id,
      email_verified: emailFromSource ? source.email_verified : target.email_verified,
      last_login_at: latest(target.last_login_at, source.last_login_at),
      has_password: unusedLegacy ? source.has_password : target.has_password || source.has_password
    },
    discarded
  };
}
```

- [ ] **Step 4: Correr los tests**

Run: `cd apps/api && bunx vitest run src/tests/users/user-merge.identity.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/users/user-merge.types.ts apps/api/src/modules/users/user-merge.identity.ts apps/api/src/tests/users/user-merge.identity.test.ts
git commit -m "$(cat <<'EOF'
feat(users): resolve merged identity for account merge

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Merge transaccional, preview y endpoints

**Files:**

- Create: `apps/api/src/modules/users/user-merge.repository.ts`
- Create: `apps/api/src/modules/users/user-merge.domain.ts`
- Create: `apps/api/src/modules/users/user-merge.validators.ts`
- Create: `apps/api/src/modules/users/user-merge.controller.ts`
- Modify: `apps/api/src/modules/users/user.routes.ts`
- Test: `apps/api/src/tests/users/user-merge.test.ts`, `apps/api/src/tests/users/user-merge.fk-guard.test.ts`

**Interfaces:**

- Consumes: `resolveMergedIdentity` y los tipos (Task 3); helpers de Task 1.
- Produces: `mergeRepository.findMergeCandidates(ids, client?, forUpdate?)`, `countMovableRows(userId)`, `applyMerge(client, targetId, sourceId, resolution)`, `MERGE_HANDLED_FOREIGN_KEYS`; `mergeDomain.previewMerge(targetId, sourceId): Promise<MergePreview>`, `mergeDomain.mergeUsers(targetId, sourceId, adminId): Promise<MergeResult>`; rutas `GET /api/users/:id/merge-preview?source_user_id=` y `POST /api/users/:id/merge` con body `{ source_user_id }`.

- [ ] **Step 1: Tests de integración (fallan: el domain no existe)**

`apps/api/src/tests/users/user-merge.test.ts`:

```ts
// apps/api/src/tests/users/user-merge.test.ts
//
// Merge de cuentas contra la DB real: la cuenta legacy (historial del CRM) absorbe la
// cuenta creada con Google.

import { describe, it, expect } from 'vitest';
import * as mergeDomain from '../../modules/users/user-merge.domain.js';
import * as authRepository from '../../modules/auth/auth.repository.js';
import { query } from '../../infrastructure/database/client.js';
import {
  createGoogleUser,
  createLegacyUser,
  createRawAddress,
  createRawOrder,
  uniqueSuffix
} from '../helpers.js';

const ADMIN_ID = '00000000-0000-4000-8000-000000000000';

describe('mergeUsers', () => {
  it('legacy absorbe Google: mueve órdenes, direcciones e historial y toma su identidad', async () => {
    const legacy = await createLegacyUser({ firstName: 'Maria' });
    const google = await createGoogleUser({ firstName: 'María', lastName: 'Gómez' });
    await createRawAddress(legacy.id, {
      street: 'Bermejo',
      streetNumber: '450',
      city: 'Moreno',
      isDefault: true
    });
    await createRawAddress(google.id, {
      street: 'Bermejo',
      streetNumber: '450',
      city: 'Moreno',
      isDefault: true
    });
    await createRawOrder(legacy.id);
    const googleOrder = await createRawOrder(google.id);
    await query(
      `INSERT INTO order_status_history (order_id, status, changed_by) VALUES ($1, 'delivered', $2)`,
      [googleOrder, google.id]
    );
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + interval '1 day')`,
      [google.id, `vitest-${uniqueSuffix()}`]
    );

    const result = await mergeDomain.mergeUsers(legacy.id, google.id, ADMIN_ID);

    expect(result.moved).toEqual({ orders: 1, addresses: 1, status_history: 1 });

    const target = await query(
      'SELECT email, google_id, password_hash, username, deleted_at FROM users WHERE id = $1',
      [legacy.id]
    );
    expect(target.rows[0]).toMatchObject({
      email: google.email,
      google_id: google.googleId,
      password_hash: null,
      username: null,
      deleted_at: null
    });

    const source = await query(
      'SELECT email, google_id, is_active, merged_into_id, deleted_at FROM users WHERE id = $1',
      [google.id]
    );
    expect(source.rows[0]).toMatchObject({
      email: null,
      google_id: null,
      is_active: false,
      merged_into_id: legacy.id
    });
    expect(source.rows[0].deleted_at).not.toBeNull();

    const orders = await query('SELECT COUNT(*)::int AS n FROM orders WHERE user_id = $1', [
      legacy.id
    ]);
    expect(orders.rows[0].n).toBe(2);

    const defaults = await query(
      'SELECT COUNT(*)::int AS n FROM user_addresses WHERE user_id = $1 AND is_default = true',
      [legacy.id]
    );
    expect(defaults.rows[0].n).toBe(1);

    const tokens = await query('SELECT COUNT(*)::int AS n FROM refresh_tokens WHERE user_id = $1', [
      google.id
    ]);
    expect(tokens.rows[0].n).toBe(0);

    const byGoogle = await authRepository.findUserByGoogleId(google.googleId);
    expect(byGoogle?.id).toBe(legacy.id);
  });

  it('rechaza fusionar una cuenta consigo misma (400 SAME_USER)', async () => {
    const legacy = await createLegacyUser();
    await expect(mergeDomain.mergeUsers(legacy.id, legacy.id, ADMIN_ID)).rejects.toMatchObject({
      code: 'SAME_USER',
      statusCode: 400
    });
  });

  it('rechaza cuentas que no son de clientes (400 MERGE_ROLE_NOT_ALLOWED)', async () => {
    const legacy = await createLegacyUser();
    const other = await createLegacyUser();
    await query(`UPDATE users SET role = 'admin' WHERE id = $1`, [other.id]);
    await expect(mergeDomain.mergeUsers(legacy.id, other.id, ADMIN_ID)).rejects.toMatchObject({
      code: 'MERGE_ROLE_NOT_ALLOWED',
      statusCode: 400
    });
  });

  it('un segundo merge de la misma source devuelve 404 sin tocar datos', async () => {
    const legacy = await createLegacyUser();
    const google = await createGoogleUser();
    await mergeDomain.mergeUsers(legacy.id, google.id, ADMIN_ID);

    await expect(mergeDomain.mergeUsers(legacy.id, google.id, ADMIN_ID)).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      statusCode: 404
    });
  });

  it('con dos google_id distintos devuelve 409 y no modifica ninguna cuenta', async () => {
    const a = await createGoogleUser();
    const b = await createGoogleUser();
    await expect(mergeDomain.mergeUsers(a.id, b.id, ADMIN_ID)).rejects.toMatchObject({
      code: 'GOOGLE_ID_CONFLICT',
      statusCode: 409
    });
    const rows = await query(
      'SELECT COUNT(*)::int AS n FROM users WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL',
      [[a.id, b.id]]
    );
    expect(rows.rows[0].n).toBe(2);
  });
});

describe('previewMerge', () => {
  it('informa identidad resultante, descartados y conteos sin modificar datos', async () => {
    const legacy = await createLegacyUser({ email: `legacy-${uniqueSuffix()}@vitest.local` });
    const google = await createGoogleUser();
    await createRawOrder(google.id);
    await createRawAddress(google.id, { street: 'Bermejo', streetNumber: '450', city: 'Moreno' });

    const preview = await mergeDomain.previewMerge(legacy.id, google.id);

    expect(preview.target.id).toBe(legacy.id);
    expect(preview.source).toMatchObject({
      id: google.id,
      orders_count: 1,
      addresses_count: 1,
      has_google: true
    });
    expect(preview.result).toMatchObject({
      email: legacy.email,
      has_google: true,
      has_password: false
    });
    expect(preview.discarded).toEqual([{ field: 'email', value: google.email }]);
    expect(JSON.stringify(preview)).not.toContain('password_hash');

    const still = await query('SELECT deleted_at FROM users WHERE id = $1', [google.id]);
    expect(still.rows[0].deleted_at).toBeNull();
  });
});
```

`apps/api/src/tests/users/user-merge.fk-guard.test.ts`:

```ts
// Si aparece una FK nueva a users, el merge tiene que decidir qué hacer con ella
// (mover, borrar o ignorar) y agregarla a MERGE_HANDLED_FOREIGN_KEYS.

import { describe, it, expect } from 'vitest';
import { query } from '../../infrastructure/database/client.js';
import { MERGE_HANDLED_FOREIGN_KEYS } from '../../modules/users/user-merge.repository.js';

describe('merge — guard de foreign keys', () => {
  it('maneja todas las FKs que apuntan a users', async () => {
    const result = await query<{ fk: string }>(
      `SELECT c.conrelid::regclass::text || '.' || a.attname AS fk
       FROM pg_constraint c
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
       WHERE c.contype = 'f' AND c.confrelid = 'public.users'::regclass`
    );
    expect(result.rows.map((r) => r.fk).sort()).toEqual([...MERGE_HANDLED_FOREIGN_KEYS].sort());
  });
});
```

Run: `cd apps/api && bunx vitest run src/tests/users/user-merge.test.ts src/tests/users/user-merge.fk-guard.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 2: Repositorio**

`apps/api/src/modules/users/user-merge.repository.ts`:

```ts
// apps/api/src/modules/users/user-merge.repository.ts

import type { PoolClient } from 'pg';
import { query } from '../../infrastructure/database/client.js';
import type { MergeCandidate, MergeResolution } from './user-merge.types.js';

/** FKs a users que maneja el merge. El test de guard falla si aparece una nueva. */
export const MERGE_HANDLED_FOREIGN_KEYS = [
  'order_status_history.changed_by',
  'orders.user_id',
  'refresh_tokens.user_id',
  'user_addresses.user_id',
  'user_merge_dismissals.dismissed_by',
  'user_merge_dismissals.legacy_user_id',
  'user_merge_dismissals.user_id',
  'users.merged_into_id'
] as const;

// Nunca seleccionar password_hash: solo si existe
const CANDIDATE_COLUMNS = `
  id, email, username, phone, google_id, first_name, last_name, role, is_legacy,
  last_login_at, email_verified, (password_hash IS NOT NULL) AS has_password, created_at
`;

export async function findMergeCandidates(
  ids: string[],
  client?: PoolClient,
  forUpdate = false
): Promise<MergeCandidate[]> {
  const sql = `SELECT ${CANDIDATE_COLUMNS} FROM users
               WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL
               ORDER BY id${forUpdate ? ' FOR UPDATE' : ''}`;
  const result = client
    ? await client.query<MergeCandidate>(sql, [ids])
    : await query<MergeCandidate>(sql, [ids]);
  return result.rows;
}

export async function countMovableRows(
  userId: string
): Promise<{ orders: number; addresses: number }> {
  const result = await query<{ orders: number; addresses: number }>(
    `SELECT (SELECT COUNT(*)::int FROM orders WHERE user_id = $1) AS orders,
            (SELECT COUNT(*)::int FROM user_addresses
              WHERE user_id = $1 AND deleted_at IS NULL) AS addresses`,
    [userId]
  );
  return result.rows[0];
}

/**
 * Aplica un merge dentro de una transacción ya abierta (filas lockeadas por el caller).
 */
export async function applyMerge(
  client: PoolClient,
  targetId: string,
  sourceId: string,
  resolution: MergeResolution
): Promise<{ orders: number; addresses: number; status_history: number }> {
  // 1. Liberar los UNIQUE de la source antes de pasarle sus valores al target
  await client.query(
    `UPDATE users
     SET email = NULL, username = NULL, google_id = NULL, phone = NULL,
         is_active = false, deleted_at = NOW(), merged_into_id = $1, merged_at = NOW(),
         updated_at = NOW()
     WHERE id = $2`,
    [targetId, sourceId]
  );

  // 2. Identidad resuelta en el target. password_hash se copia en SQL, nunca pasa por JS.
  const { identity } = resolution;
  await client.query(
    `UPDATE users
     SET email = $1, username = $2, phone = $3, google_id = $4, email_verified = $5,
         last_login_at = $6,
         password_hash = CASE
           WHEN $7::boolean THEN (SELECT password_hash FROM users WHERE id = $8)
           ELSE COALESCE(password_hash, (SELECT password_hash FROM users WHERE id = $8))
         END,
         updated_at = NOW()
     WHERE id = $9`,
    [
      identity.email,
      identity.username,
      identity.phone,
      identity.google_id,
      identity.email_verified,
      identity.last_login_at,
      resolution.take_source_password,
      sourceId,
      targetId
    ]
  );

  // 3. Direcciones: si el target ya tiene default, las de la source dejan de serlo
  await client.query(
    `UPDATE user_addresses SET is_default = false
     WHERE user_id = $1 AND is_default = true
       AND EXISTS (SELECT 1 FROM user_addresses
                   WHERE user_id = $2 AND is_default = true AND deleted_at IS NULL)`,
    [sourceId, targetId]
  );
  const addresses = await client.query(
    'UPDATE user_addresses SET user_id = $1, updated_at = NOW() WHERE user_id = $2',
    [targetId, sourceId]
  );

  // 4. Órdenes e historial (los triggers de stock solo reaccionan a cambios de status)
  const orders = await client.query(
    'UPDATE orders SET user_id = $1, updated_at = NOW() WHERE user_id = $2',
    [targetId, sourceId]
  );
  const history = await client.query(
    'UPDATE order_status_history SET changed_by = $1 WHERE changed_by = $2',
    [targetId, sourceId]
  );

  // 5. Merges previos que apuntaban a la source pasan a apuntar al target
  await client.query('UPDATE users SET merged_into_id = $1 WHERE merged_into_id = $2', [
    targetId,
    sourceId
  ]);

  // 6. La sesión de la source muere: al reentrar con Google cae en el target por google_id
  await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [sourceId]);
  await client.query(
    'DELETE FROM user_merge_dismissals WHERE user_id = $1 OR legacy_user_id = $1',
    [sourceId]
  );

  return {
    orders: orders.rowCount ?? 0,
    addresses: addresses.rowCount ?? 0,
    status_history: history.rowCount ?? 0
  };
}
```

- [ ] **Step 3: Domain**

`apps/api/src/modules/users/user-merge.domain.ts`:

```ts
// apps/api/src/modules/users/user-merge.domain.ts

import { transaction } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logger/index.js';
import { AppError } from '../../shared/middleware/error.middleware.js';
import * as mergeRepository from './user-merge.repository.js';
import { resolveMergedIdentity } from './user-merge.identity.js';
import type {
  MergeCandidate,
  MergePreview,
  MergeResult,
  MergeUserSummary
} from './user-merge.types.js';

function assertMergeable(
  targetId: string,
  sourceId: string,
  candidates: MergeCandidate[]
): { target: MergeCandidate; source: MergeCandidate } {
  if (targetId === sourceId) {
    throw new AppError('SAME_USER', 'No se puede fusionar una cuenta consigo misma', 400);
  }
  const target = candidates.find((c) => c.id === targetId);
  const source = candidates.find((c) => c.id === sourceId);
  if (!target || !source) {
    throw new AppError('USER_NOT_FOUND', 'Alguna de las cuentas no existe o ya fue fusionada', 404);
  }
  if (target.role !== 'customer' || source.role !== 'customer') {
    throw new AppError(
      'MERGE_ROLE_NOT_ALLOWED',
      'Solo se pueden fusionar cuentas de clientes',
      400
    );
  }
  return { target, source };
}

function toSummary(
  c: MergeCandidate,
  counts: { orders: number; addresses: number }
): MergeUserSummary {
  return {
    id: c.id,
    first_name: c.first_name,
    last_name: c.last_name,
    email: c.email,
    username: c.username,
    phone: c.phone,
    is_legacy: c.is_legacy,
    has_google: !!c.google_id,
    created_at: c.created_at,
    orders_count: counts.orders,
    addresses_count: counts.addresses
  };
}

export async function previewMerge(targetId: string, sourceId: string): Promise<MergePreview> {
  const candidates = await mergeRepository.findMergeCandidates([targetId, sourceId]);
  const { target, source } = assertMergeable(targetId, sourceId, candidates);
  const { identity, discarded } = resolveMergedIdentity(target, source);
  const [targetCounts, sourceCounts] = await Promise.all([
    mergeRepository.countMovableRows(targetId),
    mergeRepository.countMovableRows(sourceId)
  ]);

  return {
    target: toSummary(target, targetCounts),
    source: toSummary(source, sourceCounts),
    result: {
      email: identity.email,
      username: identity.username,
      phone: identity.phone,
      email_verified: identity.email_verified,
      has_password: identity.has_password,
      has_google: !!identity.google_id
    },
    discarded
  };
}

export async function mergeUsers(
  targetId: string,
  sourceId: string,
  adminId: string
): Promise<MergeResult> {
  const result = await transaction(async (client) => {
    const candidates = await mergeRepository.findMergeCandidates(
      [targetId, sourceId],
      client,
      true
    );
    const { target, source } = assertMergeable(targetId, sourceId, candidates);
    const resolution = resolveMergedIdentity(target, source);
    const moved = await mergeRepository.applyMerge(client, targetId, sourceId, resolution);
    return { target_id: targetId, source_id: sourceId, moved, discarded: resolution.discarded };
  });

  logger.info(`User merge: ${sourceId} → ${targetId} (admin ${adminId})`, { moved: result.moved });
  return result;
}
```

- [ ] **Step 4: Correr los tests de integración**

Run: `cd apps/api && bunx vitest run src/tests/users/user-merge.test.ts src/tests/users/user-merge.fk-guard.test.ts`
Expected: PASS (7 tests). Si falla el guard, la diferencia indica qué FK falta contemplar: no tocar la lista sin decidir qué hace el merge con esa tabla.

- [ ] **Step 5: Validators, controller y rutas**

`apps/api/src/modules/users/user-merge.validators.ts`:

```ts
import { z } from 'zod';

export const mergeIdParamsSchema = z.object({
  id: z.string().uuid()
});

export const mergeBodySchema = z.object({
  source_user_id: z.string().uuid()
});

export const mergePreviewQuerySchema = z.object({
  source_user_id: z.string().uuid()
});
```

`apps/api/src/modules/users/user-merge.controller.ts`:

```ts
// apps/api/src/modules/users/user-merge.controller.ts

import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import * as mergeDomain from './user-merge.domain.js';
import { ApiResponseBuilder as ApiResponse } from '../../shared/utils/api-response.js';

/**
 * GET /api/users/:id/merge-preview?source_user_id=
 */
export async function getMergePreview(req: Request, res: Response, next: NextFunction) {
  try {
    const preview = await mergeDomain.previewMerge(
      req.params.id as string,
      req.query.source_user_id as string
    );
    return res.json(ApiResponse.success(preview));
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/users/:id/merge
 */
export async function mergeUser(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = (req.user as AuthenticatedUser).userId;
    const result = await mergeDomain.mergeUsers(
      req.params.id as string,
      req.body.source_user_id,
      adminId
    );
    return res.json(ApiResponse.success(result));
  } catch (error) {
    next(error);
  }
}
```

En `apps/api/src/modules/users/user.routes.ts`, agregar los imports:

```ts
import * as mergeController from './user-merge.controller.js';
import {
  mergeBodySchema,
  mergeIdParamsSchema,
  mergePreviewQuerySchema
} from './user-merge.validators.js';
```

e insertar este bloque **inmediatamente antes** del bloque JSDoc `@swagger /api/users/{id}:` (el que termina en `router.get('/:id', userController.getUserById);`):

```ts
// ============= MERGE DE CUENTAS =============
// Antes de '/:id' para que las rutas estáticas (merge-suggestions) no se lean como un id.

/**
 * @swagger
 * /api/users/{id}/merge-preview:
 *   get:
 *     summary: Vista previa del merge de dos cuentas de cliente
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Cuenta que se conserva
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: source_user_id
 *         required: true
 *         description: Cuenta que se absorbe
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Identidad resultante, campos descartados y conteos a mover
 *       404:
 *         description: Alguna cuenta no existe o ya fue fusionada
 *       409:
 *         description: GOOGLE_ID_CONFLICT
 */
router.get(
  '/:id/merge-preview',
  validate(mergeIdParamsSchema, 'params'),
  validate(mergePreviewQuerySchema, 'query'),
  mergeController.getMergePreview
);

/**
 * @swagger
 * /api/users/{id}/merge:
 *   post:
 *     summary: Fusiona una cuenta de cliente dentro de otra
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Cuenta que se conserva
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [source_user_id]
 *             properties:
 *               source_user_id:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Merge aplicado (órdenes, direcciones e historial movidos)
 *       400:
 *         description: SAME_USER o MERGE_ROLE_NOT_ALLOWED
 *       404:
 *         description: Alguna cuenta no existe o ya fue fusionada
 *       409:
 *         description: GOOGLE_ID_CONFLICT
 */
router.post(
  '/:id/merge',
  validate(mergeIdParamsSchema, 'params'),
  validate(mergeBodySchema, 'body'),
  mergeController.mergeUser
);
```

- [ ] **Step 6: Typecheck**

Run: `cd apps/api && bun run typecheck`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/users/user-merge.repository.ts apps/api/src/modules/users/user-merge.domain.ts apps/api/src/modules/users/user-merge.validators.ts apps/api/src/modules/users/user-merge.controller.ts apps/api/src/modules/users/user.routes.ts apps/api/src/tests/users/user-merge.test.ts apps/api/src/tests/users/user-merge.fk-guard.test.ts
git commit -m "$(cat <<'EOF'
feat(users): transactional account merge with preview endpoint

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Sugerencias de duplicados, descarte y filtro "sin datos de contacto"

**Files:**

- Modify: `apps/api/src/modules/users/user-merge.repository.ts` (agregar `findMergeSuggestions`, `insertDismissal`)
- Modify: `apps/api/src/modules/users/user-merge.domain.ts` (agregar `getMergeSuggestions`, `dismissSuggestion`)
- Modify: `apps/api/src/modules/users/user-merge.validators.ts`, `user-merge.controller.ts`, `user.routes.ts`
- Modify: `apps/api/src/modules/users/user.types.ts`, `user.validators.ts`, `user.controller.ts`, `user.repository.ts` (filtro `contact_status`)
- Test: `apps/api/src/tests/users/user-merge-suggestions.test.ts`

**Interfaces:**

- Consumes: `normalize_street()` y `user_merge_dismissals` (Task 1); `findMergeCandidates` (Task 4).
- Produces: `mergeDomain.getMergeSuggestions(page, limit): Promise<{ suggestions: MergeSuggestion[]; total: number }>`; `mergeDomain.dismissSuggestion(userId, legacyUserId, adminId): Promise<void>`; rutas `GET /api/users/merge-suggestions?page=&limit=` y `POST /api/users/merge-suggestions/dismiss` con body `{ user_id, legacy_user_id }`; filtro `GET /api/users?contact_status=missing`.

- [ ] **Step 1: Tests (fallan)**

`apps/api/src/tests/users/user-merge-suggestions.test.ts`:

```ts
// apps/api/src/tests/users/user-merge-suggestions.test.ts
//
// Las sugerencias cruzan cuentas nuevas con legacy por dirección (calle + número normalizados).
// Cada test usa una calle única para no mezclarse con datos reales.

import { describe, it, expect } from 'vitest';
import * as mergeDomain from '../../modules/users/user-merge.domain.js';
import * as userDomain from '../../modules/users/user.domain.js';
import { query } from '../../infrastructure/database/client.js';
import {
  createGoogleUser,
  createLegacyUser,
  createRawAddress,
  createRawOrder,
  createTestUser,
  lettersSuffix
} from '../helpers.js';

async function suggestionsFor(legacyId: string) {
  const { suggestions } = await mergeDomain.getMergeSuggestions(1, 100);
  return suggestions.filter((s) => s.legacy_user.id === legacyId);
}

describe('getMergeSuggestions', () => {
  it('Alta con dirección + nombre en común; Media con dirección sola', async () => {
    const street = `Vitest ${lettersSuffix()}`;
    const legacy = await createLegacyUser({ firstName: 'Maria' });
    await createRawAddress(legacy.id, { street, streetNumber: '450', city: 'Moreno' });
    const sameName = await createGoogleUser({ firstName: 'María Laura', lastName: 'Gómez' });
    await createRawAddress(sameName.id, {
      street: `Av. ${street}`,
      streetNumber: '450',
      city: 'Moreno'
    });
    const otherName = await createGoogleUser({ firstName: 'Pedro', lastName: 'Ruiz' });
    await createRawAddress(otherName.id, { street, streetNumber: '450', city: 'Moreno' });

    const mine = await suggestionsFor(legacy.id);

    expect(mine.find((s) => s.user.id === sameName.id)?.confidence).toBe('high');
    expect(mine.find((s) => s.user.id === otherName.id)?.confidence).toBe('medium');
  });

  it('matchea contra la dirección en texto libre de las órdenes del CRM (ciudad ignorada)', async () => {
    const street = `Vitest ${lettersSuffix()}`;
    const legacy = await createLegacyUser({ firstName: 'Carlos' });
    await createRawOrder(legacy.id, `${street} 1234 piso 2`);
    const google = await createGoogleUser({ firstName: 'Carlos' });
    await createRawAddress(google.id, { street, streetNumber: '1234', city: 'Merlo' });

    const mine = await suggestionsFor(legacy.id);
    expect(mine.map((s) => s.user.id)).toContain(google.id);
  });

  it('no sugiere si la ciudad conocida difiere, ni direcciones legacy s/n', async () => {
    const street = `Vitest ${lettersSuffix()}`;
    const legacy = await createLegacyUser({ firstName: 'Ana' });
    await createRawAddress(legacy.id, { street, streetNumber: '10', city: 'Moreno' });
    await createRawAddress(legacy.id, {
      street: `${street} Sur`,
      streetNumber: 's/n',
      city: 'Moreno'
    });
    const otherCity = await createGoogleUser({ firstName: 'Ana' });
    await createRawAddress(otherCity.id, { street, streetNumber: '10', city: 'Lanús' });
    const noNumber = await createGoogleUser({ firstName: 'Ana' });
    await createRawAddress(noNumber.id, {
      street: `${street} Sur`,
      streetNumber: 'S/N',
      city: 'Moreno'
    });

    expect(await suggestionsFor(legacy.id)).toEqual([]);
  });

  it('excluye legacy ya usadas en la web y pares descartados', async () => {
    const street = `Vitest ${lettersSuffix()}`;
    const used = await createLegacyUser({ firstName: 'Luis' });
    await createRawAddress(used.id, { street, streetNumber: '77', city: 'Moreno' });
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [used.id]);
    const dismissed = await createLegacyUser({ firstName: 'Luis' });
    await createRawAddress(dismissed.id, { street, streetNumber: '77', city: 'Moreno' });
    const google = await createGoogleUser({ firstName: 'Luis' });
    await createRawAddress(google.id, { street, streetNumber: '77', city: 'Moreno' });
    const admin = await createTestUser();

    expect(await suggestionsFor(dismissed.id)).toHaveLength(1);
    await mergeDomain.dismissSuggestion(google.id, dismissed.id, admin.id);

    expect(await suggestionsFor(used.id)).toEqual([]);
    expect(await suggestionsFor(dismissed.id)).toEqual([]);
  });
});

describe('getAllUsers — contact_status=missing', () => {
  it('lista legacy sin email real ni teléfono, primero las de compra más reciente', async () => {
    const name = `Vitestcontact${lettersSuffix()}`;
    const withOrder = await createLegacyUser({ firstName: name });
    await createRawOrder(withOrder.id);
    const withoutOrder = await createLegacyUser({ firstName: name });
    const withPhone = await createLegacyUser({ firstName: name, phone: '+5491100000000' });

    const { users } = await userDomain.getAllUsers({
      contact_status: 'missing',
      search: name,
      page: 1,
      limit: 10
    });

    expect(users.map((u) => u.id)).toEqual([withOrder.id, withoutOrder.id]);
    expect(users.map((u) => u.id)).not.toContain(withPhone.id);
  });
});
```

Run: `cd apps/api && bunx vitest run src/tests/users/user-merge-suggestions.test.ts`
Expected: FAIL (`getMergeSuggestions is not a function`).

- [ ] **Step 2: Repositorio — sugerencias y descarte**

Agregar a `apps/api/src/modules/users/user-merge.repository.ts` (importar `MergeSuggestion` en el import de tipos existente):

```ts
// Cuentas nuevas (no legacy) con dirección, cruzadas con legacy nunca usadas en la web por
// calle + número normalizados. La ciudad se compara solo si ambas son conocidas: las órdenes
// del CRM tienen la ciudad fija en 'Buenos Aires' (migrate-orders.ts), así que cuentan como
// desconocida. Alta = además comparten una palabra del nombre de 3+ letras.
const SUGGESTIONS_SQL = `
  WITH new_addresses AS (
    SELECT a.user_id, a.street, a.street_number, a.city,
           normalize_street(a.street) AS street_n,
           regexp_replace(a.street_number, '\\D', '', 'g') AS number_n,
           normalize_street(a.city) AS city_n
    FROM user_addresses a
    JOIN users u ON u.id = a.user_id
    WHERE u.role = 'customer' AND u.is_legacy = false AND u.deleted_at IS NULL
      AND a.deleted_at IS NULL AND a.is_active = true
  ),
  legacy_users AS (
    SELECT id FROM users
    WHERE role = 'customer' AND is_legacy = true
      AND deleted_at IS NULL AND last_login_at IS NULL
  ),
  legacy_addresses AS (
    SELECT a.user_id,
           normalize_street(a.street) AS street_n,
           regexp_replace(a.street_number, '\\D', '', 'g') AS number_n,
           normalize_street(a.city) AS city_n
    FROM user_addresses a
    JOIN legacy_users l ON l.id = a.user_id
    WHERE a.deleted_at IS NULL
    UNION
    SELECT o.user_id, normalize_street(m[1]), m[2], ''
    FROM orders o
    JOIN legacy_users l ON l.id = o.user_id
    CROSS JOIN LATERAL regexp_match(o.shipping_street, '^([^0-9]+)\\s(\\d+)') AS m
  ),
  pairs AS (
    SELECT DISTINCT ON (n.user_id, la.user_id)
           n.user_id, la.user_id AS legacy_user_id, n.street, n.street_number, n.city
    FROM new_addresses n
    JOIN legacy_addresses la
      ON la.street_n = n.street_n
     AND la.number_n = n.number_n
     AND n.street_n <> ''
     AND n.number_n <> ''
     AND (n.city_n IN ('', 'sin especificar')
          OR la.city_n IN ('', 'sin especificar')
          OR la.city_n = n.city_n)
    WHERE NOT EXISTS (
      SELECT 1 FROM user_merge_dismissals d
      WHERE d.user_id = n.user_id AND d.legacy_user_id = la.user_id
    )
    ORDER BY n.user_id, la.user_id
  ),
  scored AS (
    SELECT
      json_build_object(
        'id', nu.id, 'first_name', nu.first_name, 'last_name', nu.last_name,
        'email', nu.email, 'has_google', nu.google_id IS NOT NULL, 'created_at', nu.created_at
      ) AS "user",
      json_build_object(
        'id', lu.id, 'first_name', lu.first_name, 'last_name', lu.last_name,
        'email', lu.email, 'phone', lu.phone,
        'orders_count', (SELECT COUNT(*)::int FROM orders o WHERE o.user_id = lu.id)
      ) AS legacy_user,
      CASE WHEN EXISTS (
        SELECT 1
        FROM regexp_split_to_table(
               unaccent(lower(nu.first_name || ' ' || coalesce(nu.last_name, ''))), '\\s+') AS t1(w)
        JOIN regexp_split_to_table(
               unaccent(lower(lu.first_name || ' ' || coalesce(lu.last_name, ''))), '\\s+') AS t2(w)
          ON t1.w = t2.w
        WHERE length(t1.w) >= 3
      ) THEN 'high' ELSE 'medium' END AS confidence,
      json_build_object('street', p.street, 'street_number', p.street_number, 'city', p.city)
        AS matched_address,
      nu.created_at AS new_created_at,
      lu.id AS legacy_id
    FROM pairs p
    JOIN users nu ON nu.id = p.user_id
    JOIN users lu ON lu.id = p.legacy_user_id
  )
  SELECT "user", legacy_user, confidence, matched_address, COUNT(*) OVER()::int AS total
  FROM scored
  ORDER BY (confidence = 'high') DESC, new_created_at DESC, legacy_id
  LIMIT $1 OFFSET $2
`;

export async function findMergeSuggestions(
  page: number,
  limit: number
): Promise<{ suggestions: MergeSuggestion[]; total: number }> {
  const result = await query<MergeSuggestion & { total: number }>(SUGGESTIONS_SQL, [
    limit,
    (page - 1) * limit
  ]);
  return {
    suggestions: result.rows.map(({ total: _total, ...suggestion }) => suggestion),
    total: result.rows[0]?.total ?? 0
  };
}

export async function insertDismissal(
  userId: string,
  legacyUserId: string,
  adminId: string
): Promise<void> {
  await query(
    `INSERT INTO user_merge_dismissals (user_id, legacy_user_id, dismissed_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, legacy_user_id) DO NOTHING`,
    [userId, legacyUserId, adminId]
  );
}
```

- [ ] **Step 3: Domain**

Agregar a `apps/api/src/modules/users/user-merge.domain.ts` (sumar `MergeSuggestion` al import de tipos):

```ts
export async function getMergeSuggestions(
  page: number,
  limit: number
): Promise<{ suggestions: MergeSuggestion[]; total: number }> {
  return mergeRepository.findMergeSuggestions(page, limit);
}

export async function dismissSuggestion(
  userId: string,
  legacyUserId: string,
  adminId: string
): Promise<void> {
  if (userId === legacyUserId) {
    throw new AppError('SAME_USER', 'Las dos cuentas son la misma', 400);
  }
  const candidates = await mergeRepository.findMergeCandidates([userId, legacyUserId]);
  if (candidates.length !== 2) {
    throw new AppError('USER_NOT_FOUND', 'Alguna de las cuentas no existe', 404);
  }
  await mergeRepository.insertDismissal(userId, legacyUserId, adminId);
}
```

- [ ] **Step 4: Filtro `contact_status` en el listado de usuarios**

`apps/api/src/modules/users/user.types.ts`: en `UserFilters`, agregar `contact_status?: 'missing';`.

`apps/api/src/modules/users/user.validators.ts`: en `listUsersSchema`, agregar `contact_status: z.enum(['missing']).optional()`.

`apps/api/src/modules/users/user.controller.ts` → `getAllUsers`: agregar `contact_status` a la desestructuración de `req.query`, y en el objeto que se pasa a `userDomain.getAllUsers` agregar:

```ts
      contact_status: contact_status === 'missing' ? 'missing' : undefined,
```

`apps/api/src/modules/users/user.repository.ts` → `findUsers`:

1. Agregar `contact_status` a la desestructuración de `filters`.
2. Antes de `const whereClause = ...`, agregar:

```ts
// Legacy a completar a mano: email placeholder del CRM y sin teléfono
if (contact_status === 'missing') {
  conditions.push(`email LIKE '%@sinmail.local' AND phone IS NULL`);
}

// Con contact_status=missing se prioriza a quien compró más recientemente
const lastOrderOrder = (alias: string) =>
  `(SELECT MAX(o.created_at) FROM orders o WHERE o.user_id = ${alias}.id) DESC NULLS LAST`;
const innerOrder =
  contact_status === 'missing'
    ? lastOrderOrder('users')
    : sort === 'first_name'
      ? 'first_name ASC, last_name ASC'
      : 'created_at DESC';
const outerOrder =
  contact_status === 'missing'
    ? lastOrderOrder('u')
    : sort === 'first_name'
      ? 'u.first_name ASC, u.last_name ASC'
      : 'u.created_at DESC';
```

3. En la rama `includeAddresses`: borrar `const orderBy = ...`, reemplazar el `ORDER BY ${sort === 'first_name' ? ... }` del CTE `paged_users` por `ORDER BY ${innerOrder}` y el `ORDER BY ${orderBy}` final por `ORDER BY ${outerOrder}`.
4. En la rama sin direcciones: reemplazar `ORDER BY ${sort === 'first_name' ? 'first_name ASC, last_name ASC' : 'created_at DESC'}` por `ORDER BY ${innerOrder}`.

- [ ] **Step 5: Controller, validators y rutas**

Agregar a `apps/api/src/modules/users/user-merge.validators.ts`:

```ts
export const mergeSuggestionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

export const dismissSuggestionSchema = z.object({
  user_id: z.string().uuid(),
  legacy_user_id: z.string().uuid()
});
```

Agregar a `apps/api/src/modules/users/user-merge.controller.ts`:

```ts
/**
 * GET /api/users/merge-suggestions?page=&limit=
 */
export async function getMergeSuggestions(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const { suggestions, total } = await mergeDomain.getMergeSuggestions(page, limit);
    return res.json(ApiResponse.paginated(suggestions, page, limit, total));
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/users/merge-suggestions/dismiss
 */
export async function dismissMergeSuggestion(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = (req.user as AuthenticatedUser).userId;
    await mergeDomain.dismissSuggestion(req.body.user_id, req.body.legacy_user_id, adminId);
    return res.json(ApiResponse.success({ dismissed: true }));
  } catch (error) {
    next(error);
  }
}
```

En `apps/api/src/modules/users/user.routes.ts`: sumar `mergeSuggestionsQuerySchema` y `dismissSuggestionSchema` al import de validators, y agregar al **principio** del bloque `MERGE DE CUENTAS` (antes de `/:id/merge-preview`):

```ts
/**
 * @swagger
 * /api/users/merge-suggestions:
 *   get:
 *     summary: Posibles duplicados entre cuentas nuevas y clientes legacy del CRM
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Lista paginada de pares con confianza high/medium
 */
router.get(
  '/merge-suggestions',
  validate(mergeSuggestionsQuerySchema, 'query'),
  mergeController.getMergeSuggestions
);

/**
 * @swagger
 * /api/users/merge-suggestions/dismiss:
 *   post:
 *     summary: Marca un par sugerido como "No es la misma persona"
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id, legacy_user_id]
 *             properties:
 *               user_id:
 *                 type: string
 *                 format: uuid
 *               legacy_user_id:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Par descartado
 */
router.post(
  '/merge-suggestions/dismiss',
  validate(dismissSuggestionSchema, 'body'),
  mergeController.dismissMergeSuggestion
);
```

Y en el JSDoc de `GET /api/users`, agregar el parámetro:

```ts
 *       - in: query
 *         name: contact_status
 *         schema:
 *           type: string
 *           enum: [missing]
```

- [ ] **Step 6: Correr los tests**

Run: `cd apps/api && bunx vitest run src/tests/users/`
Expected: PASS (todos los de `tests/users`).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/users apps/api/src/tests/users/user-merge-suggestions.test.ts
git commit -m "$(cat <<'EOF'
feat(users): suggest legacy duplicates by address and filter missing contact data

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Cookies de sesión compartidas, `issueSession` y login sin contraseña

**Files:**

- Create: `apps/api/src/modules/auth/auth.cookies.ts`
- Modify: `apps/api/src/modules/auth/auth.controller.ts`
- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Test: `apps/api/src/tests/auth/auth.cookies.test.ts`; agregar casos en `apps/api/src/tests/auth/auth.service.test.ts`

**Interfaces:**

- Produces: `setAuthCookies(res, accessToken, refreshToken)`, `clearAuthCookies(res)`, `USE_CROSS_SITE_COOKIES`, `ACCESS_TOKEN_COOKIE_NAME`, `REFRESH_TOKEN_COOKIE_NAME`; `authService.issueSession(user: { id: string; email: string | null; role: string }): Promise<{ accessToken: string; refreshToken: string }>` (actualiza `last_login_at` y persiste el refresh token).

- [ ] **Step 1: Tests (fallan)**

`apps/api/src/tests/auth/auth.cookies.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { Response } from 'express';
import ms, { type StringValue } from 'ms';
import { env } from '../../env.js';
import {
  ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
  clearAuthCookies,
  setAuthCookies
} from '../../modules/auth/auth.cookies.js';

const crossSite = env.IS_PRODUCTION || env.COOKIE_CROSS_SITE;
const base = { httpOnly: true, secure: crossSite, sameSite: crossSite ? 'none' : 'lax', path: '/' };

describe('auth.cookies', () => {
  it('setAuthCookies usa los maxAge de la config JWT y las mismas flags en ambas cookies', () => {
    const res = { cookie: vi.fn(), clearCookie: vi.fn() };
    setAuthCookies(res as unknown as Response, 'access', 'refresh');

    expect(res.cookie).toHaveBeenCalledWith(ACCESS_TOKEN_COOKIE_NAME, 'access', {
      ...base,
      maxAge: ms(env.JWT_EXPIRES_IN as StringValue)
    });
    expect(res.cookie).toHaveBeenCalledWith(REFRESH_TOKEN_COOKIE_NAME, 'refresh', {
      ...base,
      maxAge: ms(env.JWT_REFRESH_EXPIRES_IN as StringValue)
    });
  });

  it('clearAuthCookies limpia ambas cookies con las mismas flags y sin maxAge', () => {
    const res = { cookie: vi.fn(), clearCookie: vi.fn() };
    clearAuthCookies(res as unknown as Response);
    expect(res.clearCookie).toHaveBeenCalledWith(ACCESS_TOKEN_COOKIE_NAME, base);
    expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_TOKEN_COOKIE_NAME, base);
  });
});
```

Agregar al final de `apps/api/src/tests/auth/auth.service.test.ts` (sumar `createGoogleUser` al import de `../helpers.js`):

```ts
describe('issueSession', () => {
  it('emite tokens, guarda el refresh token y actualiza last_login_at', async () => {
    const user = await createTestUser();
    await query('UPDATE users SET last_login_at = NULL WHERE id = $1', [user.id]);

    const session = await authService.issueSession({
      id: user.id,
      email: user.email,
      role: 'customer'
    });

    expect(session.accessToken).toBeTruthy();
    expect(session.refreshToken).toBeTruthy();
    const row = await query<{ last_login_at: Date | null }>(
      'SELECT last_login_at FROM users WHERE id = $1',
      [user.id]
    );
    expect(row.rows[0].last_login_at).not.toBeNull();
    const tokens = await query(
      'SELECT 1 FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL',
      [user.id]
    );
    expect(tokens.rowCount).toBeGreaterThanOrEqual(2);
  });
});

describe('login de cuenta sin contraseña', () => {
  it('responde credenciales inválidas (no 500) si password_hash es NULL', async () => {
    const google = await createGoogleUser();
    await expect(
      authService.login({ emailOrUsername: google.email, password: 'Cualquiera123!' })
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });
  });
});
```

(`createTestUser` ya guarda un refresh token al registrar; por eso el test espera ≥ 2.)

Run: `cd apps/api && bunx vitest run src/tests/auth/`
Expected: FAIL (módulo `auth.cookies.js` inexistente, `issueSession` no definido, y `bcrypt` lanza `Illegal arguments` con hash NULL).

- [ ] **Step 2: `auth.cookies.ts`**

`apps/api/src/modules/auth/auth.cookies.ts`:

```ts
// apps/api/src/modules/auth/auth.cookies.ts
//
// Cookies de sesión compartidas por el login con password y el login con Google.

import type { CookieOptions, Response } from 'express';
import ms, { type StringValue } from 'ms';
import { env } from '../../env.js';

export const REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';
export const ACCESS_TOKEN_COOKIE_NAME = 'accessToken';

// Cookies cross-site (frontend y API en dominios distintos, ej: Vercel + Railway) requieren
// SameSite=None; Secure, o el browser no las manda en los fetch a la API. Se activa en
// producción o explícitamente con COOKIE_CROSS_SITE=true — necesario en deploys HTTPS que
// corren con NODE_ENV=development (el deploy dev usa esa var para otra lógica).
export const USE_CROSS_SITE_COOKIES = env.IS_PRODUCTION || env.COOKIE_CROSS_SITE;

// maxAge derivado de la config de JWT para que la cookie no expire antes que el token.
const REFRESH_TOKEN_MAX_AGE = ms(env.JWT_REFRESH_EXPIRES_IN as StringValue);
const ACCESS_TOKEN_MAX_AGE = ms(env.JWT_EXPIRES_IN as StringValue);

function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: USE_CROSS_SITE_COOKIES, // Secure obligatorio cuando SameSite=None
    sameSite: USE_CROSS_SITE_COOKIES ? 'none' : 'lax',
    path: '/'
  };
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_TOKEN_COOKIE_NAME, accessToken, {
    ...baseOptions(),
    maxAge: ACCESS_TOKEN_MAX_AGE
  });
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    ...baseOptions(),
    maxAge: REFRESH_TOKEN_MAX_AGE
  });
}

/** clearCookie no acepta maxAge: mismas flags que al setear, sin maxAge. */
export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, baseOptions());
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, baseOptions());
}
```

- [ ] **Step 3: Usar el helper en `auth.controller.ts`**

En `apps/api/src/modules/auth/auth.controller.ts`:

1. Reemplazar todo desde `import ms, ...` hasta el cierre de `getAccessTokenCookieOptions` (las constantes y las dos funciones de opciones) por:

```ts
import * as authService from './auth.service.js';
import { ApiResponseBuilder as ApiResponse } from '../../shared/utils/api-response.js';
import { AppError } from '../../shared/middleware/error.middleware.js';
import { REFRESH_TOKEN_COOKIE_NAME, clearAuthCookies, setAuthCookies } from './auth.cookies.js';
```

(quedan borrados los imports de `ms` y `env`, que ya no se usan).

2. En `register` y `login`, reemplazar el par de `res.cookie(...)` por:

```ts
setAuthCookies(res, result.accessToken, result.refreshToken);
```

3. En `logout`, reemplazar desde `const cookieOptions = getCookieOptions();` hasta el segundo `res.clearCookie(...)` inclusive por:

```ts
clearAuthCookies(res);
```

4. En `refreshToken`, reemplazar el par de `res.cookie(...)` por:

```ts
setAuthCookies(res, newAccessToken, newRefreshToken);
```

- [ ] **Step 4: `issueSession` y guard de password NULL en `auth.service.ts`**

Agregar debajo de `hashToken`:

```ts
/**
 * Emite una sesión: access + refresh token (persistido como hash) y actualiza last_login_at.
 * La usan el login con password y el callback de Google.
 */
export async function issueSession(user: {
  id: string;
  email: string | null;
  role: string;
}): Promise<{ accessToken: string; refreshToken: string }> {
  await authRepository.updateLastLogin(user.id);

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user.id);
  const expiresAt = new Date(Date.now() + ms(env.JWT_REFRESH_EXPIRES_IN as StringValue));
  await refreshTokenRepository.saveRefreshToken(user.id, hashToken(refreshToken), expiresAt);

  return { accessToken, refreshToken };
}
```

En `login`, justo antes de `// Comparar contraseña`, agregar:

```ts
// Cuentas creadas con Google (o legacy con placeholder anulado) no tienen contraseña
if (!user.password_hash) {
  throw new AppError('INVALID_CREDENTIALS', 'Credenciales inválidas', 401);
}
```

y reemplazar desde `// Actualizar último login` hasta `await refreshTokenRepository.saveRefreshToken(user.id, tokenHash, expiresAt);` inclusive por:

```ts
const { accessToken, refreshToken } = await issueSession(user);
```

- [ ] **Step 5: Correr los tests**

Run: `cd apps/api && bunx vitest run src/tests/auth/`
Expected: PASS (los tests existentes de auth más los 4 nuevos).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/auth/auth.cookies.ts apps/api/src/modules/auth/auth.controller.ts apps/api/src/modules/auth/auth.service.ts apps/api/src/tests/auth/auth.cookies.test.ts apps/api/src/tests/auth/auth.service.test.ts
git commit -m "$(cat <<'EOF'
refactor(auth): share session cookies and issueSession; reject login without password

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Redirect saneado y state store de Passport en cookie

**Files:**

- Create: `apps/api/src/modules/auth/oauth-redirect.ts`
- Create: `apps/api/src/modules/auth/oauth-state.store.ts`
- Test: `apps/api/src/tests/auth/oauth-redirect.test.ts`, `apps/api/src/tests/auth/oauth-state.store.test.ts`

**Interfaces:**

- Consumes: `USE_CROSS_SITE_COOKIES` (Task 6).
- Produces: `sanitizeRedirect(raw: unknown): string | null`, `defaultRedirectForRole(role: string): string`; `OAUTH_STATE_COOKIE`, `class CookieStateStore` con `store(req, meta, cb)` / `verify(req, state, meta, cb)`. En el callback de Passport, `info.state` es `{ redirect: string | null }` cuando el state es válido; si no, `info` es `{ message: 'oauth_state' }`.

- [ ] **Step 1: Tests (fallan)**

`apps/api/src/tests/auth/oauth-redirect.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { defaultRedirectForRole, sanitizeRedirect } from '../../modules/auth/oauth-redirect.js';

describe('sanitizeRedirect', () => {
  it.each(['/checkout', '/cuenta?tab=pedidos', '/productos/abc-123'])('acepta %s', (path) => {
    expect(sanitizeRedirect(path)).toBe(path);
  });

  it.each([
    '//evil.com',
    '/\\evil.com',
    '/\t/evil.com',
    'https://evil.com',
    'javascript:alert(1)',
    '',
    `/${'a'.repeat(600)}`
  ])('rechaza %j', (path) => {
    expect(sanitizeRedirect(path)).toBeNull();
  });

  it('rechaza valores que no son string', () => {
    expect(sanitizeRedirect(undefined)).toBeNull();
    expect(sanitizeRedirect(['/a'])).toBeNull();
  });
});

describe('defaultRedirectForRole', () => {
  it('manda admin/owner al backoffice y al resto a /cuenta', () => {
    expect(defaultRedirectForRole('owner')).toBe('/admin');
    expect(defaultRedirectForRole('admin')).toBe('/admin');
    expect(defaultRedirectForRole('customer')).toBe('/cuenta');
  });
});
```

`apps/api/src/tests/auth/oauth-state.store.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { Request } from 'express';
import { CookieStateStore, OAUTH_STATE_COOKIE } from '../../modules/auth/oauth-state.store.js';

const META = { authorizationURL: '', tokenURL: '', clientID: '', callbackURL: '' };

function fakeRequest(query: Record<string, unknown> = {}, cookies: Record<string, string> = {}) {
  const res = { cookie: vi.fn(), clearCookie: vi.fn() };
  const req = { query, cookies, res } as unknown as Request;
  return { req, res };
}

function storeState(redirect?: string): { state: string; cookie: string } {
  const { req, res } = fakeRequest(redirect === undefined ? {} : { redirect });
  let state = '';
  new CookieStateStore().store(req, META, (_err, s) => {
    state = s as string;
  });
  return { state, cookie: res.cookie.mock.calls[0][1] as string };
}

describe('CookieStateStore', () => {
  it('store guarda nonce + redirect en una cookie HttpOnly y usa el nonce como state', () => {
    const { req, res } = fakeRequest({ redirect: '/checkout' });
    let state: string | undefined;
    new CookieStateStore().store(req, META, (_err, s) => {
      state = s as string;
    });

    expect(res.cookie).toHaveBeenCalledWith(
      OAUTH_STATE_COOKIE,
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/api/auth/google',
        maxAge: 600000
      })
    );
    expect(JSON.parse(res.cookie.mock.calls[0][1])).toEqual({
      nonce: state,
      redirect: '/checkout'
    });
  });

  it('store descarta un redirect inseguro', () => {
    const { cookie } = storeState('//evil.com');
    expect(JSON.parse(cookie).redirect).toBeNull();
  });

  it('verify con el nonce correcto devuelve el redirect y borra la cookie', () => {
    const { state, cookie } = storeState('/checkout');
    const { req, res } = fakeRequest({}, { [OAUTH_STATE_COOKIE]: cookie });
    const cb = vi.fn();
    new CookieStateStore().verify(req, state, META, cb);
    expect(cb).toHaveBeenCalledWith(null, true, { redirect: '/checkout' });
    expect(res.clearCookie).toHaveBeenCalledWith(
      OAUTH_STATE_COOKIE,
      expect.objectContaining({ path: '/api/auth/google' })
    );
  });

  it.each([
    ['nonce distinto', (c: string) => ({ [OAUTH_STATE_COOKIE]: c }), 'otro-nonce'],
    ['sin cookie', () => ({}), 'cualquiera'],
    ['cookie corrupta', () => ({ [OAUTH_STATE_COOKIE]: '{no-json' }), 'cualquiera']
  ])('verify falla con %s', (_name, cookies, provided) => {
    const { cookie } = storeState('/checkout');
    const { req } = fakeRequest({}, cookies(cookie));
    const cb = vi.fn();
    new CookieStateStore().verify(req, provided, META, cb);
    expect(cb).toHaveBeenCalledWith(null, false, { message: 'oauth_state' });
  });
});
```

Run: `cd apps/api && bunx vitest run src/tests/auth/oauth-redirect.test.ts src/tests/auth/oauth-state.store.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 2: `oauth-redirect.ts`**

```ts
// apps/api/src/modules/auth/oauth-redirect.ts

const MAX_REDIRECT_LENGTH = 512;

/**
 * Path relativo seguro para redirigir después del login con Google, o null.
 * Rechaza URLs absolutas, protocol-relative (//host) y cualquier espacio o backslash:
 * los browsers normalizan "/\t/host" y "/\host" a "//host" (open redirect).
 */
export function sanitizeRedirect(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (raw.length === 0 || raw.length > MAX_REDIRECT_LENGTH) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  if (/[\s\\]/.test(raw)) return null;
  return raw;
}

export function defaultRedirectForRole(role: string): string {
  return role === 'admin' || role === 'owner' ? '/admin' : '/cuenta';
}
```

- [ ] **Step 3: `oauth-state.store.ts`**

```ts
// apps/api/src/modules/auth/oauth-state.store.ts
//
// State store de Passport sin sesiones: el nonce viaja a Google como `state` y queda en una
// cookie HttpOnly junto con el redirect pedido. En el callback se comparan (protección CSRF del
// login) y se recupera el redirect. SameSite=Lax alcanza: ida y vuelta son navegaciones top-level.

import type { CookieOptions, Request } from 'express';
import { randomBytes, timingSafeEqual } from 'crypto';
import { USE_CROSS_SITE_COOKIES } from './auth.cookies.js';
import { sanitizeRedirect } from './oauth-redirect.js';

export const OAUTH_STATE_COOKIE = 'oauth_state';
const STATE_TTL_MS = 10 * 60 * 1000;

interface StoredState {
  nonce: string;
  redirect: string | null;
}

export interface OAuthStateInfo {
  redirect: string | null;
}

type StoreCallback = (err: Error | null, state?: string) => void;
type VerifyCallback = (
  err: Error | null,
  ok: boolean,
  info?: OAuthStateInfo | { message: 'oauth_state' }
) => void;

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: USE_CROSS_SITE_COOKIES,
    sameSite: 'lax',
    path: '/api/auth/google'
  };
}

function parseStoredState(raw: unknown): StoredState | null {
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    return typeof parsed.nonce === 'string'
      ? { nonce: parsed.nonce, redirect: sanitizeRedirect(parsed.redirect) }
      : null;
  } catch {
    return null;
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Passport elige la firma por aridad: store(req, meta, cb) y verify(req, state, meta, cb).
export class CookieStateStore {
  store(req: Request, metaOrCallback: unknown, callback?: StoreCallback): void {
    const cb = callback ?? (metaOrCallback as StoreCallback);
    const nonce = randomBytes(24).toString('base64url');
    const value: StoredState = { nonce, redirect: sanitizeRedirect(req.query.redirect) };
    req.res?.cookie(OAUTH_STATE_COOKIE, JSON.stringify(value), {
      ...cookieOptions(),
      maxAge: STATE_TTL_MS
    });
    cb(null, nonce);
  }

  verify(
    req: Request,
    providedState: string,
    metaOrCallback: unknown,
    callback?: VerifyCallback
  ): void {
    const cb = callback ?? (metaOrCallback as VerifyCallback);
    const stored = parseStoredState(req.cookies?.[OAUTH_STATE_COOKIE]);
    req.res?.clearCookie(OAUTH_STATE_COOKIE, cookieOptions());

    if (!stored || typeof providedState !== 'string' || !safeEqual(stored.nonce, providedState)) {
      cb(null, false, { message: 'oauth_state' });
      return;
    }
    cb(null, true, { redirect: stored.redirect });
  }
}
```

- [ ] **Step 4: Correr los tests**

Run: `cd apps/api && bunx vitest run src/tests/auth/oauth-redirect.test.ts src/tests/auth/oauth-state.store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/auth/oauth-redirect.ts apps/api/src/modules/auth/oauth-state.store.ts apps/api/src/tests/auth/oauth-redirect.test.ts apps/api/src/tests/auth/oauth-state.store.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): cookie-based OAuth state store with sanitized redirect

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `resolveGoogleUser` y callback de Google

**Files:**

- Create: `apps/api/src/modules/auth/oauth.service.ts`
- Modify: `apps/api/src/modules/auth/auth.repository.ts` (`findUserByEmail`, `linkGoogleId`, `createOAuthUser`)
- Modify (reescritura): `apps/api/src/modules/auth/oauth.controller.ts`
- Test: `apps/api/src/tests/auth/oauth.service.test.ts`

**Interfaces:**

- Consumes: `issueSession`, `setAuthCookies` (Task 6); `CookieStateStore`, `sanitizeRedirect`, `defaultRedirectForRole` (Task 7); helpers de Task 1.
- Produces: `OAuthErrorCode`, `toOAuthErrorCode(value: unknown): OAuthErrorCode`, `resolveGoogleUser(profile: GoogleProfileInput): Promise<{ user: User } | { error: OAuthErrorCode }>`; `isGoogleOAuthConfigured`.

- [ ] **Step 1: Tests (fallan)**

`apps/api/src/tests/auth/oauth.service.test.ts`:

```ts
// apps/api/src/tests/auth/oauth.service.test.ts

import { describe, it, expect } from 'vitest';
import { resolveGoogleUser, toOAuthErrorCode } from '../../modules/auth/oauth.service.js';
import { query } from '../../infrastructure/database/client.js';
import { createGoogleUser, createLegacyUser, createTestUser, uniqueSuffix } from '../helpers.js';

function profile(o: { id?: string; email?: string | null; verified?: boolean } = {}) {
  const email = o.email === undefined ? `oauth-${uniqueSuffix()}@vitest.local` : o.email;
  return {
    id: o.id ?? `vitest-google-${uniqueSuffix()}`,
    displayName: 'Vitest Google',
    emails: email ? [{ value: email }] : [],
    name: { givenName: 'Vitest', familyName: 'Google' },
    _json: { email_verified: o.verified ?? true }
  };
}

describe('resolveGoogleUser', () => {
  it('crea una cuenta nueva con el email en minúsculas', async () => {
    const email = `New-${uniqueSuffix()}@VITEST.local`;
    const p = profile({ email });
    const result = await resolveGoogleUser(p);

    if (!('user' in result)) throw new Error(`esperaba usuario, llegó ${result.error}`);
    expect(result.user.email).toBe(email.toLowerCase());
    const row = await query('SELECT google_id, email_verified FROM users WHERE id = $1', [
      result.user.id
    ]);
    expect(row.rows[0]).toEqual({ google_id: p.id, email_verified: true });
  });

  it('rechaza email no verificado si no hay cuenta vinculada, sin crear nada', async () => {
    const email = `unverified-${uniqueSuffix()}@vitest.local`;
    const result = await resolveGoogleUser(profile({ email, verified: false }));

    expect(result).toEqual({ error: 'email_unverified' });
    const rows = await query('SELECT 1 FROM users WHERE email = $1', [email]);
    expect(rows.rowCount).toBe(0);
  });

  it('vincula por email (case-insensitive) una legacy sin uso y anula su password placeholder', async () => {
    const legacy = await createLegacyUser({ email: `legacy-${uniqueSuffix()}@vitest.local` });
    const p = profile({ email: legacy.email.toUpperCase() });

    const result = await resolveGoogleUser(p);

    expect('user' in result && result.user.id).toBe(legacy.id);
    const row = await query(
      'SELECT google_id, password_hash, email_verified FROM users WHERE id = $1',
      [legacy.id]
    );
    expect(row.rows[0]).toEqual({ google_id: p.id, password_hash: null, email_verified: true });
  });

  it('no anula la contraseña de una cuenta que no es legacy', async () => {
    const user = await createTestUser();
    await resolveGoogleUser(profile({ email: user.email }));
    const row = await query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
    expect(row.rows[0].password_hash).not.toBeNull();
  });

  it('devuelve account_inactive para una cuenta desactivada', async () => {
    const google = await createGoogleUser();
    await query('UPDATE users SET is_active = false WHERE id = $1', [google.id]);
    const result = await resolveGoogleUser(profile({ id: google.googleId, email: google.email }));
    expect(result).toEqual({ error: 'account_inactive' });
  });

  it('devuelve oauth_failed si Google no manda email', async () => {
    expect(await resolveGoogleUser(profile({ email: null }))).toEqual({ error: 'oauth_failed' });
  });
});

describe('toOAuthErrorCode', () => {
  it('acepta códigos conocidos y cae en oauth_failed para el resto', () => {
    expect(toOAuthErrorCode('oauth_state')).toBe('oauth_state');
    expect(toOAuthErrorCode('otra cosa')).toBe('oauth_failed');
    expect(toOAuthErrorCode(undefined)).toBe('oauth_failed');
  });
});
```

Run: `cd apps/api && bunx vitest run src/tests/auth/oauth.service.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 2: Repositorio de auth**

En `apps/api/src/modules/auth/auth.repository.ts`:

1. En `findUserByEmail`, cambiar `WHERE email = $1` por `WHERE lower(email) = lower($1)` y el comentario por `Buscar usuario por email (case-insensitive)`.
2. Reemplazar `linkGoogleId` por:

```ts
/**
 * Vincular Google ID a usuario existente. Google ya verificó el email.
 * Si es una cuenta legacy que nunca se usó en la web, además anula su password_hash: es el
 * placeholder compartido que generó la migración del CRM.
 */
export async function linkGoogleId(userId: string, googleId: string): Promise<void> {
  await query(
    `UPDATE users
     SET google_id = $1,
         email_verified = true,
         password_hash = CASE WHEN is_legacy AND last_login_at IS NULL THEN NULL
                              ELSE password_hash END,
         updated_at = NOW()
     WHERE id = $2`,
    [googleId, userId]
  );
}
```

3. En `createOAuthUser`, reemplazar el INSERT por:

```ts
    `INSERT INTO users (email, first_name, last_name, google_id, role, is_active, email_verified)
     VALUES (lower($1), $2, $3, $4, 'customer', true, true)
     RETURNING ${USER_COLUMNS}`,
```

- [ ] **Step 3: `oauth.service.ts`**

```ts
// apps/api/src/modules/auth/oauth.service.ts

import type { User } from '@valplas/shared/types';
import * as authRepository from './auth.repository.js';

const OAUTH_ERROR_CODES = [
  'oauth_failed',
  'oauth_state',
  'email_unverified',
  'account_inactive',
  'oauth_unavailable'
] as const;

export type OAuthErrorCode = (typeof OAUTH_ERROR_CODES)[number];

export function toOAuthErrorCode(value: unknown): OAuthErrorCode {
  return OAUTH_ERROR_CODES.includes(value as OAuthErrorCode)
    ? (value as OAuthErrorCode)
    : 'oauth_failed';
}

/** Subconjunto del Profile de passport-google-oauth20 que usamos. */
export interface GoogleProfileInput {
  id: string;
  displayName?: string;
  emails?: { value: string }[];
  name?: { givenName?: string; familyName?: string };
  _json: { email_verified?: boolean };
}

/**
 * Busca o crea el usuario de un login con Google:
 * 1. Por google_id (cuenta ya vinculada).
 * 2. Por email, solo si Google lo verificó: vincula la cuenta existente.
 * 3. Si no existe, crea una cuenta customer sin password ni username.
 * Las cuentas legacy con email placeholder no matchean acá: las une el admin con el merge.
 */
export async function resolveGoogleUser(
  profile: GoogleProfileInput
): Promise<{ user: User } | { error: OAuthErrorCode }> {
  const email = profile.emails?.[0]?.value?.trim().toLowerCase();
  if (!email) return { error: 'oauth_failed' };

  let user = await authRepository.findUserByGoogleId(profile.id);

  if (!user) {
    if (profile._json.email_verified !== true) return { error: 'email_unverified' };

    const existing = await authRepository.findUserByEmail(email);
    if (existing) {
      await authRepository.linkGoogleId(existing.id, profile.id);
      user = existing;
    } else {
      user = await authRepository.createOAuthUser({
        email,
        firstName: profile.name?.givenName || profile.displayName || 'Cliente',
        lastName: profile.name?.familyName ?? '',
        googleId: profile.id
      });
    }
  }

  if (!user.isActive) return { error: 'account_inactive' };
  return { user };
}
```

- [ ] **Step 4: Correr los tests del service**

Run: `cd apps/api && bunx vitest run src/tests/auth/oauth.service.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Reescribir `oauth.controller.ts`**

Reemplazar todo el contenido de `apps/api/src/modules/auth/oauth.controller.ts` por:

```ts
// apps/api/src/modules/auth/oauth.controller.ts

import type { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { env } from '../../env.js';
import { logger } from '../../infrastructure/logger/index.js';
import { issueSession } from './auth.service.js';
import { setAuthCookies } from './auth.cookies.js';
import { CookieStateStore, type OAuthStateInfo } from './oauth-state.store.js';
import { defaultRedirectForRole, sanitizeRedirect } from './oauth-redirect.js';
import { resolveGoogleUser, toOAuthErrorCode, type OAuthErrorCode } from './oauth.service.js';

// Sin credenciales no se registra la strategy: el constructor de passport-oauth2 tira
// TypeError con clientID vacío y voltearía el server al arrancar.
export const isGoogleOAuthConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

if (isGoogleOAuthConfigured) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: env.GOOGLE_CALLBACK_URL,
        store: new CookieStateStore()
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const result = await resolveGoogleUser(profile);
          if ('error' in result) {
            done(null, false, { message: result.error });
            return;
          }
          done(null, result.user);
        } catch (error) {
          done(error as Error);
        }
      }
    )
  );
} else {
  logger.warn('Google OAuth deshabilitado: faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET');
}

function redirectToLogin(res: Response, error: OAuthErrorCode): void {
  res.redirect(`${env.FRONTEND_URL}/login?error=${error}`);
}

/**
 * GET /api/auth/google?redirect=/checkout
 * Redirige a la pantalla de consentimiento de Google
 */
export function googleAuth(req: Request, res: Response, next: NextFunction): void {
  if (!isGoogleOAuthConfigured) {
    redirectToLogin(res, 'oauth_unavailable');
    return;
  }
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })(req, res, next);
}

/**
 * GET /api/auth/google/callback
 * Google redirige acá con el code. Setea cookies y redirige al frontend.
 */
export function googleCallback(req: Request, res: Response, next: NextFunction): void {
  if (!isGoogleOAuthConfigured) {
    redirectToLogin(res, 'oauth_unavailable');
    return;
  }

  passport.authenticate(
    'google',
    { session: false },
    async (
      err: Error | null,
      user: { id: string; email: string | null; role: string } | false,
      info?: { message?: string; state?: OAuthStateInfo }
    ) => {
      if (err) {
        logger.error('Google OAuth callback error', { error: { message: err.message } });
        redirectToLogin(res, 'oauth_failed');
        return;
      }
      if (!user) {
        redirectToLogin(res, toOAuthErrorCode(info?.message));
        return;
      }

      try {
        const { accessToken, refreshToken } = await issueSession(user);
        setAuthCookies(res, accessToken, refreshToken);
        const path = sanitizeRedirect(info?.state?.redirect) ?? defaultRedirectForRole(user.role);
        res.redirect(`${env.FRONTEND_URL}${path}`);
      } catch (callbackError) {
        next(callbackError);
      }
    }
  )(req, res, next);
}
```

Si el logger no acepta el contexto `{ error: { message } }`, usar la misma forma que `error.middleware.ts` (`logger.error('...', { error: { message, stack, name } })`).

- [ ] **Step 6: Typecheck y suite de auth**

Run: `cd apps/api && bun run typecheck && bunx vitest run src/tests/auth/`
Expected: typecheck sin errores; tests en PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/auth/oauth.service.ts apps/api/src/modules/auth/auth.repository.ts apps/api/src/modules/auth/oauth.controller.ts apps/api/src/tests/auth/oauth.service.test.ts
git commit -m "$(cat <<'EOF'
fix(auth): harden Google OAuth (verified email, state, redirect, typed errors)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Script del CRM — `is_legacy` y guard contra re-runs

**Files:**

- Modify: `apps/api/tools/migration/src/migrate-clients.ts`

**Interfaces:**

- Produces: los clientes migrados quedan con `is_legacy = true`; un re-run no pisa cuentas que ya iniciaron sesión en la web (ni sus direcciones).

- [ ] **Step 1: Documentar en el header**

Agregar al final del comentario de cabecera (antes de `*/`):

```ts
 * - is_legacy = true (lo usan las sugerencias de duplicados y el merge de cuentas)
 * - NO re-correr después de abrir la tienda: pisaría emails/teléfonos que el admin cargó a mano
 *   en cuentas que todavía no iniciaron sesión. Las que ya la usaron (last_login_at) se saltean.
```

- [ ] **Step 2: INSERT con `is_legacy` y guard**

Reemplazar la query del `INSERT INTO users (...)` por:

```ts
const res = await target.query(
  `INSERT INTO users (
        id, email, username, first_name, last_name,
        phone, password_hash, role,
        is_active, email_verified, created_at, deleted_at, is_legacy
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,'customer',$8,false,$9,$10,true)
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        username = EXCLUDED.username,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        phone = EXCLUDED.phone,
        is_active = EXCLUDED.is_active,
        deleted_at = EXCLUDED.deleted_at,
        is_legacy = true
      WHERE users.last_login_at IS NULL
      RETURNING (xmax = 0) as inserted`,
  [
    row.ClientID,
    email,
    username,
    firstName,
    lastName,
    phone,
    PLACEHOLDER_HASH,
    !row.IsDeleted,
    createdAt,
    deletedAt
  ]
);
```

- [ ] **Step 3: Saltear cuentas ya usadas (incluidas sus direcciones)**

Declarar `let skipped = 0;` junto a los demás contadores y reemplazar:

```ts
if (res.rows[0].inserted) inserted++;
else updated++;
```

por:

```ts
// El guard del ON CONFLICT no devolvió fila: la cuenta ya se usó en la web.
// No tocar sus datos ni sus direcciones.
if (res.rows.length === 0) {
  skipped++;
  continue;
}
if (res.rows[0].inserted) inserted++;
else updated++;
```

Y en el log final, reemplazar `` `\n✅ Clients: ${inserted} inserted, ${updated} updated, ${errors} errors` `` por `` `\n✅ Clients: ${inserted} inserted, ${updated} updated, ${skipped} skipped (ya usadas en la web), ${errors} errors` ``.

- [ ] **Step 4: Verificar que compila (sin ejecutarlo)**

Run: `cd apps/api/tools/migration && bun build src/migrate-clients.ts --target=bun --outdir "$TMPDIR/vt-migrate-check"`
Expected: build exitoso. **No** correr el script (escribe en la DB).

- [ ] **Step 5: Commit**

```bash
git add apps/api/tools/migration/src/migrate-clients.ts
git commit -m "$(cat <<'EOF'
feat(migration): flag CRM clients as legacy and skip accounts already used on the web

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Front — `ApiError`, botón Google con redirect y errores OAuth

**Files:**

- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/components/auth/google-auth-button.tsx`
- Create: `apps/web/src/components/auth/oauth-error-toast.tsx`
- Modify: `apps/web/src/app/(auth)/login/page.tsx`, `apps/web/src/app/(auth)/registro/page.tsx`

**Interfaces:**

- Produces: `class ApiError extends Error { status: number; code?: string; details?: unknown }` (lo lanza `fetchApi` en cualquier respuesta no-ok); `<GoogleAuthButton label redirect? />`; `<OAuthErrorToast />`.

- [ ] **Step 1: `ApiError` en `lib/api.ts`**

Agregar debajo de la interfaz `ApiResponse`:

```ts
/** Error HTTP de la API con el código y los detalles que manda el backend. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
```

y en `fetchApi` reemplazar las 3 líneas finales (`const errorData = ...`, `if (!silentErrors) ...`, `throw new Error(...)`) por:

```ts
const errorData = (await res.json().catch(() => ({}))) as ApiResponse<unknown>;
if (!silentErrors) console.error('API Error:', errorData);
throw new ApiError(
  errorData.error?.message || 'Error de conexión',
  res.status,
  errorData.error?.code,
  errorData.error?.details
);
```

- [ ] **Step 2: `GoogleAuthButton`**

Reemplazar el contenido de `apps/web/src/components/auth/google-auth-button.tsx` por (los paths del SVG quedan iguales al archivo actual):

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface GoogleAuthButtonProps {
  label?: string;
  /** Path al que volver después del login (lo sanea el backend) */
  redirect?: string | null;
}

export function GoogleAuthButton({
  label = 'Continuar con Google',
  redirect
}: GoogleAuthButtonProps) {
  const [loading, setLoading] = useState(false);

  // Volver con "atrás" desde Google restaura la página del bfcache con el botón trabado
  useEffect(() => {
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) setLoading(false);
    };
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  const handleClick = () => {
    setLoading(true);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
    const query = redirect ? `?redirect=${encodeURIComponent(redirect)}` : '';
    window.location.href = `${apiUrl}/auth/google${query}`;
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
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
      )}
      {loading ? 'Redirigiendo...' : label}
    </Button>
  );
}
```

- [ ] **Step 3: `OAuthErrorToast`**

`apps/web/src/components/auth/oauth-error-toast.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

// Códigos que manda el backend en /login?error=<code> (oauth.service.ts)
const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_failed: 'No pudimos iniciar sesión con Google. Probá de nuevo.',
  oauth_state: 'La sesión de Google expiró. Probá de nuevo.',
  email_unverified: 'Tu email de Google no está verificado.',
  account_inactive: 'Tu cuenta está desactivada. Contactanos.',
  oauth_unavailable: 'El ingreso con Google no está disponible en este momento.'
};

/** Muestra una sola vez el error del login con Google. Debe renderizarse dentro de <Suspense>. */
export function OAuthErrorToast() {
  const error = useSearchParams().get('error');
  const shown = useRef(false);

  useEffect(() => {
    if (!error || shown.current) return;
    shown.current = true;
    toast.error(OAUTH_ERROR_MESSAGES[error] ?? OAUTH_ERROR_MESSAGES.oauth_failed);
  }, [error]);

  return null;
}
```

- [ ] **Step 4: Usarlos en login y registro**

En `apps/web/src/app/(auth)/login/page.tsx`:

- Importar `import { OAuthErrorToast } from '@/components/auth/oauth-error-toast';`.
- Reemplazar `<GoogleAuthButton label="Iniciar sesión con Google" />` por `<GoogleAuthButton label="Iniciar sesión con Google" redirect={searchParams.get('redirect')} />`.
- Agregar `<OAuthErrorToast />` como primer hijo del `<div className="min-h-screen ...">` que devuelve `LoginForm` (ya está dentro de `<Suspense>`).

En `apps/web/src/app/(auth)/registro/page.tsx`, lo mismo con `<GoogleAuthButton label="Registrarse con Google" redirect={searchParams.get('redirect')} />` y `<OAuthErrorToast />` como primer hijo del contenedor raíz del componente que usa `searchParams`.

- [ ] **Step 5: Typecheck y lint**

Run: `cd apps/web && bun run typecheck && bun run lint`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/components/auth apps/web/src/app/\(auth\)
git commit -m "$(cat <<'EOF'
feat(web): Google sign-in keeps redirect, shows loading and OAuth errors

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Front — servicio de merge, `MergeUsersDialog` y búsqueda de cuentas

**Files:**

- Create: `apps/web/src/lib/services/user-merge.service.ts`
- Modify: `apps/web/src/lib/services/users.service.ts` (`contactStatus`)
- Create: `apps/web/src/components/admin/user-merge/merge-users-dialog.tsx`
- Create: `apps/web/src/components/admin/user-merge/merge-search-dialog.tsx`
- Create: `apps/web/src/components/admin/user-merge/use-user-merge.tsx`

**Interfaces:**

- Consumes: endpoints de Tasks 4 y 5; `ApiError` (Task 10); `getAdminUsers`, `AdminUser`.
- Produces: `getMergePreview`, `mergeUsers`, `getMergeSuggestions`, `dismissMergeSuggestion`, `displayEmail` y los tipos `MergePreview`, `MergeResult`, `MergeSuggestion`, `MergeUserSummary`; `<MergeUsersDialog keepUserId absorbUserId onClose onMerged />` (montar con `key` por par); `<MergeSearchDialog user onClose onPick />`; `useUserMerge(onMerged) → { openMergeWith, handleSaveConflict, mergeDialogs }`.

- [ ] **Step 1: Servicio**

`apps/web/src/lib/services/user-merge.service.ts`:

```ts
// apps/web/src/lib/services/user-merge.service.ts

import { get, post } from '../api';

const PLACEHOLDER_EMAIL_DOMAIN = '@sinmail.local';

/** Los clientes migrados del CRM tienen un email placeholder: no mostrarlo como real. */
export function displayEmail(email: string | null): string {
  if (!email) return 'Sin email';
  return email.endsWith(PLACEHOLDER_EMAIL_DOMAIN) ? 'Sin email real' : email;
}

export interface MergeUserSummary {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  username: string | null;
  phone: string | null;
  isLegacy: boolean;
  hasGoogle: boolean;
  createdAt: string;
  ordersCount: number;
  addressesCount: number;
}

export interface DiscardedField {
  field: 'email' | 'username' | 'phone';
  value: string;
}

export interface MergePreview {
  target: MergeUserSummary;
  source: MergeUserSummary;
  result: {
    email: string | null;
    username: string | null;
    phone: string | null;
    emailVerified: boolean;
    hasPassword: boolean;
    hasGoogle: boolean;
  };
  discarded: DiscardedField[];
}

export interface MergeResult {
  targetId: string;
  sourceId: string;
  moved: { orders: number; addresses: number; statusHistory: number };
  discarded: DiscardedField[];
}

export interface MergeSuggestion {
  user: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    hasGoogle: boolean;
    createdAt: string;
  };
  legacyUser: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    ordersCount: number;
  };
  confidence: 'high' | 'medium';
  matchedAddress: { street: string; streetNumber: string; city: string };
}

export async function getMergePreview(targetId: string, sourceId: string): Promise<MergePreview> {
  const res = await get<MergePreview>(
    `/users/${targetId}/merge-preview?source_user_id=${encodeURIComponent(sourceId)}`
  );
  if (!res.success || !res.data) throw new Error('No se pudo cargar la vista previa');
  return res.data;
}

export async function mergeUsers(targetId: string, sourceId: string): Promise<MergeResult> {
  const res = await post<MergeResult>(`/users/${targetId}/merge`, { source_user_id: sourceId });
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'No se pudo fusionar');
  return res.data;
}

export async function getMergeSuggestions(
  page: number,
  limit: number
): Promise<{ suggestions: MergeSuggestion[]; total: number; hasMore: boolean }> {
  const res = await get<MergeSuggestion[]>(`/users/merge-suggestions?page=${page}&limit=${limit}`);
  if (!res.success || !res.data) return { suggestions: [], total: 0, hasMore: false };
  return {
    suggestions: res.data,
    total: res.pagination?.total ?? res.data.length,
    hasMore: res.pagination?.hasMore ?? false
  };
}

export async function dismissMergeSuggestion(userId: string, legacyUserId: string): Promise<void> {
  const res = await post<{ dismissed: boolean }>('/users/merge-suggestions/dismiss', {
    user_id: userId,
    legacy_user_id: legacyUserId
  });
  if (!res.success) throw new Error(res.error?.message ?? 'No se pudo descartar');
}
```

En `apps/web/src/lib/services/users.service.ts`: en `GetAdminUsersParams` agregar `contactStatus?: 'missing';` y en `getAdminUsers`, debajo de `if (params?.includeAddresses) ...`, agregar:

```ts
if (params?.contactStatus) query.set('contact_status', params.contactStatus);
```

- [ ] **Step 2: `MergeUsersDialog`**

`apps/web/src/components/admin/user-merge/merge-users-dialog.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeftRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { formatDate } from '@/lib/formatters';
import {
  displayEmail,
  getMergePreview,
  mergeUsers,
  type MergePreview,
  type MergeResult,
  type MergeUserSummary
} from '@/lib/services/user-merge.service';

const FIELD_LABELS: Record<'email' | 'username' | 'phone', string> = {
  email: 'Email',
  username: 'Usuario',
  phone: 'Teléfono'
};

interface MergeUsersDialogProps {
  keepUserId: string;
  absorbUserId: string;
  onClose: () => void;
  onMerged: (result: MergeResult) => void;
}

/** Montar con `key` por par: el estado inicial sale de las props. */
export function MergeUsersDialog({
  keepUserId,
  absorbUserId,
  onClose,
  onMerged
}: MergeUsersDialogProps) {
  const [pair, setPair] = useState({ keep: keepUserId, absorb: absorbUserId });
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [merging, setMerging] = useState(false);
  const autoSwapDone = useRef(false);

  useEffect(() => {
    let active = true;
    getMergePreview(pair.keep, pair.absorb)
      .then((data) => {
        if (!active) return;
        // Por defecto se conserva la cuenta legacy: tiene el historial del CRM
        if (!autoSwapDone.current && !data.target.isLegacy && data.source.isLegacy) {
          autoSwapDone.current = true;
          setPair({ keep: pair.absorb, absorb: pair.keep });
          return;
        }
        autoSwapDone.current = true;
        setPreview(data);
        setPreviewError(null);
        setLoadingPreview(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setPreviewError(err instanceof Error ? err.message : 'No se pudo cargar la vista previa');
        setLoadingPreview(false);
      });
    return () => {
      active = false;
    };
  }, [pair]);

  const handleSwap = () => {
    autoSwapDone.current = true;
    setLoadingPreview(true);
    setPreview(null);
    setPair((p) => ({ keep: p.absorb, absorb: p.keep }));
  };

  const handleMerge = async () => {
    setMerging(true);
    try {
      const result = await mergeUsers(pair.keep, pair.absorb);
      toast.success(
        `Cuentas fusionadas: ${result.moved.orders} órdenes y ${result.moved.addresses} direcciones movidas`
      );
      setConfirmOpen(false);
      onMerged(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo fusionar');
    } finally {
      setMerging(false);
    }
  };

  const access = preview
    ? [preview.result.hasGoogle && 'Google', preview.result.hasPassword && 'Contraseña']
        .filter(Boolean)
        .join(' + ') || 'Sin acceso (puede entrar con Google)'
    : '';

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !merging) onClose();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Fusionar cuentas</DialogTitle>
            <DialogDescription>
              Las órdenes y direcciones de la cuenta absorbida pasan a la que se conserva.
            </DialogDescription>
          </DialogHeader>

          {loadingPreview && (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loadingPreview && previewError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{previewError}</AlertDescription>
            </Alert>
          )}

          {!loadingPreview && preview && (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr]">
                <AccountCard title="Se conserva" account={preview.target} />
                <div className="flex justify-center md:items-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSwap}
                    disabled={merging}
                    aria-label="Invertir cuentas"
                  >
                    <ArrowLeftRight className="h-4 w-4" />
                  </Button>
                </div>
                <AccountCard title="Se absorbe" account={preview.source} muted />
              </div>

              <div className="space-y-1 rounded-md border p-3 text-sm">
                <p className="font-medium">Resultado</p>
                <p className="break-all">Email: {displayEmail(preview.result.email)}</p>
                <p>Usuario: {preview.result.username ?? '—'}</p>
                <p>Teléfono: {preview.result.phone ?? '—'}</p>
                <p>Acceso: {access}</p>
                <p className="text-muted-foreground">
                  Se moverán {preview.source.ordersCount} órdenes y {preview.source.addressesCount}{' '}
                  direcciones.
                </p>
              </div>

              {preview.discarded.length > 0 && (
                <Alert className="border-amber-300 bg-amber-50 text-amber-900">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Se descartan:{' '}
                    {preview.discarded.map((d) => `${FIELD_LABELS[d.field]} ${d.value}`).join(', ')}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={onClose} disabled={merging}>
              Cancelar
            </Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!preview || loadingPreview || merging}
            >
              Fusionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !merging && setConfirmOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmás la fusión?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La cuenta absorbida se desactiva y su sesión se
              cierra.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={merging}>Cancelar</AlertDialogCancel>
            <Button onClick={handleMerge} disabled={merging}>
              {merging && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {merging ? 'Fusionando...' : 'Fusionar'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function AccountCard({
  title,
  account,
  muted
}: {
  title: string;
  account: MergeUserSummary;
  muted?: boolean;
}) {
  return (
    <div className={`space-y-1 rounded-md border p-3 text-sm ${muted ? 'bg-muted/40' : ''}`}>
      <p className="text-xs font-medium uppercase text-muted-foreground">{title}</p>
      <p className="font-semibold">{`${account.firstName} ${account.lastName ?? ''}`.trim()}</p>
      <div className="flex flex-wrap gap-1">
        {account.isLegacy && <Badge variant="secondary">Cliente del CRM</Badge>}
        {account.hasGoogle && <Badge variant="outline">Google</Badge>}
      </div>
      <p className="break-all">{displayEmail(account.email)}</p>
      <p>{account.phone ?? 'Sin teléfono'}</p>
      <p className="text-muted-foreground">
        Alta {formatDate(account.createdAt)} · {account.ordersCount} órdenes ·{' '}
        {account.addressesCount} direcciones
      </p>
    </div>
  );
}
```

- [ ] **Step 3: `MergeSearchDialog`**

`apps/web/src/components/admin/user-merge/merge-search-dialog.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command';
import { getAdminUsers, type AdminUser } from '@/lib/services/users.service';
import { displayEmail } from '@/lib/services/user-merge.service';

const MIN_SEARCH = 2;

interface MergeSearchDialogProps {
  user: AdminUser;
  onClose: () => void;
  onPick: (other: AdminUser) => void;
}

export function MergeSearchDialog({ user, onClose, onPick }: MergeSearchDialogProps) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const term = search.trim();

  useEffect(() => {
    if (term.length < MIN_SEARCH) return;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      getAdminUsers({ search: term, role: 'customer', limit: 10 })
        .then(({ users }) => {
          if (active) setResults(users.filter((u) => u.id !== user.id));
        })
        .catch(() => {
          if (active) setResults([]);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [term, user.id]);

  const visible = term.length >= MIN_SEARCH ? results : [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Fusionar con…</DialogTitle>
          <DialogDescription>
            Buscá la otra cuenta de {`${user.firstName} ${user.lastName ?? ''}`.trim()}.
          </DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} className="rounded-md border">
          <CommandInput
            placeholder="Nombre, email o teléfono..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {loading && (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loading && term.length >= MIN_SEARCH && <CommandEmpty>Sin resultados</CommandEmpty>}
            {visible.map((u) => (
              <CommandItem key={u.id} value={u.id} onSelect={() => onPick(u)}>
                <div className="flex flex-col">
                  <span>{`${u.firstName} ${u.lastName ?? ''}`.trim()}</span>
                  <span className="text-xs text-muted-foreground">
                    {displayEmail(u.email)}
                    {u.phone ? ` · ${u.phone}` : ''}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: `useUserMerge`**

`apps/web/src/components/admin/user-merge/use-user-merge.tsx`:

```tsx
'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/formatters';
import type { AdminUser } from '@/lib/services/users.service';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { MergeSearchDialog } from './merge-search-dialog';
import { MergeUsersDialog } from './merge-users-dialog';

interface ConflictDetails {
  conflictUserId: string;
  conflictUserName: string;
  conflictUserCreatedAt: string;
}

interface ContactConflict extends ConflictDetails {
  user: AdminUser;
  field: 'email' | 'phone';
}

/**
 * Estado y diálogos del merge desde /admin/usuarios: "Fusionar con…" y la oferta de merge
 * cuando el guardado choca con el email/teléfono de otra cuenta (409).
 */
export function useUserMerge(onMerged: () => void): {
  openMergeWith: (user: AdminUser) => void;
  handleSaveConflict: (error: unknown, user: AdminUser) => boolean;
  mergeDialogs: ReactNode;
} {
  const [searchFor, setSearchFor] = useState<AdminUser | null>(null);
  const [conflict, setConflict] = useState<ContactConflict | null>(null);
  const [pair, setPair] = useState<{ keepId: string; absorbId: string } | null>(null);

  const openMergeWith = useCallback((user: AdminUser) => setSearchFor(user), []);

  const handleSaveConflict = useCallback((error: unknown, user: AdminUser): boolean => {
    if (!(error instanceof ApiError)) return false;
    if (error.code !== 'EMAIL_IN_USE' && error.code !== 'PHONE_IN_USE') return false;
    setConflict({
      user,
      field: error.code === 'EMAIL_IN_USE' ? 'email' : 'phone',
      ...(error.details as ConflictDetails)
    });
    return true;
  }, []);

  const fieldLabel = conflict?.field === 'phone' ? 'teléfono' : 'email';

  const mergeDialogs = (
    <>
      {searchFor && (
        <MergeSearchDialog
          user={searchFor}
          onClose={() => setSearchFor(null)}
          onPick={(other) => {
            setPair({ keepId: searchFor.id, absorbId: other.id });
            setSearchFor(null);
          }}
        />
      )}

      <AlertDialog open={!!conflict} onOpenChange={(open) => !open && setConflict(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>El {fieldLabel} pertenece a otra cuenta</AlertDialogTitle>
            <AlertDialogDescription>
              Este {fieldLabel} ya lo usa {conflict?.conflictUserName} (alta{' '}
              {conflict ? formatDate(conflict.conflictUserCreatedAt) : ''}). ¿Querés fusionar las
              dos cuentas?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (conflict)
                  setPair({ keepId: conflict.user.id, absorbId: conflict.conflictUserId });
                setConflict(null);
              }}
            >
              Revisar fusión
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {pair && (
        <MergeUsersDialog
          key={`${pair.keepId}:${pair.absorbId}`}
          keepUserId={pair.keepId}
          absorbUserId={pair.absorbId}
          onClose={() => setPair(null)}
          onMerged={() => {
            setPair(null);
            onMerged();
          }}
        />
      )}
    </>
  );

  return { openMergeWith, handleSaveConflict, mergeDialogs };
}
```

- [ ] **Step 5: Typecheck y lint**

Run: `cd apps/web && bun run typecheck && bun run lint`
Expected: sin errores. Si `formatDate` exige un segundo argumento, pasar el formato que usa el resto del admin (ver `apps/web/src/lib/formatters.ts:26`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/services/user-merge.service.ts apps/web/src/lib/services/users.service.ts apps/web/src/components/admin/user-merge
git commit -m "$(cat <<'EOF'
feat(web): merge users dialog with preview and account search

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Front — página `/admin/usuarios/duplicados`

**Files:**

- Create: `apps/web/src/app/admin/usuarios/duplicados/page.tsx`

**Interfaces:**

- Consumes: `getMergeSuggestions`, `dismissMergeSuggestion`, `displayEmail`, `MergeSuggestion`, `MergeUsersDialog` (Task 11).

- [ ] **Step 1: Página**

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserRole } from '@/types';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { formatDate } from '@/lib/formatters';
import {
  dismissMergeSuggestion,
  displayEmail,
  getMergeSuggestions,
  type MergeSuggestion
} from '@/lib/services/user-merge.service';
import { MergeUsersDialog } from '@/components/admin/user-merge/merge-users-dialog';

const PAGE_SIZE = 20;

const pairKey = (s: MergeSuggestion) => `${s.user.id}:${s.legacyUser.id}`;
const fullName = (u: { firstName: string; lastName: string | null }) =>
  `${u.firstName} ${u.lastName ?? ''}`.trim();

export default function DuplicadosPage() {
  const { user: authUser, isLoading: authLoading } = useRequireAuth({
    allowedRoles: [UserRole.OWNER, UserRole.ADMIN]
  });

  const [suggestions, setSuggestions] = useState<MergeSuggestion[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<MergeSuggestion | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadPage = useCallback(async (nextPage: number) => {
    const result = await getMergeSuggestions(nextPage, PAGE_SIZE);
    setSuggestions((prev) =>
      nextPage === 1 ? result.suggestions : [...prev, ...result.suggestions]
    );
    setHasMore(result.hasMore);
    setPage(nextPage);
  }, []);

  useEffect(() => {
    loadPage(1)
      .catch(() => toast.error('Error al cargar posibles duplicados'))
      .finally(() => setLoading(false));
  }, [loadPage]);

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          setLoadingMore(true);
          loadPage(page + 1)
            .catch(() => {
              setHasMore(false);
              toast.error('Error al cargar más duplicados');
            })
            .finally(() => setLoadingMore(false));
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, page, loadPage]);

  const handleDismiss = async (s: MergeSuggestion) => {
    setDismissing(pairKey(s));
    try {
      await dismissMergeSuggestion(s.user.id, s.legacyUser.id);
      setSuggestions((prev) => prev.filter((x) => pairKey(x) !== pairKey(s)));
      toast.success('Sugerencia descartada');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo descartar');
    } finally {
      setDismissing(null);
    }
  };

  // Un merge invalida otras sugerencias de las mismas cuentas: recargar desde la primera página
  const handleMerged = () => {
    setReviewing(null);
    setLoading(true);
    loadPage(1)
      .catch(() => toast.error('Error al recargar posibles duplicados'))
      .finally(() => setLoading(false));
  };

  if (authLoading || !authUser) return null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href="/admin/usuarios"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Usuarios
        </Link>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Posibles duplicados</h1>
        <p className="text-muted-foreground">
          Cuentas nuevas que comparten dirección con un cliente migrado del CRM.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : suggestions.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">
          No hay posibles duplicados por ahora.
        </p>
      ) : (
        <ul className="space-y-3">
          {suggestions.map((s) => {
            const key = pairKey(s);
            const isDismissing = dismissing === key;
            return (
              <li key={key} className="space-y-3 rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={s.confidence === 'high' ? 'default' : 'secondary'}>
                    Coincidencia {s.confidence === 'high' ? 'alta' : 'media'}
                  </Badge>
                  <span className="inline-flex items-center text-sm text-muted-foreground">
                    <MapPin className="mr-1 h-4 w-4" />
                    {s.matchedAddress.street} {s.matchedAddress.streetNumber},{' '}
                    {s.matchedAddress.city}
                  </span>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-0.5 text-sm">
                    <p className="text-xs font-medium uppercase text-muted-foreground">
                      Cuenta nueva
                    </p>
                    <p className="font-semibold">{fullName(s.user)}</p>
                    <p className="break-all">{displayEmail(s.user.email)}</p>
                    <p className="text-muted-foreground">
                      {s.user.hasGoogle ? 'Google · ' : ''}Alta {formatDate(s.user.createdAt)}
                    </p>
                  </div>
                  <div className="space-y-0.5 text-sm">
                    <p className="text-xs font-medium uppercase text-muted-foreground">
                      Cliente del CRM
                    </p>
                    <p className="font-semibold">{fullName(s.legacyUser)}</p>
                    <p className="break-all">{displayEmail(s.legacyUser.email)}</p>
                    <p className="text-muted-foreground">{s.legacyUser.ordersCount} órdenes</p>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button
                    variant="outline"
                    onClick={() => handleDismiss(s)}
                    disabled={isDismissing}
                  >
                    {isDismissing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isDismissing ? 'Descartando...' : 'No es la misma persona'}
                  </Button>
                  <Button onClick={() => setReviewing(s)} disabled={isDismissing}>
                    Revisar y fusionar
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div ref={sentinelRef} className="h-4" />
      {loadingMore && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {reviewing && (
        <MergeUsersDialog
          key={pairKey(reviewing)}
          keepUserId={reviewing.legacyUser.id}
          absorbUserId={reviewing.user.id}
          onClose={() => setReviewing(null)}
          onMerged={handleMerged}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck y lint**

Run: `cd apps/web && bun run typecheck && bun run lint`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/admin/usuarios/duplicados/page.tsx
git commit -m "$(cat <<'EOF'
feat(web): admin page listing possible duplicate accounts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Front — integración en `/admin/usuarios`

**Files:**

- Modify: `apps/web/src/app/admin/usuarios/page.tsx`

**Interfaces:**

- Consumes: `useUserMerge` (Task 11), `contactStatus` en `getAdminUsers` (Task 11).

- [ ] **Step 1: Imports y estado**

- Sumar `GitMerge` y `Users` al import de `lucide-react`.
- Agregar `import Link from 'next/link';` y `import { useUserMerge } from '@/components/admin/user-merge/use-user-merge';`.
- Debajo de `const [sortBy, setSortBy] = ...`, agregar:

```ts
const [contactFilter, setContactFilter] = useState<'all' | 'missing'>('all');
```

- [ ] **Step 2: Filtro en las cargas**

En `loadUsers` y `loadMore`, agregar al objeto de `getAdminUsers`:

```ts
          contactStatus: contactFilter === 'missing' ? 'missing' : undefined,
```

y sumar `contactFilter` al array de dependencias de ambos `useCallback`.

- [ ] **Step 3: Hook de merge**

Inmediatamente después del `useCallback` de `loadUsers`, agregar:

```ts
const { openMergeWith, handleSaveConflict, mergeDialogs } = useUserMerge(() => {
  setSheetOpen(false);
  loadUsers(search);
});
```

- [ ] **Step 4: 409 → ofrecer merge al guardar**

En `handleSubmit`, reemplazar el `catch` por:

```ts
    } catch (err) {
      // Email/teléfono de otra cuenta: ofrecer fusionarlas en vez de un toast de error
      if (selectedUser && handleSaveConflict(err, selectedUser)) return;
      const message = err instanceof Error ? err.message : 'Error al guardar usuario';
      toast.error(message);
    } finally {
```

- [ ] **Step 5: Acción "Fusionar con…" por fila**

En la celda de acciones, antes del botón con `<Pencil />`, agregar:

```tsx
{
  row.original.role === UserRole.CUSTOMER && (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => openMergeWith(row.original)}
      className="h-8 w-8 p-0"
      title="Fusionar con…"
      aria-label="Fusionar con otra cuenta"
    >
      <GitMerge className="h-4 w-4" />
    </Button>
  );
}
```

y cambiar las dependencias del `useMemo` de `columns` a `[currentUser, handleDelete, openMergeWith]`.

- [ ] **Step 6: Header — filtro y acceso a duplicados (mobile-first)**

Reemplazar el bloque `<div className="flex items-center justify-between gap-4">` … `</div>` (selects + botón "Nuevo Usuario") por:

```tsx
<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
  <div className="flex flex-wrap items-center gap-3">
    <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as UserRole | 'all')}>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Filtrar por rol" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos los roles</SelectItem>
        <SelectItem value={UserRole.OWNER}>Dueños</SelectItem>
        <SelectItem value={UserRole.ADMIN}>Administradores</SelectItem>
        <SelectItem value={UserRole.DRIVER}>Choferes</SelectItem>
        <SelectItem value={UserRole.CUSTOMER}>Clientes</SelectItem>
      </SelectContent>
    </Select>
    <Select
      value={sortBy}
      onValueChange={(value) => setSortBy(value as typeof sortBy)}
      disabled={contactFilter === 'missing'}
    >
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Ordenar por" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="firstName">Orden alfabético</SelectItem>
        <SelectItem value="createdAt">Fecha de creación</SelectItem>
      </SelectContent>
    </Select>
    <Select
      value={contactFilter}
      onValueChange={(value) => setContactFilter(value as typeof contactFilter)}
    >
      <SelectTrigger className="w-[220px]">
        <SelectValue placeholder="Datos de contacto" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos los contactos</SelectItem>
        <SelectItem value="missing">Sin datos de contacto</SelectItem>
      </SelectContent>
    </Select>
  </div>

  <div className="flex flex-wrap gap-2">
    <Button variant="outline" asChild>
      <Link href="/admin/usuarios/duplicados">
        <Users className="mr-2 h-4 w-4" />
        Posibles duplicados
      </Link>
    </Button>
    <Button onClick={handleCreate}>
      <Plus className="mr-2 h-4 w-4" />
      Nuevo Usuario
    </Button>
  </div>
</div>
```

- [ ] **Step 7: Renderizar los diálogos**

Agregar `{mergeDialogs}` justo antes del `</div>` de cierre del return (después del `AlertDialog` de eliminación).

- [ ] **Step 8: Typecheck y lint**

Run: `cd apps/web && bun run typecheck && bun run lint`
Expected: sin errores.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/admin/usuarios/page.tsx
git commit -m "$(cat <<'EOF'
feat(web): merge actions and missing-contact filter in admin users

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Verificación final y ajustes al spec

**Files:**

- Modify: `docs/superpowers/specs/2026-10-05-google-auth-account-merge-design.md`

- [ ] **Step 1: Suite completa + typecheck + lint**

Run: `bun run typecheck && bun run lint && cd apps/api && bunx vitest run`
Expected: todo en verde. Anotar el total de tests.

- [ ] **Step 2: Verificación manual en la app (dev server)**

Levantar `bun dev` y verificar en el browser:

1. `http://localhost:3000/login?error=oauth_state` → toast "La sesión de Google expiró. Probá de nuevo." (una sola vez).
2. En `/login?redirect=/checkout`, click en "Iniciar sesión con Google" → el botón muestra "Redirigiendo..." y el browser llega a `accounts.google.com` con `state=` en la URL. En la respuesta de `/api/auth/google` hay `Set-Cookie: oauth_state=…; HttpOnly; SameSite=Lax`.
3. `/admin/usuarios` (como owner): aparecen el filtro "Sin datos de contacto", el botón "Posibles duplicados" y el ícono de fusionar en las filas de clientes.
4. `/admin/usuarios/duplicados` carga (vacía o con sugerencias) sin errores en consola.
5. Editar un legacy con el email de otra cuenta → aparece "El email pertenece a otra cuenta" → "Revisar fusión" abre el preview. **No confirmar el merge sobre datos reales.**

El login completo con Google (consentimiento + callback) lo hace el usuario con su cuenta: pedírselo.

- [ ] **Step 3: Ajustar el spec a lo implementado**

En el spec:

- Sección 1 → "Órdenes": reemplazar el párrafo de `createOrder` por: "No hace falta un guard extra en `createOrder`: ya exige que la dirección de envío pertenezca al usuario y el merge mueve todas las direcciones al target, así que la cuenta absorbida no puede crear órdenes."
- Sección 3 → `/admin/usuarios/duplicados`: reemplazar "Cards en mobile, tabla en `md+`" por "Lista de cards: en `md+` las dos cuentas van lado a lado".
- Sección 3 → `/admin/usuarios`: "Botón 'Posibles duplicados'" (sin contador, para no sumar una query en cada carga).
- Sección 4: agregar "Las cuentas salteadas por el guard tampoco tocan sus direcciones (el script hace delete + insert)".

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-10-05-google-auth-account-merge-design.md
git commit -m "$(cat <<'EOF'
docs: align Google auth + merge spec with implementation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```
