# Data Migration: CRM → Valplas Tienda

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrar todos los datos del CRM .NET en producción (PostgreSQL) a la nueva base de datos de Valplas Tienda (Supabase/PostgreSQL).

**Architecture:** Scripts TypeScript que conectan directamente a ambas DBs, transforman los datos y los insertan en el destino. Se ejecutan en orden para respetar dependencias de foreign keys. Cada tarea puede re-ejecutarse sin duplicar datos (idempotente via `ON CONFLICT DO NOTHING` o `ON CONFLICT DO UPDATE`).

**Tech Stack:** Bun, `pg` (node-postgres), `bcryptjs`, `slugify`

---

## Decisiones Previas al Inicio (REQUERIDO)

Antes de ejecutar el plan, el desarrollador DEBE responder estas preguntas con el dueño del sistema:

### 1. Mapeo de `OrderStatus` (integer → enum)

Consulta en producción: `SELECT DISTINCT "OrderStatus", COUNT(*) FROM "Orders" GROUP BY 1 ORDER BY 1;`
Completar este mapeo:

```
OrderStatus integer → order_status enum
0 → ???  (pending_payment | payment_confirmed | processing | ready_to_ship | shipped | delivered | cancelled | refunded)
1 → ???
2 → ???
...
```

### 2. Mapeo de `UserType` (integer → rol)

Consulta en producción: `SELECT DISTINCT "UserType", COUNT(*) FROM "Users" GROUP BY 1 ORDER BY 1;`
Completar:

```
UserType integer → user_role enum
0 → ???  (owner | admin | driver)
1 → ???
...
```

### 3. Mapeo de `Business` (integer → categoría de producto)

Consulta en producción: `SELECT DISTINCT "Business", COUNT(*) FROM "Products" GROUP BY 1 ORDER BY 1;`
Completar con nombres de categoría:

```
Business integer → nombre de categoría
1 → ???  (ej: "Plásticos", "Limpieza", "Electrodomésticos")
2 → ???
...
```

### 4. Precio base de productos

Estrategia para `base_price` (campo obligatorio en target):

- **Opción A:** Usar `CostPrice` × (1 + margen de la lista principal). ¿Cuál es la lista "pública"?
- **Opción B:** Importar con `base_price = 0` y que el admin los complete manualmente.
- **Decisión:** **\*\***\_\_\_**\*\***

---

## Variables de Configuración

Crear `tools/migration/.env` con:

```env
# Base de datos ORIGEN (producción CRM)
SOURCE_DB_URL=postgresql://user:password@host:5432/crm_db

# Base de datos DESTINO (Supabase)
TARGET_DB_URL=postgresql://postgres:password@db.xxxx.supabase.co:5432/postgres
```

---

## Task 1: Crear entorno de migración

**Files:**

- Create: `tools/migration/package.json`
- Create: `tools/migration/tsconfig.json`
- Create: `tools/migration/src/db.ts`
- Create: `tools/migration/src/config.ts`

**Step 1: Inicializar el directorio**

```bash
mkdir -p tools/migration/src
cd tools/migration
```

**Step 2: Crear `tools/migration/package.json`**

```json
{
  "name": "valplas-migration",
  "private": true,
  "scripts": {
    "inspect": "bun run src/inspect.ts",
    "migrate:price-lists": "bun run src/migrate-price-lists.ts",
    "migrate:users": "bun run src/migrate-users.ts",
    "migrate:clients": "bun run src/migrate-clients.ts",
    "migrate:brands": "bun run src/migrate-brands.ts",
    "migrate:categories": "bun run src/migrate-categories.ts",
    "migrate:products": "bun run src/migrate-products.ts",
    "migrate:orders": "bun run src/migrate-orders.ts",
    "migrate:order-items": "bun run src/migrate-order-items.ts",
    "validate": "bun run src/validate.ts"
  },
  "dependencies": {
    "pg": "^8.11.0",
    "bcryptjs": "^2.4.3",
    "slugify": "^1.6.6",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "@types/pg": "^8.11.0",
    "@types/bcryptjs": "^2.4.6",
    "typescript": "^5.0.0"
  }
}
```

**Step 3: Instalar dependencias**

```bash
cd tools/migration && bun install
```

**Step 4: Crear `tools/migration/src/config.ts`**

```typescript
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

export const SOURCE_DB_URL = process.env.SOURCE_DB_URL!;
export const TARGET_DB_URL = process.env.TARGET_DB_URL!;

// ===== COMPLETAR ANTES DE EJECUTAR =====
// Mapeo de OrderStatus (integer → enum)
export const ORDER_STATUS_MAP: Record<number, string> = {
  0: 'pending_payment', // AJUSTAR
  1: 'processing', // AJUSTAR
  2: 'delivered', // AJUSTAR
  3: 'cancelled' // AJUSTAR
};

// Mapeo de UserType (integer → user_role)
export const USER_TYPE_MAP: Record<number, string> = {
  0: 'owner', // AJUSTAR
  1: 'admin', // AJUSTAR
  2: 'driver' // AJUSTAR
};

// Mapeo de Business (integer → nombre categoría)
export const BUSINESS_CATEGORY_MAP: Record<number, string> = {
  1: 'Sin Categoría' // AJUSTAR con nombres reales
};

// ¿Qué lista de precios se usa como "precio público"?
// Poner el UUID de la ListPrice que representa precio de lista público
// Si Opción B (base_price=0), dejar null
export const PUBLIC_PRICE_LIST_ID: string | null = null;
```

**Step 5: Crear `tools/migration/src/db.ts`**

```typescript
import { Pool } from 'pg';
import { SOURCE_DB_URL, TARGET_DB_URL } from './config';

export const sourceDb = new Pool({ connectionString: SOURCE_DB_URL });
export const targetDb = new Pool({ connectionString: TARGET_DB_URL });

export async function closeConnections() {
  await sourceDb.end();
  await targetDb.end();
}
```

**Step 6: Commit**

```bash
git add tools/migration/
git commit -m "chore: add data migration tooling setup"
```

---

## Task 2: Script de inspección (conocer los datos antes de migrar)

**Files:**

- Create: `tools/migration/src/inspect.ts`

**Step 1: Crear `tools/migration/src/inspect.ts`**

```typescript
import { sourceDb, closeConnections } from './db';

async function inspect() {
  console.log('\n=== CONTEOS ===');
  const tables = ['Clients', 'Users', 'Products', 'Orders', 'OrderProducts', 'ListPrices'];
  for (const table of tables) {
    const r = await sourceDb.query(`SELECT COUNT(*) FROM "${table}" WHERE "IsDeleted" = false`);
    const total = await sourceDb.query(`SELECT COUNT(*) FROM "${table}"`);
    console.log(`${table}: ${r.rows[0].count} activos / ${total.rows[0].count} total`);
  }

  console.log('\n=== OrderStatus valores ===');
  const statuses = await sourceDb.query(
    `SELECT "OrderStatus", COUNT(*) FROM "Orders" GROUP BY 1 ORDER BY 1`
  );
  statuses.rows.forEach((r) => console.log(`  ${r.OrderStatus}: ${r.count} pedidos`));

  console.log('\n=== UserType valores ===');
  const userTypes = await sourceDb.query(
    `SELECT "UserType", COUNT(*) FROM "Users" GROUP BY 1 ORDER BY 1`
  );
  userTypes.rows.forEach((r) => console.log(`  ${r.UserType}: ${r.count} usuarios`));

  console.log('\n=== Business valores (Categorías) ===');
  const businesses = await sourceDb.query(
    `SELECT "Business", COUNT(*) FROM "Products" GROUP BY 1 ORDER BY 1`
  );
  businesses.rows.forEach((r) => console.log(`  ${r.Business}: ${r.count} productos`));

  console.log('\n=== Marcas (Manufacturer) ===');
  const manufacturers = await sourceDb.query(
    `SELECT "Manufacturer", COUNT(*) FROM "Products" GROUP BY 1 ORDER BY "Manufacturer"`
  );
  manufacturers.rows.forEach((r) => console.log(`  "${r.Manufacturer}": ${r.count} productos`));

  console.log('\n=== Clients sin email ===');
  const noEmail = await sourceDb.query(
    `SELECT COUNT(*) FROM "Clients" WHERE "ClientEmail" IS NULL OR "ClientEmail" = ''`
  );
  console.log(`  ${noEmail.rows[0].count} clientes sin email`);

  console.log('\n=== Precios de productos ===');
  const prices = await sourceDb.query(
    `SELECT
      COUNT(*) as total,
      MIN("CostPrice") as min_price,
      MAX("CostPrice") as max_price,
      AVG("CostPrice") as avg_price,
      COUNT(*) FILTER (WHERE "CostPrice" = 0) as zero_price
    FROM "Products"`
  );
  console.log('  ', prices.rows[0]);

  console.log('\n=== ListPrices ===');
  const listPrices = await sourceDb.query(`SELECT * FROM "ListPrices" WHERE "IsDeleted" = false`);
  listPrices.rows.forEach((r) =>
    console.log(`  [${r.ListPriceID}] "${r.Name}" Margen:${r.Margin}% Desc:${r.Discount}%`)
  );

  await closeConnections();
}

inspect().catch(console.error);
```

**Step 2: Ejecutar y revisar la salida**

```bash
cd tools/migration && bun run inspect
```

Copiar la salida completa y **completar `config.ts`** con los mapeos reales antes de continuar.

---

## Task 3: Crear migración para price_lists

**Files:**

- Create: `apps/api/src/infrastructure/database/migrations/015_create_price_lists.sql`

**Step 1: Crear la migración**

```sql
-- Migration: 015_create_price_lists
-- Description: Create price_lists table for B2B pricing (migrated from CRM)
-- Created: 2026-03-04

CREATE TABLE price_lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  margin NUMERIC NOT NULL DEFAULT 0,     -- Porcentaje de margen sobre costo
  discount NUMERIC NOT NULL DEFAULT 0,   -- Porcentaje de descuento sobre precio
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Referencia opcional de usuario a su lista de precios asignada
ALTER TABLE users ADD COLUMN IF NOT EXISTS price_list_id UUID REFERENCES price_lists(id) ON DELETE SET NULL;

CREATE INDEX idx_price_lists_active ON price_lists(is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_price_list_id ON users(price_list_id) WHERE price_list_id IS NOT NULL;

CREATE TRIGGER update_price_lists_updated_at
  BEFORE UPDATE ON price_lists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Rollback SQL:
-- ALTER TABLE users DROP COLUMN IF EXISTS price_list_id;
-- DROP TRIGGER IF EXISTS update_price_lists_updated_at ON price_lists;
-- DROP TABLE IF EXISTS price_lists CASCADE;
```

**Step 2: Ejecutar la migración en target**

```bash
cd apps/api && bun run db:migrate
```

**Step 3: Verificar que la tabla existe**

```bash
cd tools/migration && bun -e "
  const { targetDb } = require('./src/db');
  targetDb.query('SELECT COUNT(*) FROM price_lists').then(r => { console.log('OK:', r.rows[0]); process.exit(0); });
"
```

**Step 4: Commit**

```bash
git add apps/api/src/infrastructure/database/migrations/015_create_price_lists.sql
git commit -m "feat(db): add price_lists table and user price_list_id column"
```

---

## Task 4: Migrar ListPrices → price_lists

**Files:**

- Create: `tools/migration/src/migrate-price-lists.ts`

**Step 1: Crear el script**

```typescript
import { sourceDb, targetDb, closeConnections } from './db';

async function migratePriceLists() {
  console.log('Migrando ListPrices...');

  const { rows: sourceLists } = await sourceDb.query(`
    SELECT "ListPriceID", "Name", "Margin", "Discount", "IsDeleted"
    FROM "ListPrices"
  `);

  console.log(`  Encontradas: ${sourceLists.length} listas`);

  let inserted = 0;
  let skipped = 0;

  for (const list of sourceLists) {
    const result = await targetDb.query(
      `INSERT INTO price_lists (id, name, margin, discount, is_active, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        list.ListPriceID,
        list.Name,
        list.Margin,
        list.Discount,
        !list.IsDeleted,
        list.IsDeleted ? new Date() : null
      ]
    );

    if (result.rowCount && result.rowCount > 0) {
      inserted++;
    } else {
      skipped++;
    }
  }

  console.log(`  Insertadas: ${inserted}, Ya existían: ${skipped}`);

  const { rows: count } = await targetDb.query('SELECT COUNT(*) FROM price_lists');
  console.log(`  Total en target: ${count[0].count}`);

  await closeConnections();
}

migratePriceLists().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**Step 2: Ejecutar**

```bash
cd tools/migration && bun run migrate:price-lists
```

Expected: "Insertadas: N, Ya existían: 0"

**Step 3: Commit**

```bash
git add tools/migration/src/migrate-price-lists.ts
git commit -m "chore(migration): add price-lists migration script"
```

---

## Task 5: Migrar Users (staff) → users

> Los `Users` del CRM son empleados (admin/owner/driver). **Las contraseñas NO se pueden migrar** porque usan salt+hash propio del .NET. Se genera un hash temporal y se fuerza restablecimiento.

**Files:**

- Create: `tools/migration/src/migrate-users.ts`

**Step 1: Crear el script**

```typescript
import { sourceDb, targetDb, closeConnections } from './db';
import bcrypt from 'bcryptjs';
import { USER_TYPE_MAP } from './config';

function splitName(fullName: string): { first: string; last: string } {
  const parts = (fullName || '').trim().split(' ');
  const first = parts[0] || 'Sin';
  const last = parts.slice(1).join(' ') || 'Nombre';
  return { first, last };
}

function generateUsername(email: string, userId: string): string {
  const base = email
    .split('@')[0]
    .replace(/[^a-z0-9_]/gi, '')
    .toLowerCase();
  return base || `user_${userId.substring(0, 8)}`;
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('549')) return `+${digits}`;
  if (digits.startsWith('54')) return `+${digits}`;
  if (digits.startsWith('0')) return `+549${digits.substring(1)}`;
  if (digits.length === 10) return `+549${digits}`;
  return null; // No se puede normalizar
}

async function migrateUsers() {
  console.log('Migrando Users (staff)...');

  const { rows: sourceUsers } = await sourceDb.query(`
    SELECT "UserID", "Name", "Email", "Phone", "UserType"
    FROM "Users"
  `);

  console.log(`  Encontrados: ${sourceUsers.length} usuarios`);

  // Hash temporal que fuerza cambio de contraseña en primer login
  const tempHash = await bcrypt.hash('MIGRATED_NEEDS_RESET_' + Date.now(), 10);

  let inserted = 0;
  let errors = 0;

  for (const user of sourceUsers) {
    const { first, last } = splitName(user.Name || '');
    const role = USER_TYPE_MAP[user.UserType] || 'admin';
    const username = generateUsername(user.Email, user.UserID);
    const phone = normalizePhone(user.Phone);

    try {
      await targetDb.query(
        `INSERT INTO users (
          id, email, username, phone, password_hash,
          first_name, last_name, role, is_active,
          email_verified, phone_verified
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          username = EXCLUDED.username,
          updated_at = NOW()`,
        [
          user.UserID,
          user.Email,
          username,
          phone,
          tempHash,
          first,
          last,
          role,
          true,
          true, // Asumimos email verificado para staff existente
          false
        ]
      );
      inserted++;
    } catch (err: any) {
      console.error(`  ERROR usuario ${user.UserID} (${user.Email}):`, err.message);
      errors++;
    }
  }

  console.log(`  Procesados: ${inserted}, Errores: ${errors}`);

  await closeConnections();
}

migrateUsers().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**Step 2: Ejecutar**

```bash
cd tools/migration && bun run migrate:users
```

Expected: "Procesados: N, Errores: 0"

**Step 3: Si hay errores de username duplicado** (conflicto), ajustar `generateUsername` para agregar sufijo numérico:

```typescript
// Versión con sufijo si hay conflicto:
async function uniqueUsername(base: string, db: Pool): Promise<string> {
  const { rows } = await db.query('SELECT 1 FROM users WHERE username = $1', [base]);
  if (rows.length === 0) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}${i}`;
    const { rows: r } = await db.query('SELECT 1 FROM users WHERE username = $1', [candidate]);
    if (r.length === 0) return candidate;
  }
  return `${base}_${Date.now()}`;
}
```

**Step 4: Commit**

```bash
git add tools/migration/src/migrate-users.ts
git commit -m "chore(migration): add staff users migration script"
```

---

## Task 6: Migrar Clients → users (customers) + user_addresses

> Los `Clients` son los clientes B2B del CRM. Se migran como role='customer'. Clients sin email reciben email placeholder. Las contraseñas también se generan temporales.

**Files:**

- Create: `tools/migration/src/migrate-clients.ts`

**Step 1: Crear el script**

```typescript
import { sourceDb, targetDb, closeConnections } from './db';
import bcrypt from 'bcryptjs';
import { PUBLIC_PRICE_LIST_ID } from './config';

function generateUsername(firstName: string, lastName: string, id: string): string {
  const base = `${firstName}${lastName}`.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return base.substring(0, 40) || `cliente_${id.substring(0, 8)}`;
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('549')) return `+${digits}`;
  if (digits.startsWith('54')) return `+${digits}`;
  if (digits.startsWith('0')) return `+549${digits.substring(1)}`;
  if (digits.length === 10) return `+549${digits}`;
  return null;
}

async function uniqueUsername(base: string): Promise<string> {
  const { rows } = await targetDb.query('SELECT 1 FROM users WHERE username = $1', [base]);
  if (rows.length === 0) return base;
  for (let i = 2; i < 200; i++) {
    const candidate = `${base}${i}`;
    const { rows: r } = await targetDb.query('SELECT 1 FROM users WHERE username = $1', [
      candidate
    ]);
    if (r.length === 0) return candidate;
  }
  return `${base}_${Date.now()}`;
}

async function migrateClients() {
  console.log('Migrando Clients (customers)...');

  const { rows: clients } = await sourceDb.query(`
    SELECT * FROM "Clients"
  `);

  console.log(`  Encontrados: ${clients.length} clientes`);

  const tempHash = await bcrypt.hash('MIGRATED_NEEDS_RESET_' + Date.now(), 10);

  let inserted = 0;
  let errors = 0;
  let skippedDeleted = 0;

  for (const client of clients) {
    // Email: si no tiene, generamos placeholder no-reply
    const email =
      client.ClientEmail && client.ClientEmail.trim()
        ? client.ClientEmail.trim().toLowerCase()
        : `sin-email-${client.ClientID}@noemail.valplas.net`;

    const firstName = (client.ClientName || 'Sin').trim();
    const lastName = (client.ClientSurname || 'Apellido').trim();
    const phone = normalizePhone(client.ClientPhone);
    const baseUsername = generateUsername(firstName, lastName, client.ClientID);
    const username = await uniqueUsername(baseUsername);

    const deletedAt = client.IsDeleted ? new Date() : null;

    try {
      await targetDb.query(
        `INSERT INTO users (
          id, email, username, phone, password_hash,
          first_name, last_name, role, is_active,
          email_verified, phone_verified, price_list_id,
          created_at, deleted_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          username = EXCLUDED.username,
          updated_at = NOW()`,
        [
          client.ClientID,
          email,
          username,
          phone,
          tempHash,
          firstName,
          lastName,
          'customer',
          !client.IsDeleted,
          false,
          false,
          PUBLIC_PRICE_LIST_ID,
          client.ClientDate || new Date(),
          deletedAt
        ]
      );

      // Migrar dirección si tiene datos
      if (client.ClientAddress || client.ClientLocality) {
        await targetDb.query(
          `INSERT INTO user_addresses (
            id, user_id, street, street_number, city, province, postcode,
            is_default, created_at
          ) VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, true, NOW())
          ON CONFLICT DO NOTHING`,
          [
            client.ClientID,
            client.ClientAddress || 'Sin calle',
            'S/N', // Source no tiene número separado
            client.ClientLocality || 'Sin ciudad',
            'Buenos Aires', // Asumir provincia por defecto
            '' // Sin CP en source
          ]
        );
      }

      if (client.IsDeleted) skippedDeleted++;
      else inserted++;
    } catch (err: any) {
      console.error(`  ERROR cliente ${client.ClientID} (${email}):`, err.message);
      errors++;
    }
  }

  console.log(`  Activos migrados: ${inserted}`);
  console.log(`  Eliminados migrados (soft-deleted): ${skippedDeleted}`);
  console.log(`  Errores: ${errors}`);

  await closeConnections();
}

migrateClients().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**Step 2: Verificar que existe la tabla user_addresses (migración 003)**

```bash
cd apps/api && bun run db:migrate
```

**Step 3: Ejecutar**

```bash
cd tools/migration && bun run migrate:clients
```

**Step 4: Verificar resultado**

```bash
cd tools/migration && bun -e "
  const { targetDb, closeConnections } = require('./src/db');
  targetDb.query(\"SELECT role, COUNT(*) FROM users GROUP BY role\").then(r => { console.table(r.rows); return closeConnections(); });
"
```

Expected: rows con customer: N, admin/owner: M

**Step 5: Commit**

```bash
git add tools/migration/src/migrate-clients.ts
git commit -m "chore(migration): add clients migration script"
```

---

## Task 7: Migrar Brands desde Products.Manufacturer

> Source no tiene tabla de marcas. Se derivan los valores únicos de `Manufacturer`.

**Files:**

- Create: `tools/migration/src/migrate-brands.ts`

**Step 1: Crear el script**

```typescript
import { sourceDb, targetDb, closeConnections } from './db';

function slugify(text: string): string {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function migrateBrands() {
  console.log('Migrando Brands (desde Manufacturer)...');

  const { rows: manufacturers } = await sourceDb.query(`
    SELECT DISTINCT "Manufacturer"
    FROM "Products"
    WHERE "Manufacturer" IS NOT NULL AND "Manufacturer" != ''
    ORDER BY "Manufacturer"
  `);

  console.log(`  Encontradas: ${manufacturers.length} marcas únicas`);

  let inserted = 0;
  for (const { Manufacturer } of manufacturers) {
    const name = Manufacturer.trim();
    const slug = slugify(name);

    await targetDb.query(
      `INSERT INTO brands (name, slug, is_active)
       VALUES ($1, $2, true)
       ON CONFLICT (slug) DO NOTHING`,
      [name, slug]
    );
    inserted++;
  }

  console.log(`  Insertadas: ${inserted}`);

  await closeConnections();
}

migrateBrands().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**Step 2: Ejecutar**

```bash
cd tools/migration && bun run migrate:brands
```

**Step 3: Commit**

```bash
git add tools/migration/src/migrate-brands.ts
git commit -m "chore(migration): add brands migration script"
```

---

## Task 8: Migrar Categories desde Products.Business

> Source no tiene tabla de categorías. Se derivan los valores únicos del campo `Business` usando el mapeo definido en `config.ts`.

**Files:**

- Create: `tools/migration/src/migrate-categories.ts`

**Step 1: Verificar que config.ts tiene el mapeo completo (Task 2)**

**Step 2: Crear el script**

```typescript
import { sourceDb, targetDb, closeConnections } from './db';
import { BUSINESS_CATEGORY_MAP } from './config';

function slugify(text: string): string {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function migrateCategories() {
  console.log('Migrando Categories...');

  const { rows: businesses } = await sourceDb.query(`
    SELECT DISTINCT "Business"
    FROM "Products"
    WHERE "Business" IS NOT NULL
    ORDER BY "Business"
  `);

  console.log(`  Valores Business únicos: ${businesses.map((b) => b.Business).join(', ')}`);

  // Crear categoría raíz si no existe
  await targetDb.query(`
    INSERT INTO categories (name, slug, is_active)
    VALUES ('Sin Categoría', 'sin-categoria', true)
    ON CONFLICT (slug) DO NOTHING
  `);

  for (const { Business } of businesses) {
    const name = BUSINESS_CATEGORY_MAP[Business] || `Categoría ${Business}`;
    const slug = slugify(name);

    await targetDb.query(
      `INSERT INTO categories (name, slug, is_active)
       VALUES ($1, $2, true)
       ON CONFLICT (slug) DO NOTHING`,
      [name, slug]
    );
    console.log(`  Business ${Business} → "${name}" (${slug})`);
  }

  await closeConnections();
}

migrateCategories().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**Step 3: Ejecutar**

```bash
cd tools/migration && bun run migrate:categories
```

**Step 4: Commit**

```bash
git add tools/migration/src/migrate-categories.ts
git commit -m "chore(migration): add categories migration script"
```

---

## Task 9: Migrar Products → products

> **IMPORTANTE:** `base_price` se calcula según la decisión tomada en "Decisiones Previas". Ver `config.ts` → `PUBLIC_PRICE_LIST_ID`.

**Files:**

- Create: `tools/migration/src/migrate-products.ts`

**Step 1: Crear el script**

```typescript
import { sourceDb, targetDb, closeConnections } from './db';
import { BUSINESS_CATEGORY_MAP, PUBLIC_PRICE_LIST_ID } from './config';

function slugify(text: string): string {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function migrateProducts() {
  console.log('Migrando Products...');

  const { rows: products } = await sourceDb.query(`
    SELECT * FROM "Products" ORDER BY "Name"
  `);

  console.log(`  Encontrados: ${products.length} productos`);

  // Obtener categorías del target para mapear
  const { rows: categories } = await targetDb.query('SELECT id, slug FROM categories');
  const categorySlugMap: Record<string, string> = {};
  categories.forEach((c) => {
    categorySlugMap[c.slug] = c.id;
  });

  // Obtener brands del target
  const { rows: brands } = await targetDb.query('SELECT id, name FROM brands');
  const brandNameMap: Record<string, string> = {};
  brands.forEach((b) => {
    brandNameMap[b.name.toLowerCase().trim()] = b.id;
  });

  // Obtener margen de la lista pública si corresponde
  let publicMargin = 0;
  if (PUBLIC_PRICE_LIST_ID) {
    const { rows: pl } = await targetDb.query('SELECT margin FROM price_lists WHERE id = $1', [
      PUBLIC_PRICE_LIST_ID
    ]);
    publicMargin = parseFloat(pl[0]?.margin || '0');
  }

  const defaultCategoryId = categorySlugMap['sin-categoria'];

  let inserted = 0;
  let errors = 0;
  const slugCount: Record<string, number> = {};

  for (const product of products) {
    // Categoría
    const businessName = BUSINESS_CATEGORY_MAP[product.Business] || `Categoría ${product.Business}`;
    const businessSlug = slugify(businessName);
    const categoryId = categorySlugMap[businessSlug] || defaultCategoryId;

    // Marca
    const brandId = product.Manufacturer
      ? brandNameMap[product.Manufacturer.toLowerCase().trim()] || null
      : null;

    // SKU: usar Code si existe, sino generar
    const sku = product.Code
      ? `SKU-${product.Code}`
      : `SKU-${product.ProductID.substring(0, 8).toUpperCase()}`;

    // Slug único
    let baseSlug = slugify(product.Name || 'producto');
    if (!baseSlug) baseSlug = `producto-${product.ProductID.substring(0, 8)}`;
    slugCount[baseSlug] = (slugCount[baseSlug] || 0) + 1;
    const slug = slugCount[baseSlug] > 1 ? `${baseSlug}-${slugCount[baseSlug]}` : baseSlug;

    // Precio: cost_price + margen público, en centavos
    const costPrice = parseFloat(product.CostPrice || '0');
    const basePrice = PUBLIC_PRICE_LIST_ID
      ? Math.round(costPrice * (1 + publicMargin / 100) * 100)
      : 0; // Opción B: precio 0, admin completa

    const stock = product.Quantity || 0;
    const deletedAt = product.IsDeleted ? new Date() : null;

    try {
      await targetDb.query(
        `INSERT INTO products (
          id, category_id, brand_id, sku, name, slug, description,
          base_price, stock, reserved_stock, is_featured, is_active,
          deleted_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          slug = EXCLUDED.slug,
          updated_at = NOW()`,
        [
          product.ProductID,
          categoryId,
          brandId,
          sku,
          product.Name || 'Sin nombre',
          slug,
          product.Description || null,
          basePrice,
          stock,
          0, // reserved_stock = 0 al inicio
          false, // is_featured = false por defecto
          !product.IsDeleted,
          deletedAt
        ]
      );
      inserted++;
    } catch (err: any) {
      console.error(`  ERROR producto ${product.ProductID} (${product.Name}):`, err.message);
      errors++;
    }
  }

  console.log(`  Insertados: ${inserted}, Errores: ${errors}`);

  await closeConnections();
}

migrateProducts().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**Step 2: Ejecutar**

```bash
cd tools/migration && bun run migrate:products
```

Expected: "Insertados: N, Errores: 0"

**Step 3: Commit**

```bash
git add tools/migration/src/migrate-products.ts
git commit -m "chore(migration): add products migration script"
```

---

## Task 10: Migrar Orders → orders

> OrderStatus int se mapea al enum. Address de una sola línea va a `shipping_street`. `shipping_street_number` = 'S/N'. Montos se multiplican × 100 (centavos).

**Files:**

- Create: `tools/migration/src/migrate-orders.ts`

**Step 1: Crear el script**

```typescript
import { sourceDb, targetDb, closeConnections } from './db';
import { ORDER_STATUS_MAP } from './config';

function formatOrderNumber(orderNumber: number, orderDate: Date): string {
  const date = new Date(orderDate);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const n = String(orderNumber).padStart(4, '0');
  return `VLP-${y}${m}${d}-${n}`;
}

async function migrateOrders() {
  console.log('Migrando Orders...');

  const { rows: orders } = await sourceDb.query(`
    SELECT * FROM "Orders" WHERE "IsDeleted" = false
    ORDER BY "OrderDate"
  `);

  console.log(`  Encontrados: ${orders.length} pedidos activos`);

  // Verificar que los usuarios existen en target
  const { rows: users } = await targetDb.query('SELECT id FROM users');
  const userIds = new Set(users.map((u) => u.id));

  let inserted = 0;
  let skippedNoUser = 0;
  let errors = 0;

  for (const order of orders) {
    // Verificar usuario existe
    if (!userIds.has(order.ClientID)) {
      console.warn(
        `  SKIP: pedido ${order.OrderID} - cliente ${order.ClientID} no existe en target`
      );
      skippedNoUser++;
      continue;
    }

    const status = ORDER_STATUS_MAP[order.OrderStatus] || 'delivered';
    const orderNumber = formatOrderNumber(order.OrderNumber, order.OrderDate);

    // Montos en centavos
    const subtotal = Math.round(parseFloat(order.Amount || order.Total || '0') * 100);
    const total = Math.round(parseFloat(order.Total || '0') * 100);

    // Marcar como cancelado si OrderStatus lo indica
    const cancelledAt = status === 'cancelled' ? new Date(order.OrderDate) : null;

    try {
      await targetDb.query(
        `INSERT INTO orders (
          id, user_id, order_number, status,
          subtotal, shipping_cost, total,
          shipping_street, shipping_street_number,
          shipping_city, shipping_province, shipping_postcode,
          payment_method,
          delivered_at, cancelled_at,
          created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT (id) DO NOTHING`,
        [
          order.OrderID,
          order.ClientID,
          orderNumber,
          status,
          subtotal,
          0, // shipping_cost desconocido en source
          total,
          order.Address || 'Sin dirección',
          'S/N', // Source no tiene número separado
          'Sin ciudad',
          'Buenos Aires',
          '',
          'cash', // Source es B2B, asumir efectivo/transferencia
          status === 'delivered' ? order.RealDeliveryDate || order.DeliveryDate : null,
          cancelledAt,
          order.OrderDate
        ]
      );
      inserted++;
    } catch (err: any) {
      console.error(`  ERROR pedido ${order.OrderID}:`, err.message);
      errors++;
    }
  }

  console.log(`  Insertados: ${inserted}`);
  console.log(`  Skipped (sin usuario): ${skippedNoUser}`);
  console.log(`  Errores: ${errors}`);

  await closeConnections();
}

migrateOrders().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**Step 2: Ejecutar**

```bash
cd tools/migration && bun run migrate:orders
```

**Step 3: Commit**

```bash
git add tools/migration/src/migrate-orders.ts
git commit -m "chore(migration): add orders migration script"
```

---

## Task 11: Migrar OrderProducts → order_items

> Los triggers de `order_items` calculan `subtotal` automáticamente, pero como hacemos INSERT directo con subtotal calculado, debemos desactivar temporalmente el trigger o confiar en que calcula igual.

**Files:**

- Create: `tools/migration/src/migrate-order-items.ts`

**Step 1: Crear el script**

```typescript
import { sourceDb, targetDb, closeConnections } from './db';

async function migrateOrderItems() {
  console.log('Migrando OrderProducts → order_items...');

  // Solo migrar items de orders que existen en target
  const { rows: existingOrders } = await targetDb.query('SELECT id FROM orders');
  const existingOrderIds = new Set(existingOrders.map((o) => o.id));

  const { rows: items } = await sourceDb.query(`
    SELECT op.*, p."Name" as "ProductName", p."Code" as "ProductCode"
    FROM "OrderProducts" op
    LEFT JOIN "Products" p ON p."ProductID" = op."ProductID"
  `);

  console.log(`  Encontrados: ${items.length} items`);

  // Verificar productos en target
  const { rows: products } = await targetDb.query('SELECT id, name, sku FROM products');
  const productMap = new Map(products.map((p) => [p.id, p]));

  let inserted = 0;
  let skippedNoOrder = 0;
  let skippedNoProduct = 0;
  let errors = 0;

  for (const item of items) {
    if (!existingOrderIds.has(item.OrderID)) {
      skippedNoOrder++;
      continue;
    }

    const product = productMap.get(item.ProductID);
    if (!product) {
      console.warn(`  SKIP: item - producto ${item.ProductID} no existe en target`);
      skippedNoProduct++;
      continue;
    }

    const unitPrice = Math.round(parseFloat(item.UnitaryPrice || '0') * 100);
    const subtotal = Math.round(parseFloat(item.Subtotal || '0') * 100);

    try {
      await targetDb.query(
        `INSERT INTO order_items (
          order_id, product_id, product_name, product_sku,
          quantity, unit_price, subtotal
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT DO NOTHING`,
        [
          item.OrderID,
          item.ProductID,
          product.name,
          product.sku,
          item.Quantity,
          unitPrice,
          subtotal
        ]
      );
      inserted++;
    } catch (err: any) {
      console.error(`  ERROR item order=${item.OrderID} product=${item.ProductID}:`, err.message);
      errors++;
    }
  }

  console.log(`  Insertados: ${inserted}`);
  console.log(`  Skipped (sin orden): ${skippedNoOrder}`);
  console.log(`  Skipped (sin producto): ${skippedNoProduct}`);
  console.log(`  Errores: ${errors}`);

  await closeConnections();
}

migrateOrderItems().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**Step 2: Ejecutar**

```bash
cd tools/migration && bun run migrate:order-items
```

**Step 3: Commit**

```bash
git add tools/migration/src/migrate-order-items.ts
git commit -m "chore(migration): add order-items migration script"
```

---

## Task 12: Validar la migración

**Files:**

- Create: `tools/migration/src/validate.ts`

**Step 1: Crear el script**

```typescript
import { sourceDb, targetDb, closeConnections } from './db';

async function validate() {
  console.log('\n====== VALIDACIÓN DE MIGRACIÓN ======\n');

  // 1. Conteos comparados
  console.log('--- Conteos ---');
  const checks = [
    {
      label: 'Clientes → users(customer)',
      source: 'SELECT COUNT(*) FROM "Clients"',
      target: "SELECT COUNT(*) FROM users WHERE role='customer'"
    },
    {
      label: 'Users staff → users(admin/owner/driver)',
      source: 'SELECT COUNT(*) FROM "Users"',
      target: "SELECT COUNT(*) FROM users WHERE role != 'customer'"
    },
    {
      label: 'ListPrices → price_lists',
      source: 'SELECT COUNT(*) FROM "ListPrices"',
      target: 'SELECT COUNT(*) FROM price_lists'
    },
    {
      label: 'Products → products',
      source: 'SELECT COUNT(*) FROM "Products"',
      target: 'SELECT COUNT(*) FROM products'
    },
    {
      label: 'Orders activos → orders',
      source: 'SELECT COUNT(*) FROM "Orders" WHERE "IsDeleted"=false',
      target: 'SELECT COUNT(*) FROM orders'
    },
    {
      label: 'OrderProducts → order_items',
      source: 'SELECT COUNT(*) FROM "OrderProducts"',
      target: 'SELECT COUNT(*) FROM order_items'
    }
  ];

  for (const check of checks) {
    const [s, t] = await Promise.all([sourceDb.query(check.source), targetDb.query(check.target)]);
    const sourceCount = parseInt(s.rows[0].count);
    const targetCount = parseInt(t.rows[0].count);
    const status = Math.abs(sourceCount - targetCount) <= 5 ? '✓' : '✗ REVISAR';
    console.log(`  ${status} ${check.label}: source=${sourceCount}, target=${targetCount}`);
  }

  // 2. Integridad referencial
  console.log('\n--- Integridad referencial ---');

  const orphanItems = await targetDb.query(`
    SELECT COUNT(*) FROM order_items oi
    LEFT JOIN orders o ON o.id = oi.order_id
    WHERE o.id IS NULL
  `);
  console.log(`  Orphan order_items: ${orphanItems.rows[0].count} (debe ser 0)`);

  const orphanOrders = await targetDb.query(`
    SELECT COUNT(*) FROM orders o
    LEFT JOIN users u ON u.id = o.user_id
    WHERE u.id IS NULL
  `);
  console.log(`  Orphan orders (sin usuario): ${orphanOrders.rows[0].count} (debe ser 0)`);

  const orphanProducts = await targetDb.query(`
    SELECT COUNT(*) FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE c.id IS NULL
  `);
  console.log(`  Products sin categoría válida: ${orphanProducts.rows[0].count} (debe ser 0)`);

  // 3. Checks de datos
  console.log('\n--- Checks de datos ---');

  const zeroPrice = await targetDb.query(`
    SELECT COUNT(*) FROM products WHERE base_price = 0 AND is_active = true AND deleted_at IS NULL
  `);
  console.log(
    `  Productos activos con precio 0: ${zeroPrice.rows[0].count} (revisar si es intencional)`
  );

  const noEmailUsers = await targetDb.query(`
    SELECT COUNT(*) FROM users WHERE email LIKE '%@noemail.valplas.net'
  `);
  console.log(`  Clientes con email placeholder: ${noEmailUsers.rows[0].count}`);

  const usersByRole = await targetDb.query(`
    SELECT role, COUNT(*) FROM users GROUP BY role ORDER BY role
  `);
  console.log('\n  Usuarios por rol:');
  usersByRole.rows.forEach((r) => console.log(`    ${r.role}: ${r.count}`));

  console.log('\n====== FIN VALIDACIÓN ======\n');

  await closeConnections();
}

validate().catch(console.error);
```

**Step 2: Ejecutar y revisar toda la salida**

```bash
cd tools/migration && bun run validate
```

Expected: Todos los conteos alineados (diferencia ≤ 5 por skips conocidos), orphans = 0.

**Step 3: Commit**

```bash
git add tools/migration/src/validate.ts
git commit -m "chore(migration): add validation script"
```

---

## Task 13: Mecanismo de reset de contraseñas

> Todos los usuarios migrados tienen un hash temporal. Se necesita una forma de que los usuarios establezcan su contraseña.

**Opciones (elegir con el admin):**

**Opción A (Recomendada para staff):** El admin resetea manualmente via panel de admin → "Enviar email de recuperación"

**Opción B (Para clientes):** En el primer login, detectar que la contraseña es temporal y redirigir a "Configurar contraseña" con el email.

**Opción C:** Script SQL para marcar usuarios que necesitan reset:

```sql
-- Agregar columna needs_password_reset a users
ALTER TABLE users ADD COLUMN IF NOT EXISTS needs_password_reset BOOLEAN NOT NULL DEFAULT false;

-- Marcar todos los migrados (identificar por fecha de creación cercana a hoy)
UPDATE users
SET needs_password_reset = true
WHERE created_at < NOW() AND created_at > '2026-03-04 00:00:00';
```

Para implementar Opción B en el login del backend:

```typescript
// En auth.controller.ts, después de verificar contraseña:
if (user.needs_password_reset) {
  return res.status(403).json({
    success: false,
    error: {
      code: 'PASSWORD_RESET_REQUIRED',
      message: 'Debés configurar tu contraseña para continuar'
    }
  });
}
```

---

## Orden de Ejecución Final

```bash
cd tools/migration

# 1. Llenar config.ts con los mapeos reales (MANUAL)
bun run inspect   # ← Ver datos y completar config.ts

# 2. Referencia
bun run migrate:price-lists

# 3. Usuarios (sin dependencias entre ellos, pero deben ir antes que orders)
bun run migrate:users
bun run migrate:clients

# 4. Catálogo (orden importa: brands/categories antes que products)
bun run migrate:brands
bun run migrate:categories
bun run migrate:products

# 5. Pedidos (dependen de users y products)
bun run migrate:orders
bun run migrate:order-items

# 6. Validar
bun run validate
```

---

## Notas de Rollback

Si algo sale mal, limpiar el target y volver a empezar:

```sql
-- ⚠️ DESTRUYE TODO - solo en staging o si se migró mal
TRUNCATE order_items, orders, products, user_addresses, users, brands, categories, price_lists CASCADE;
```
