# 🗄️ Configuración de Supabase

Esta guía cubre la configuración completa de Supabase para Valplas: base de datos PostgreSQL, Storage para imágenes, y configuración de seguridad.

## 📋 Tabla de Contenidos

- [Pre-requisitos](#pre-requisitos)
- [Crear Proyecto](#crear-proyecto)
- [Configuración de Base de Datos](#configuración-de-base-de-datos)
- [Migraciones](#migraciones)
- [Storage para Imágenes](#storage-para-imágenes)
- [Row Level Security (RLS)](#row-level-security-rls)
- [Backups](#backups)
- [Monitoreo](#monitoreo)
- [Troubleshooting](#troubleshooting)

---

## Pre-requisitos

- Cuenta en [Supabase](https://supabase.com)
- Supabase CLI instalado:
  ```bash
  npm install -g supabase
  # o
  bun add -g supabase
  ```
- PostgreSQL client (opcional, para conectarse directamente)

---

## Crear Proyecto

### Paso 1: Crear Proyecto en Dashboard

1. Ve a [Supabase Dashboard](https://app.supabase.com)
2. Click en **New Project**
3. Configura:
   - **Name**: `valplas-production`
   - **Database Password**: (genera una fuerte, guárdala en 1Password/Bitwarden)
   - **Region**: `South America (São Paulo)` (más cercano a Argentina)
   - **Pricing Plan**: Free (para empezar) o Pro ($25/mes)
4. Click en **Create new project**

Supabase tardará unos minutos en aprovisionar el proyecto.

### Paso 2: Obtener Credenciales

Una vez creado, ve a **Settings** → **API**:

| Credencial           | Uso                                                      |
| -------------------- | -------------------------------------------------------- |
| **Project URL**      | `https://xxx.supabase.co`                                |
| **anon public key**  | Frontend (permisos limitados)                            |
| **service_role key** | Backend (permisos completos) ⚠️ NUNCA exponer al cliente |

Ve a **Settings** → **Database** para obtener:

| Credencial   | Valor                |
| ------------ | -------------------- |
| **Host**     | `db.xxx.supabase.co` |
| **Port**     | `5432`               |
| **Database** | `postgres`           |
| **User**     | `postgres`           |
| **Password** | La que configuraste  |

### Paso 3: Generar Connection Strings

#### Para uso con Prisma/Knex (Pooler Connection)

```bash
postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
```

#### Connection String Directo

```bash
postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres?sslmode=require
```

**Nota**: Usa **Pooler Connection** en producción (mejor performance con muchas conexiones).

---

## Configuración de Base de Datos

### Estructura del Schema

El proyecto usa migraciones SQL para mantener el schema. Ver estructura completa en `apps/api/src/infrastructure/database/migrations/`.

### Configurar Extensiones

Supabase tiene muchas extensiones preinstaladas. Activa las necesarias:

```sql
-- UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Full text search (español)
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- PostGIS (para geolocalización futura)
CREATE EXTENSION IF NOT EXISTS "postgis";
```

Ejecuta en **SQL Editor** del dashboard de Supabase.

### Configurar Timezone

```sql
-- Establecer timezone para Argentina
ALTER DATABASE postgres SET timezone TO 'America/Argentina/Buenos_Aires';
```

### Optimizar Performance

```sql
-- Aumentar shared_buffers (si usas plan Pro)
ALTER SYSTEM SET shared_buffers = '256MB';

-- Configurar work_mem para queries complejas
ALTER SYSTEM SET work_mem = '16MB';

-- Reload configuración
SELECT pg_reload_conf();
```

**Nota**: Solo aplica en plan Pro. En plan Free no tienes acceso a `ALTER SYSTEM`.

---

## Migraciones

### Configurar Supabase CLI

Desde la raíz del proyecto:

```bash
cd apps/api
supabase login
```

### Inicializar Supabase Localmente

```bash
supabase init
```

Esto crea una carpeta `supabase/` con:

- `migrations/` - Archivos SQL de migraciones
- `config.toml` - Configuración local

### Link con Proyecto Remoto

```bash
supabase link --project-ref [PROJECT_REF]
```

Obtén `PROJECT_REF` desde la URL del dashboard: `https://app.supabase.com/project/[PROJECT_REF]`

### Crear Nueva Migración

```bash
supabase migration new nombre_descriptivo
```

Ejemplo:

```bash
supabase migration new create_products_table
```

Esto crea `supabase/migrations/YYYYMMDDHHMMSS_create_products_table.sql`.

### Escribir Migración

Ejemplo de migración para tabla `products`:

```sql
-- supabase/migrations/20260127000001_create_products_table.sql

-- Crear tabla products
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  base_price DECIMAL(10, 2) NOT NULL CHECK (base_price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  reserved_stock INTEGER NOT NULL DEFAULT 0 CHECK (reserved_stock >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_is_active ON products(is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_deleted_at ON products(deleted_at);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comentarios
COMMENT ON TABLE products IS 'Productos del catálogo de Valplas';
COMMENT ON COLUMN products.reserved_stock IS 'Stock reservado en pedidos pendientes de pago';
```

### Aplicar Migraciones

#### Localmente (para desarrollo)

```bash
supabase db reset
```

Esto aplica todas las migraciones desde cero.

#### En Producción

```bash
supabase db push
```

**⚠️ ADVERTENCIA**: Esto aplica migraciones en producción. Asegúrate de testearlas localmente primero.

### Rollback de Migración

Supabase no tiene rollback automático. Debes crear una nueva migración con el rollback:

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_rollback_xyz.sql

-- Rollback: eliminar tabla products
DROP TABLE IF EXISTS products CASCADE;
```

---

## Storage para Imágenes

### Crear Bucket para Productos

1. Ve a **Storage** en el dashboard
2. Click en **New Bucket**
3. Configura:
   - **Name**: `products`
   - **Public**: Yes (para acceso directo desde URLs)
   - **File size limit**: 5MB
   - **Allowed MIME types**: `image/jpeg, image/png, image/webp`

### Configurar Políticas de Storage

Ve a **Storage** → `products` → **Policies**:

#### Política: Lectura pública

```sql
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'products');
```

#### Política: Upload solo autenticado (para admin)

```sql
CREATE POLICY "Admin can upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'products' AND
  auth.jwt() ->> 'role' = 'admin'
);
```

#### Política: Delete solo admin

```sql
CREATE POLICY "Admin can delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'products' AND
  auth.jwt() ->> 'role' = 'admin'
);
```

### Subir Imágenes desde Backend

```typescript
// apps/api/src/infrastructure/external/supabase-storage.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY! // Service key para bypass RLS
);

export async function uploadProductImage(file: Buffer, filename: string): Promise<string> {
  const path = `products/${Date.now()}-${filename}`;

  const { data, error } = await supabase.storage.from('products').upload(path, file, {
    contentType: 'image/webp',
    upsert: false
  });

  if (error) throw error;

  // Retornar URL pública
  const { data: publicData } = supabase.storage.from('products').getPublicUrl(path);

  return publicData.publicUrl;
}
```

### Optimización de Imágenes

Supabase Storage no optimiza imágenes automáticamente. Usa Sharp en el backend:

```typescript
import sharp from 'sharp';

export async function optimizeImage(inputBuffer: Buffer): Promise<Buffer> {
  return sharp(inputBuffer)
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}
```

### Generar Thumbnails

```typescript
export async function generateThumbnail(inputBuffer: Buffer): Promise<Buffer> {
  return sharp(inputBuffer).resize(300, 300, { fit: 'cover' }).webp({ quality: 70 }).toBuffer();
}
```

---

## Row Level Security (RLS)

Supabase recomienda usar RLS para seguridad a nivel de filas.

### Habilitar RLS en Tablas Sensibles

```sql
-- Habilitar RLS en tabla users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Política: Los usuarios solo ven su propia info
CREATE POLICY "Users can view own data"
ON users FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Política: Los admins ven todo
CREATE POLICY "Admins can view all users"
ON users FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'owner')
  )
);
```

### Bypass RLS desde Backend

Usa **service_role key** en el backend para bypass RLS:

```typescript
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY! // ⚠️ NUNCA exponer al cliente
);
```

---

## Backups

### Backups Automáticos

Supabase hace backups diarios automáticamente:

- **Free Plan**: 7 días de retención
- **Pro Plan**: 30 días de retención

### Restore desde Backup

1. Ve a **Database** → **Backups**
2. Selecciona el backup deseado
3. Click en **Restore**

**⚠️ ADVERTENCIA**: Esto sobrescribe la base de datos actual.

### Backup Manual (pg_dump)

Para hacer un backup manual local:

```bash
pg_dump -h db.[PROJECT_REF].supabase.co \
  -U postgres \
  -d postgres \
  -F c \
  -f backup_$(date +%Y%m%d).dump
```

Restore:

```bash
pg_restore -h db.[PROJECT_REF].supabase.co \
  -U postgres \
  -d postgres \
  -c \
  backup_20260127.dump
```

---

## Monitoreo

### Database Health

Ve a **Database** → **Database Health** para ver:

- CPU usage
- Memory usage
- Active connections
- Query performance

### Slow Queries

Ve a **Database** → **Query Performance**:

- Identifica queries lentos
- Optimiza con índices

### Logs

Ve a **Logs** → **Database Logs**:

- Errores de queries
- Conexiones fallidas
- Deadlocks

---

## Configuración de Entornos

### Production

```bash
# .env.production
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
SUPABASE_URL=https://[PROJECT_REF].supabase.co
SUPABASE_SERVICE_KEY=eyJhbGc...
```

### Staging

Crea un proyecto separado en Supabase:

- **Name**: `valplas-staging`
- Misma estructura de DB (usa las mismas migraciones)
- Variables diferentes

```bash
# .env.staging
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[STAGING_REF].supabase.co:5432/postgres
SUPABASE_URL=https://[STAGING_REF].supabase.co
SUPABASE_SERVICE_KEY=eyJhbGc...
```

### Local Development

Usa Supabase CLI para desarrollo local:

```bash
supabase start
```

Esto levanta una instancia local de Supabase con Docker:

- PostgreSQL: `localhost:54322`
- Studio UI: `http://localhost:54323`
- API: `http://localhost:54321`

```bash
# .env.local
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_KEY=eyJhbGc... (anon key local)
```

---

## Triggers de Negocio

### Trigger: Reservar Stock al Crear Pedido

```sql
CREATE OR REPLACE FUNCTION reserve_stock()
RETURNS TRIGGER AS $$
BEGIN
  -- Incrementar reserved_stock
  UPDATE products
  SET reserved_stock = reserved_stock + NEW.quantity
  WHERE id = NEW.product_id;

  -- Verificar que haya stock disponible
  IF (SELECT stock - reserved_stock FROM products WHERE id = NEW.product_id) < 0 THEN
    RAISE EXCEPTION 'Insufficient stock for product %', NEW.product_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER order_items_reserve_stock
  AFTER INSERT ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION reserve_stock();
```

### Trigger: Descontar Stock al Confirmar Pago

```sql
CREATE OR REPLACE FUNCTION confirm_stock()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo si el estado cambió a 'paid'
  IF NEW.status = 'paid' AND OLD.status != 'paid' THEN
    -- Descontar stock y liberar reserva
    UPDATE products p
    SET
      stock = stock - oi.quantity,
      reserved_stock = reserved_stock - oi.quantity
    FROM order_items oi
    WHERE oi.order_id = NEW.id AND p.id = oi.product_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_confirm_stock
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION confirm_stock();
```

---

## Troubleshooting

### Error: "Too many connections"

**Causa**: Límite de conexiones alcanzado (plan Free: 60 conexiones).

**Solución**:

1. Usa **connection pooling** (pgBouncer):
   ```typescript
   // Cambiar puerto de 5432 a 6543 (pooler)
   DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:6543/postgres
   ```
2. Cierra conexiones idle:
   ```sql
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE state = 'idle' AND state_change < NOW() - INTERVAL '5 minutes';
   ```

---

### Error: "SSL connection required"

**Causa**: Supabase requiere SSL en producción.

**Solución**: Agrega `?sslmode=require` al connection string:

```bash
postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres?sslmode=require
```

---

### Migración Falla en Producción

**Causa**: Migración tiene errores o conflictos.

**Solución**:

1. Revierte cambios recientes en UI de Supabase (si es posible)
2. Crea migración de rollback
3. Testea siempre en staging primero

---

## Límites del Plan Free

| Recurso       | Límite Free    | Límite Pro      |
| ------------- | -------------- | --------------- |
| Database Size | 500 MB         | 8 GB            |
| Storage       | 1 GB           | 100 GB          |
| Bandwidth     | 2 GB/mes       | 250 GB/mes      |
| Conexiones    | 60 simultáneas | 200 simultáneas |

Para Valplas, el plan Free es suficiente para MVP. Upgrade a Pro ($25/mes) cuando:

- Database > 400 MB
- Storage > 800 MB
- Más de 50 conexiones simultáneas

---

## Checklist de Configuración

- [ ] Proyecto creado en región correcta (São Paulo)
- [ ] Connection strings guardados en variables de entorno
- [ ] Extensiones necesarias habilitadas (`uuid-ossp`, `unaccent`)
- [ ] Timezone configurado (`America/Argentina/Buenos_Aires`)
- [ ] Migraciones aplicadas con `supabase db push`
- [ ] Bucket `products` creado con políticas de acceso
- [ ] RLS habilitado en tablas sensibles
- [ ] Triggers de stock configurados
- [ ] Backups automáticos verificados
- [ ] Staging environment configurado separado
- [ ] Monitoreo configurado (alerts en plan Pro)

---

## Recursos Adicionales

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase CLI Reference](https://supabase.com/docs/guides/cli)
- [PostgreSQL Best Practices](https://wiki.postgresql.org/wiki/Don't_Do_This)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
