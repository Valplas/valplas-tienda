# Login con Google + merge de cuentas legacy

## Objetivo

Que los clientes puedan registrarse e iniciar sesión con Google sin fricción, y que
el historial de los clientes migrados del CRM (cuentas "legacy") se pueda unir a la
cuenta nueva que creen en la web. El merge **nunca bloquea** al cliente: entra con
Google, compra, y la unión la resuelve el admin después.

## Contexto

- El login con Google ya existe en `develop` (commits `6e0c59d`, `6af87df`): Passport
  `passport-google-oauth20` en `apps/api/src/modules/auth/oauth.controller.ts`,
  columna `users.google_id` (migración 031), `GoogleAuthButton` en `/login` y
  `/registro`. Vincula por email si encuentra una cuenta con el mismo email.
- **No se migra a Auth0** (confirmado 2026-10-05): `docs/AUTH0_MIGRATION_PLAN.md`
  (feb-2026) queda descartado. Este diseño sigue con auth propio (JWT + cookies) +
  Passport.
- Datos legacy (medidos 2026-10-05 sobre 837 customers migrados con
  `tools/migration/src/migrate-clients.ts`):
  - 834 con email placeholder `migrado.<id>@sinmail.local`, 3 con teléfono.
  - 598 (71%) con nombre de una sola palabra, 768 sin apellido; 166 comparten nombre
    exacto con otro legacy.
  - 800 con dirección; nombre + calle es único para 766.
  - Los datos de contacto existen como columnas en el CRM pero vacías: el admin los
    va a completar a mano en el backoffice después de la migración.
- `users.email`, `users.phone`, `users.username` y `users.google_id` tienen índice
  UNIQUE (no parcial): dos cuentas nunca comparten esos valores.
- FKs a `users`: `orders.user_id` (RESTRICT), `user_addresses.user_id` (CASCADE),
  `refresh_tokens.user_id` (CASCADE), `order_status_history.changed_by`.
- Orden del go-live: migraciones → scripts de `tools/migration` (sincronización final)
  → apertura a usuarios finales.

## Cómo se detecta un duplicado

| Señal     | Cómo se usa                                                                                                                                                                                                           |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email     | El admin carga el email real en el legacy. Si lo hace **antes** de que el cliente entre con Google, el flujo OAuth vincula por email (sin merge). Si lo hace **después**, el guardado devuelve 409 y ofrece fusionar. |
| Teléfono  | Igual que email: 409 al guardar → ofrece fusionar.                                                                                                                                                                    |
| Dirección | Sugerencia automática. Requiere que la cuenta nueva tenga al menos una dirección.                                                                                                                                     |
| Nombre    | Solo sube la confianza de una coincidencia por dirección. Nunca sugiere solo.                                                                                                                                         |

Niveles de sugerencia:

- **Alta:** misma calle + número normalizados **y** al menos una palabra del nombre
  (≥3 letras) en común.
- **Media:** misma calle + número sin coincidencia de nombre (familiar, mismo edificio).

## 1. Backend: merge

### Migración `040_add_user_merge_support.sql`

```sql
ALTER TABLE users ADD COLUMN merged_into_id UUID NULL REFERENCES users(id);
ALTER TABLE users ADD COLUMN merged_at TIMESTAMPTZ NULL;
ALTER TABLE users ADD COLUMN is_legacy BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX idx_users_merged_into ON users(merged_into_id) WHERE merged_into_id IS NOT NULL;
CREATE INDEX idx_users_legacy ON users(is_legacy) WHERE is_legacy = true AND deleted_at IS NULL;

-- Backfill: cuentas migradas del CRM presentes hoy
UPDATE users SET is_legacy = true
WHERE role = 'customer' AND email LIKE '%@sinmail.local';

-- Pares descartados por el admin ("No es la misma persona")
CREATE TABLE user_merge_dismissals (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  legacy_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dismissed_by UUID NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, legacy_user_id)
);

-- Normalización de calles para matching de direcciones (STABLE: unaccent no es IMMUTABLE)
CREATE OR REPLACE FUNCTION normalize_street(p TEXT) RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT trim(regexp_replace(
    regexp_replace(
      regexp_replace(unaccent(lower(coalesce(p, ''))), '[^a-z0-9 ]', ' ', 'g'),
      '^\s*(av|avda|avenida|calle|pje|pasaje|bv|boulevard)\s+', '', 'g'),
    '\s+', ' ', 'g'))
$$;
```

Con rollback SQL comentado, como el resto de las migraciones.

### Endpoints (en `apps/api/src/modules/users/user.routes.ts`, ya restringido a admin/owner)

- `GET /api/users/merge-suggestions?page=&limit=`: lista paginada de pares
  `{ user, legacyUser, confidence: 'high' | 'medium', matchedAddress, legacyOrdersCount }`.
- `GET /api/users/:id/merge-preview?source_user_id=`: identidad resultante, campos
  descartados y conteos a mover (órdenes, direcciones).
- `POST /api/users/:id/merge` body `{ source_user_id }`: ejecuta el merge. `:id` es la
  cuenta que se conserva (target); `source_user_id`, la que se absorbe.
- `POST /api/users/merge-suggestions/dismiss` body `{ user_id, legacy_user_id }`:
  "No es la misma persona".

Swagger actualizado para los cuatro.

### Sugerencias (query on-the-fly, ~840 usuarios)

- **Cuentas nuevas:** `role = 'customer'`, `is_legacy = false`, `deleted_at IS NULL`,
  con al menos una dirección activa.
- **Legacy candidatas:** `is_legacy = true`, `deleted_at IS NULL`,
  `last_login_at IS NULL` (nunca usadas en la web).
- **Direcciones legacy comparadas:** `user_addresses` (calle + número parseados por el
  script) **y** `orders.shipping_street` de sus órdenes (texto crudo: calle = texto
  antes del primer número, número = primer número, igual que `parseAddress`).
- **Match:** `normalize_street(calle)` igual y número igual. Si ambas tienen ciudad
  (≠ `'Sin especificar'`), la ciudad normalizada también tiene que coincidir.
- Se excluyen los pares presentes en `user_merge_dismissals`.
- Una sola query con CTEs (sin N+1), orden: Alta primero, después la cuenta nueva más
  reciente.

### Resolución de identidad: `resolveMergedIdentity(target, source)` (función pura)

- **Target legacy sin uso** (`is_legacy AND last_login_at IS NULL`): su username
  autogenerado y su password placeholder no son del cliente. Se toman de la source
  `username`, `password_hash` y `last_login_at` (aunque sean NULL, así se elimina el
  placeholder). `email_verified` acompaña al email elegido (si queda el email real que
  cargó el admin en el target, se mantiene el `email_verified` del target). `email`: el
  de la source si el del target es placeholder; si el admin ya cargó uno real y difiere,
  gana el del target y el de la source se informa como descartado.
- **Resto de los casos:** el target gana en todo valor no nulo; los nulos se rellenan
  con la source.
- **En ambos casos:** `google_id` del target si tiene, si no el de la source;
  `phone` igual. `first_name` y `last_name` siempre del target.
- **Conflicto duro:** ambas con `google_id` distinto → 409 `GOOGLE_ID_CONFLICT`.

### Transacción de `POST /:id/merge`

1. Validaciones: ids distintos; ambas existen, sin `deleted_at`, `role = 'customer'`.
   Si no se cumplen: 400/404/409 con `ApiResponse.error`.
2. `SELECT … FOR UPDATE` de ambas filas, ordenadas por id.
3. `resolveMergedIdentity`.
4. Source: `email`, `username`, `google_id` y `phone` en NULL; `is_active = false`,
   `deleted_at = NOW()`, `merged_into_id = target`, `merged_at = NOW()`. Va antes del
   paso 5 porque los UNIQUE no son diferibles.
5. Target: `UPDATE` con la identidad resuelta.
6. `orders.user_id`, `order_status_history.changed_by` y `user_addresses.user_id`
   pasan de la source al target. Las direcciones movidas quedan `is_default = false`
   si el target ya tiene una default.
7. `DELETE FROM refresh_tokens WHERE user_id = source`.
8. Borra de `user_merge_dismissals` los pares de la source.
9. `logger.info` con target, source, admin y conteos movidos.

La sesión de la source muere al vencer su access token (≤15 min): el refresh falla
porque `findUserById` filtra `deleted_at`. Al volver a entrar con Google, el
`google_id` ya está en el target.

### Conflicto email/teléfono al editar (`user.domain.ts → updateUser`)

- Email en minúsculas antes de comparar y guardar.
- Teléfono normalizado a E.164 con `libphonenumber-js` (mismo helper que
  `auth.validator.ts`) y validación de unicidad (hoy no existe y un duplicado
  termina en 500 por 23505).
- Si el email o el teléfono ya pertenecen a otra cuenta → **409** `EMAIL_IN_USE` /
  `PHONE_IN_USE` con `details: { conflictUserId, conflictUserName, conflictUserCreatedAt }`.

### Listado de usuarios

`listUsersSchema` suma `contact_status=missing`: cuentas con email placeholder
y sin teléfono, ordenadas por fecha de última orden desc. Sirve para que el admin
priorice la carga manual.

### Órdenes

No hace falta un guard extra en `createOrder`: ya exige que la dirección de envío pertenezca al usuario y el merge mueve todas las direcciones al target, así que la cuenta absorbida no puede crear órdenes.

## 2. Backend: arreglos del flujo Google

1. **Cookies unificadas:** las opciones de cookie de `auth.controller.ts` pasan a
   `apps/api/src/modules/auth/auth.cookies.ts` (`setAuthCookies`, `clearAuthCookies`),
   y las usan los dos controllers. Google pasa a respetar `COOKIE_CROSS_SITE` y el
   refresh dura `JWT_REFRESH_EXPIRES_IN` (hoy dura 30 min).
2. **State store propio de Passport** (`oauth-state.store.ts`), basado en cookie:
   - `GET /auth/google?redirect=/checkout` genera un nonce y lo guarda en la cookie
     HttpOnly `oauth_state` (`nonce` + redirect; 10 min, `SameSite=Lax`, `Secure`
     según `COOKIE_CROSS_SITE`/producción, path `/api/auth/google`). El nonce viaja
     como `state` a Google.
   - En el callback compara `req.query.state` con la cookie, la borra y devuelve el
     redirect. Si falta o no coincide → `/login?error=oauth_state`.
   - Redirect saneado al guardar y al leer: solo paths que empiezan con `/` y no con
     `//` ni `/\`. Si no hay redirect válido: `/admin` para admin/owner y `/cuenta`
     para el resto.
3. **Verify callback:**
   - Exige `profile._json.email_verified === true` para crear cuenta o vincular por
     email; si no → `email_unverified`.
   - Email en minúsculas antes del lookup.
   - Al vincular por email una cuenta legacy sin uso, además de `google_id` setea
     `password_hash = NULL` (elimina el placeholder compartido de esa cuenta).
   - Cuenta inactiva → `account_inactive`.
   - Login exitoso → `updateLastLogin` (hoy el callback no lo llama; sin esto una
     legacy vinculada por Google seguiría pareciendo "sin uso" para el merge y el
     guard del script).
   - **Whitelist de owner (`OWNER_GOOGLE_EMAILS`, emails separados por coma):** si el email
     de Google (verificado, comparado en minúsculas) está en la lista, el login entra a **la
     cuenta owner existente**, compartida. No crea ni vincula cuentas: `google_id` es una sola
     columna y la lista puede tener varios emails. Se evalúa antes del lookup por `google_id`,
     así ningún vínculo previo desvía esos emails a otra cuenta. Si no hay exactamente una
     cuenta owner no borrada → `oauth_failed` + log de error (fail closed). Owner inactivo →
     `account_inactive`. Cada ingreso queda en el log con el email de Google (`logger.info`):
     es la única traza de quién entró, porque la cuenta es compartida.
4. **Errores:** el callback redirige a
   `${FRONTEND_URL}/login?error=<code>` con `oauth_failed | oauth_state |
email_unverified | account_inactive | oauth_unavailable`.
5. **Arranque sin credenciales:** si `GOOGLE_CLIENT_ID` o `GOOGLE_CLIENT_SECRET` están
   vacíos, la strategy no se registra (hoy el constructor tira TypeError y voltea el
   server) y `/auth/google` redirige con `oauth_unavailable`.
6. **Login con password** de una cuenta con `password_hash = NULL` (Google o legacy
   anulada) responde el mismo error de credenciales inválidas, sin excepción.

## 3. Frontend

- `GoogleAuthButton`:
  - Recibe `redirect?: string` y navega a `${apiUrl}/auth/google?redirect=…`.
  - Al hacer click queda deshabilitado con `Loader2` + "Redirigiendo...".
  - `/login` y `/registro` le pasan el `?redirect=` actual.
- `/login` y `/registro` leen `?error=` y muestran un toast en español:
  - `oauth_failed`: "No pudimos iniciar sesión con Google. Probá de nuevo."
  - `oauth_state`: "La sesión de Google expiró. Probá de nuevo."
  - `email_unverified`: "Tu email de Google no está verificado."
  - `account_inactive`: "Tu cuenta está desactivada. Contactanos."
  - `oauth_unavailable`: "El ingreso con Google no está disponible en este momento."
- Sesión post-redirect: `initialize()` ya corre global en
  `components/providers.tsx`; no requiere cambios.
- **`/admin/usuarios/duplicados`** (página nueva):
  - Lista paginada con infinite scroll: cuenta nueva (email, Google sí/no, alta) ↔
    legacy (nombre, dirección, cantidad de órdenes), con badge Alta/Media y la
    dirección coincidente.
  - Acciones por fila: "Revisar y fusionar" (abre `MergeUsersDialog`) y "No es la
    misma persona" (dismiss, con loading). Después de "No es la misma persona", la lista
    recarga desde la página 1. Después de un merge, los pares que involucren a las dos
    cuentas fusionadas se eliminan inmediatamente y la lista recarga.
  - Lista de cards: en `md+` las dos cuentas van lado a lado.
- **`/admin/usuarios`** (cambios mínimos; el archivo ya tiene 497 líneas, la lógica va
  en componentes nuevos):
  - Botón "Posibles duplicados" en el header (sin contador, para no sumar una query en cada carga).
  - Acción "Fusionar con…": buscador (`command` de shadcn) para elegir cualquier
    cuenta → `MergeUsersDialog`.
  - Filtro "Sin datos de contacto".
- **`user-form.tsx`:** si el guardado devuelve 409 `EMAIL_IN_USE`/`PHONE_IN_USE`,
  muestra "Este email/teléfono pertenece a otra cuenta (Nombre, alta dd/mm). ¿Fusionar?"
  → `MergeUsersDialog` con la cuenta editada como la que se conserva.
- **`components/admin/user-merge/MergeUsersDialog.tsx`:**
  - Dos columnas "Se conserva" / "Se absorbe" con botón ⇄ para invertir (por defecto
    se conserva la legacy). Se apilan en mobile.
  - Carga `merge-preview`: identidad resultante, descartados resaltados y "Se moverán
    X órdenes y Y direcciones".
  - Confirmación con `AlertDialog` ("Esta acción no se puede deshacer").
  - Botón "Fusionar" con loading local + `Loader2` + "Fusionando...".
  - Si sale bien: toast, cierra y refresca la lista de origen.
- Tipos frontend en camelCase; requests en snake_case (convención del proyecto).

## 4. Scripts CRM (`apps/api/tools/migration`)

- `migrate-clients.ts`:
  - Setea `is_legacy = true` en INSERT y UPDATE.
  - El `ON CONFLICT (id) DO UPDATE` suma `WHERE users.last_login_at IS NULL`: una
    cuenta ya usada en la web no se pisa si el script se re-corre por error después
    del corte.
- Los scripts **no** se re-corren después de abrir a usuarios: un re-run pisaría los
  emails y teléfonos cargados a mano en cuentas sin uso. Queda documentado en el
  header del script.
- Las cuentas salteadas por el guard tampoco tocan sus direcciones (el script hace delete + insert).
- El prefijo `VLPL-` de `migrate-orders.ts` va en la tarea de prefijos de órdenes.

## Tests (API, vitest)

- **Unit `resolveMergedIdentity`:** legacy sin uso ↔ Google; legacy con email real
  cargado ↔ Google con otro email (descartado); real ↔ real (relleno de nulos);
  conflicto de `google_id`.
- **Integración contra DB** (patrón de `tests/integration/purchase-flow.test.ts`):
  - Merge completo: mueve órdenes, direcciones e historial; borra refresh tokens; la
    source queda soft-deleted con `merged_into_id`; un lookup por `google_id` devuelve
    el target.
  - Rechazos: misma cuenta, admin/owner, cuenta borrada, doble `google_id`.
  - Sugerencias: un par por dirección + nombre → Alta; un par descartado no aparece.
  - `updateUser` con email/teléfono existente → 409 con `conflictUserId`.
  - `createOrder` con usuario borrado → rechazado.
  - Login con password sobre `password_hash` NULL → credenciales inválidas.
- **Guard de FKs:** consulta `pg_constraint` y falla si existe una FK a `users` que no
  está en la lista que maneja el merge.
- **OAuth:**
  - State store: nonce ok / mismatch / ausente; redirect `//evil.com` → default por
    rol.
  - Verify callback: `email_verified` false, email en mayúsculas, inactivo, link por
    email anula el placeholder.
- El web no tiene infraestructura de tests; no se agrega en este alcance.

## Deploy

1. Migración 040.
2. Variables `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `GOOGLE_CALLBACK_URL` en
   Railway; la URI de callback de producción autorizada en Google Cloud Console.
3. Scripts CRM (sincronización final).
4. Apertura a usuarios.

## Fuera de alcance

- **Anular la contraseña placeholder de todos los legacy** (está hardcodeada y
  commiteada en `migrate-clients.ts`; usernames predecibles). Fix de seguridad
  separado y prioritario, antes del go-live.
- Que el cliente reclame su cuenta legacy desde `/cuenta`.
- Geocodificar direcciones legacy para matching por distancia.
- Tabla `user_identities` / login con Facebook.
- Email de aviso al cliente tras el merge.
- `audit_logs` (iteración 3).
