# 🚂 Deploy Backend en Railway

Esta guía cubre el deployment del backend Express + TypeScript en Railway, incluyendo configuración de entornos, variables, y deployment automático.

## 📋 Tabla de Contenidos

- [Pre-requisitos](#pre-requisitos)
- [Configuración Inicial](#configuración-inicial)
- [Deploy Manual](#deploy-manual)
- [Deploy Automático](#deploy-automático)
- [Variables de Entorno](#variables-de-entorno)
- [Configuración de Redis](#configuración-de-redis)
- [Health Checks](#health-checks)
- [Troubleshooting](#troubleshooting)

---

## Pre-requisitos

- Cuenta en [Railway](https://railway.app)
- Railway CLI instalado:
  ```bash
  npm install -g @railway/cli
  # o
  bun add -g @railway/cli
  ```
- Repository en GitHub
- Base de datos en Supabase (ver [SUPABASE_SETUP.md](./SUPABASE_SETUP.md))
- Redis en Upstash (opcional, para cache y jobs)

---

## Configuración Inicial

### 1. Preparar el Proyecto

Asegúrate de que tu `apps/api/package.json` tenga los scripts necesarios:

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts",
    "db:migrate": "tsx src/infrastructure/database/migrate.ts",
    "db:seed": "tsx src/infrastructure/database/seed.ts"
  }
}
```

### 2. Crear `Procfile` (opcional)

Railway detecta automáticamente el comando `start`, pero puedes ser explícito:

```
# apps/api/Procfile
web: node dist/server.js
```

### 3. Configurar TypeScript para Producción

Asegúrate de que `apps/api/tsconfig.json` compile correctamente:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "commonjs",
    "target": "ES2022",
    "esModuleInterop": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

### 4. Crear `.railwayignore`

Crea `apps/api/.railwayignore` para excluir archivos innecesarios:

```
# Dependencies
node_modules
.pnp
.pnp.js

# Testing
coverage
*.test.ts
__tests__

# Environment
.env
.env.local
.env*.local

# Debug
npm-debug.log*
yarn-debug.log*
bun-debug.log*

# Local
.DS_Store
*.local
src/**/*.test.ts
```

---

## Deploy Manual

### Paso 1: Login en Railway

```bash
railway login
```

Esto abrirá el navegador para autenticarte.

### Paso 2: Crear Proyecto

Desde la raíz del proyecto:

```bash
cd apps/api
railway init
```

Selecciona:

- **Create new project**: `valplas-api`
- **Environment**: Production

Esto creará un archivo `railway.json` (no commitear).

### Paso 3: Link del Servicio

```bash
railway link
```

Selecciona el proyecto que acabas de crear.

### Paso 4: Deploy

```bash
railway up
```

Esto construirá y desplegará el backend. Railway te dará una URL temporal:

```
https://valplas-api-production.up.railway.app
```

### Paso 5: Verificar Deployment

```bash
railway logs
```

O visita el dashboard de Railway para ver los logs en tiempo real.

---

## Deploy Automático

### Configurar Integration con GitHub

1. Ve a [Railway Dashboard](https://railway.app/dashboard)
2. Selecciona tu proyecto `valplas-api`
3. Ve a **Settings** → **Service** → **Source**
4. Click en **Connect GitHub Repository**
5. Selecciona tu repo: `tu-usuario/valplas-tienda`
6. Configura:
   - **Root Directory**: `apps/api`
   - **Branch**: `main` (producción) y `develop` (staging)

### Crear Entornos Separados

Railway permite múltiples entornos en un mismo proyecto:

#### Production (main branch)

1. En Railway Dashboard → **New Environment**
2. Nombre: `production`
3. Branch: `main`
4. Domain: `api.valplas.net` (custom domain)

#### Staging (develop branch)

1. En Railway Dashboard → **New Environment**
2. Nombre: `staging`
3. Branch: `develop`
4. Domain: `valplas-api-staging.up.railway.app` (railway domain)

### Configuración de Build

Railway detecta automáticamente el build, pero puedes configurarlo manualmente:

| Setting            | Valor                          |
| ------------------ | ------------------------------ |
| **Build Command**  | `bun install && bun run build` |
| **Start Command**  | `node dist/server.js`          |
| **Watch Paths**    | `apps/api/**`                  |
| **Root Directory** | `apps/api`                     |

### Configurar Secrets en GitHub

Para el workflow de GitHub Actions, agrega estos secrets:

| Secret               | Descripción            | Cómo obtenerlo                                                                |
| -------------------- | ---------------------- | ----------------------------------------------------------------------------- |
| `RAILWAY_TOKEN`      | Token de autenticación | [Railway Account Settings](https://railway.app/account/tokens) → Create Token |
| `RAILWAY_PROJECT_ID` | ID del proyecto        | En URL del proyecto: `railway.app/project/{PROJECT_ID}`                       |
| `RAILWAY_SERVICE_ID` | ID del servicio        | Click en el servicio → Settings → Service ID                                  |

---

## Variables de Entorno

### Configurar en Railway Dashboard

1. Ve a tu proyecto → Environment → **Variables**
2. Agrega las siguientes variables:

#### Production Environment

```bash
# Server
NODE_ENV=production
PORT=3001
API_URL=https://api.valplas.net

# Database (Supabase)
DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres
DIRECT_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres

# Auth
JWT_SECRET=your-super-secret-key-change-this-in-prod
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
COOKIE_SECRET=another-secret-for-cookies

# Redis (Upstash)
REDIS_URL=redis://default:[PASSWORD]@[HOST]:6379

# Mercado Pago (Producción)
MP_ACCESS_TOKEN=APP-xxx
MP_WEBHOOK_SECRET=your-webhook-secret
MP_NOTIFICATION_URL=https://api.valplas.net/api/payments/webhook

# Supabase Storage
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=xxx

# Email (Resend)
RESEND_API_KEY=re_xxx
EMAIL_FROM=Valplas <no-reply@valplas.net>

# Google Maps
GOOGLE_MAPS_API_KEY=AIzaxxx

# Sentry
SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_ENVIRONMENT=production

# CORS
ALLOWED_ORIGINS=https://valplas.net,https://www.valplas.net
```

#### Staging Environment

Mismos keys, pero con valores de testing:

```bash
NODE_ENV=staging
API_URL=https://valplas-api-staging.up.railway.app

# Mercado Pago (Sandbox)
MP_ACCESS_TOKEN=TEST-xxx
MP_NOTIFICATION_URL=https://valplas-api-staging.up.railway.app/api/payments/webhook

# CORS
ALLOWED_ORIGINS=https://valplas-web-git-*.vercel.app

# Sentry
SENTRY_ENVIRONMENT=staging
```

### Variables desde Railway CLI

También puedes configurar variables desde la CLI:

```bash
railway variables set NODE_ENV=production
railway variables set PORT=3001
```

O en batch desde un archivo `.env.production`:

```bash
railway variables set --from-env-file .env.production
```

**Importante:** Nunca commitees archivos `.env.*` con valores reales.

---

## Configuración de Redis

### Usar Upstash (Recomendado)

1. Ve a [Upstash Console](https://console.upstash.com)
2. Crea una base de datos Redis
3. Copia la URL de conexión: `redis://default:[PASSWORD]@[HOST]:6379`
4. Agrégala como variable en Railway: `REDIS_URL`

### Usar Railway Redis (Alternativa)

Railway también ofrece Redis integrado:

1. En tu proyecto → **New** → **Database** → **Add Redis**
2. Railway genera automáticamente la variable `REDIS_URL`
3. Úsala en tu código:

```typescript
// src/infrastructure/cache/redis.ts
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

export default redis;
```

---

## Health Checks

### Configurar Health Check Endpoint

Crea un endpoint para verificar el estado del API:

```typescript
// src/routes/health.ts
import { Router } from 'express';
import { db } from '@/infrastructure/database/client';
import redis from '@/infrastructure/cache/redis';

const router = Router();

router.get('/health', async (req, res) => {
  try {
    // Verificar conexión a DB
    await db.raw('SELECT 1');

    // Verificar conexión a Redis (opcional)
    await redis.ping();

    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      services: {
        database: 'connected',
        redis: 'connected'
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      message: 'Service unavailable',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
```

Registra en tu `server.ts`:

```typescript
import healthRouter from './routes/health';

app.use('/api', healthRouter);
```

### Configurar Health Check en Railway

1. Ve a Settings → Deploy → **Health Check**
2. Configura:
   - **Path**: `/api/health`
   - **Port**: `3001`
   - **Interval**: `30s`
   - **Timeout**: `10s`
   - **Retries**: `3`

Railway reiniciará el servicio automáticamente si falla el health check.

---

## Dominios Personalizados

### Configurar Dominio en Railway

1. Ve a tu proyecto → **Settings** → **Networking**
2. Click en **Generate Domain** para obtener dominio Railway:
   ```
   valplas-api-production.up.railway.app
   ```
3. Para dominio custom (`api.valplas.net`):
   - Click en **Custom Domain**
   - Ingresa: `api.valplas.net`
   - Railway te dará un registro CNAME:
     ```
     CNAME   api   valplas-api-production.up.railway.app
     ```
4. Agrega este registro en Cloudflare (tu DNS provider)
5. Espera propagación (usualmente < 10 minutos)

---

## Migraciones de Base de Datos

### Ejecutar Migraciones en Deploy

Opción 1: **Deploy Hook** (recomendado)

Configura un hook en Railway para ejecutar migraciones automáticamente:

```json
// apps/api/railway.json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm run db:migrate && npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

Opción 2: **Manualmente desde CLI**

```bash
railway run npm run db:migrate
```

Opción 3: **GitHub Actions** (antes del deploy)

En el workflow de deploy, ejecuta migraciones antes de desplegar:

```yaml
- name: Run migrations
  run: |
    bun --filter @valplas/api db:migrate
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

---

## Workflow de GitHub Actions

Crea/actualiza `.github/workflows/deploy-production.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy-api:
    name: Deploy API to Railway
    runs-on: ubuntu-latest
    environment: production

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Type check
        working-directory: apps/api
        run: bun run typecheck

      - name: Lint
        working-directory: apps/api
        run: bun run lint

      - name: Run tests
        working-directory: apps/api
        run: bun test
        env:
          NODE_ENV: test
          DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}

      - name: Build API
        working-directory: apps/api
        run: bun run build

      - name: Install Railway CLI
        run: npm install -g @railway/cli

      - name: Deploy to Railway
        run: railway up --service ${{ secrets.RAILWAY_SERVICE_ID }}
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}

      - name: Run migrations
        run: railway run --service ${{ secrets.RAILWAY_SERVICE_ID }} npm run db:migrate
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}

      - name: Health check
        run: |
          sleep 10
          curl -f https://api.valplas.net/api/health || exit 1

      - name: Notify success
        if: success()
        run: echo "✅ API deployed successfully to production"

      - name: Notify failure
        if: failure()
        run: echo "❌ API deployment failed"
```

---

## Monitoreo y Logs

### Ver Logs en Tiempo Real

```bash
railway logs --follow
```

O filtra por servicio:

```bash
railway logs --service api
```

### Logs en Dashboard

Ve a tu proyecto en Railway → **Deployments** → Click en el deployment → **Logs**

### Integrar con Sentry

Ver [SENTRY_INTEGRATION.md](./SENTRY_INTEGRATION.md) para configurar monitoreo avanzado.

---

## Troubleshooting

### Error: "Port already in use"

**Causa**: Railway asigna dinámicamente el puerto a través de la variable `PORT`.

**Solución**: Asegúrate de usar `process.env.PORT`:

```typescript
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

---

### Error: "Cannot find module 'xxx'"

**Causa**: Dependencias no instaladas correctamente en producción.

**Solución**:

1. Verifica que la dependencia esté en `dependencies`, no `devDependencies`
2. Limpia cache de Railway:
   ```bash
   railway down
   railway up --detach
   ```

---

### Error: "Database connection failed"

**Causa**: Variable `DATABASE_URL` incorrecta o conexión bloqueada.

**Solución**:

1. Verifica que `DATABASE_URL` esté configurada en Railway
2. Verifica que Supabase permita conexiones externas (IPv4/IPv6)
3. Test de conexión:
   ```bash
   railway run node -e "require('pg').Pool({connectionString:process.env.DATABASE_URL}).query('SELECT 1')"
   ```

---

### Build Timeout

**Causa**: Build muy lento (>10 minutos).

**Solución**:

1. Usa cache de dependencias (Railway lo hace automáticamente)
2. Reduce dependencias innecesarias
3. Incrementa timeout en Railway Settings:
   - **Build** → **Timeout**: `20m`

---

### Health Check Fails After Deploy

**Causa**: El servidor tarda en iniciar o el endpoint no responde.

**Solución**:

1. Incrementa el timeout del health check a `20s`
2. Agrega retry logic en el endpoint
3. Verifica logs: `railway logs`

---

## Scaling (Futuro)

Railway permite escalar horizontalmente:

1. Ve a Settings → **Scaling**
2. Configura:
   - **Instances**: 1-10 (según plan)
   - **Memory**: 512MB - 8GB
   - **CPU**: 1-8 vCPUs

Para Valplas, el plan Hobby ($5/mes) es suficiente para MVP.

---

## Costos Estimados

| Servicio        | Costo Mensual               |
| --------------- | --------------------------- |
| Railway Hobby   | $5/mes (500h/mes incluidas) |
| Redis (Upstash) | $0 (free tier) o $10 (pro)  |
| **Total**       | **$5-15/mes**               |

---

## Checklist de Deploy

Antes de hacer deploy a producción:

- [ ] Variables de entorno configuradas en Railway
- [ ] Database migrada (Supabase)
- [ ] Redis configurado (Upstash)
- [ ] Health check endpoint funcionando
- [ ] Dominio custom configurado (`api.valplas.net`)
- [ ] CORS configurado con dominios correctos
- [ ] Sentry configurado (ver [SENTRY_INTEGRATION.md](./SENTRY_INTEGRATION.md))
- [ ] Tests pasando (`bun test`)
- [ ] Build exitoso localmente (`bun run build`)
- [ ] Logs monitoreados en Dashboard

---

## Recursos Adicionales

- [Railway Documentation](https://docs.railway.app)
- [Railway CLI Reference](https://docs.railway.app/develop/cli)
- [Railway + Node.js Guide](https://docs.railway.app/guides/nodejs)
- [Railway Environment Variables](https://docs.railway.app/develop/variables)
