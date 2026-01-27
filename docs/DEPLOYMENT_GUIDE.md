# 🚀 Guía Completa de Deployment

Esta es la guía maestra que integra todos los aspectos de deployment para Valplas: Vercel (frontend), Railway (backend), Supabase (database), Sentry (monitoring) y workflows automáticos de CI/CD.

## 📋 Tabla de Contenidos

- [Visión General](#visión-general)
- [Arquitectura de Deployment](#arquitectura-de-deployment)
- [Entornos](#entornos)
- [Setup Inicial](#setup-inicial)
- [Workflows de GitHub Actions](#workflows-de-github-actions)
- [Estrategia de Branching](#estrategia-de-branching)
- [Preview Deployments](#preview-deployments)
- [Variables de Entorno](#variables-de-entorno)
- [Checklist Pre-Deploy](#checklist-pre-deploy)
- [Troubleshooting](#troubleshooting)

---

## Visión General

### Stack de Deployment

| Componente     | Servicio       | Propósito                    |
| -------------- | -------------- | ---------------------------- |
| **Frontend**   | Vercel         | Next.js App (SSR/SSG)        |
| **Backend**    | Railway        | Express API                  |
| **Database**   | Supabase       | PostgreSQL + Storage         |
| **Cache/Jobs** | Upstash        | Redis (cache + BullMQ)       |
| **Monitoring** | Sentry         | Error tracking + Performance |
| **CI/CD**      | GitHub Actions | Automated deployments        |
| **DNS**        | Cloudflare     | Domain management + CDN      |

### Flujo de Deployment

```
┌─────────────────────────────────────────────────────────────────┐
│                         Git Workflow                            │
└─────────────────────────────────────────────────────────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
    feature/*                develop                    main
        │                        │                        │
        ├─ PR → Preview         ├─ Auto Deploy          ├─ Auto Deploy
        │        Deploy          │   to Staging          │   to Production
        │                        │                        │
        ▼                        ▼                        ▼
  Vercel Preview        Railway Staging          Railway Production
  (temp URL)            Vercel Staging           Vercel Production
                        (staging domain)         (valplas.net)
```

---

## Arquitectura de Deployment

### Production

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLOUDFLARE DNS/CDN                        │
└──────────────────────────────────────────────────────────────────┘
         │                                      │
         │                                      │
    valplas.net                           api.valplas.net
         │                                      │
         ▼                                      ▼
┌─────────────────┐                    ┌─────────────────┐
│  VERCEL (Web)   │◄───────────────────┤ RAILWAY (API)   │
│                 │     API Calls      │                 │
│  Next.js App    │                    │  Express Server │
└─────────────────┘                    └─────────────────┘
         │                                      │
         │                                      │
         └──────────────┬───────────────────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │  SUPABASE (DB)      │
              │                     │
              │  PostgreSQL         │
              │  + Storage          │
              └─────────────────────┘
                        │
                        │
              ┌─────────┴─────────┐
              │                   │
              ▼                   ▼
    ┌─────────────────┐  ┌─────────────────┐
    │  UPSTASH REDIS  │  │  SENTRY         │
    │                 │  │                 │
    │  Cache + Jobs   │  │  Monitoring     │
    └─────────────────┘  └─────────────────┘
```

---

## Entornos

### 1. Local Development

```bash
# Frontend
http://localhost:3000

# Backend
http://localhost:3001

# Database
PostgreSQL local (Supabase CLI) - localhost:54322

# Redis
Local (opcional) - localhost:6379
```

### 2. Staging (develop branch)

```bash
# Frontend
https://valplas-web-git-develop.vercel.app

# Backend
https://valplas-api-staging.up.railway.app

# Database
Supabase Staging Project (separado)

# Redis
Upstash Staging DB
```

### 3. Preview (PR branches)

```bash
# Frontend
https://valplas-web-git-feature-name.vercel.app

# Backend
Usa Staging API (no se despliega backend por PR)

# Database
Supabase Staging Project
```

### 4. Production (main branch)

```bash
# Frontend
https://valplas.net
https://www.valplas.net

# Backend
https://api.valplas.net

# Database
Supabase Production Project

# Redis
Upstash Production DB
```

---

## Setup Inicial

### 1. Clonar y Configurar Proyecto

```bash
# Clonar repo
git clone https://github.com/tu-usuario/valplas-tienda.git
cd valplas-tienda

# Instalar dependencias
bun install

# Copiar archivos de ejemplo
cp .env.example .env.local
```

### 2. Configurar Servicios

Sigue estas guías en orden:

1. **[SUPABASE_SETUP.md](./SUPABASE_SETUP.md)** - Configurar base de datos
2. **[RAILWAY_DEPLOY.md](./RAILWAY_DEPLOY.md)** - Configurar backend
3. **[VERCEL_DEPLOY.md](./VERCEL_DEPLOY.md)** - Configurar frontend
4. **[SENTRY_INTEGRATION.md](./SENTRY_INTEGRATION.md)** - Configurar monitoring

### 3. Configurar GitHub Secrets

Ve a tu repositorio → **Settings** → **Secrets and variables** → **Actions**

#### Secrets Requeridos

| Secret                 | Descripción                   | Dónde obtenerlo                                                      |
| ---------------------- | ----------------------------- | -------------------------------------------------------------------- |
| `VERCEL_TOKEN`         | Token de Vercel               | [Vercel Tokens](https://vercel.com/account/tokens)                   |
| `VERCEL_ORG_ID`        | ID de organización            | `.vercel/project.json`                                               |
| `VERCEL_PROJECT_ID`    | ID del proyecto web           | `.vercel/project.json`                                               |
| `RAILWAY_TOKEN`        | Token de Railway              | [Railway Tokens](https://railway.app/account/tokens)                 |
| `RAILWAY_PROJECT_ID`   | ID del proyecto               | URL del proyecto                                                     |
| `RAILWAY_SERVICE_ID`   | ID del servicio API           | Settings del servicio                                                |
| `SENTRY_AUTH_TOKEN`    | Token de Sentry               | [Sentry Tokens](https://sentry.io/settings/account/api/auth-tokens/) |
| `DATABASE_URL`         | Connection string de Supabase | Supabase Dashboard                                                   |
| `SUPABASE_SERVICE_KEY` | Service role key              | Supabase Dashboard                                                   |

#### Variables de Entorno (Environments)

Configura variables para cada entorno (production, staging):

**Production:**

```bash
PROD_API_URL=https://api.valplas.net
MP_PUBLIC_KEY=APP-xxx (producción)
MP_ACCESS_TOKEN=APP-xxx (producción)
JWT_SECRET=xxx
```

**Staging:**

```bash
STAGING_API_URL=https://valplas-api-staging.up.railway.app
MP_PUBLIC_KEY_TEST=TEST-xxx (sandbox)
MP_ACCESS_TOKEN_TEST=TEST-xxx (sandbox)
JWT_SECRET=xxx
```

---

## Workflows de GitHub Actions

### Estructura de Workflows

```
.github/
└── workflows/
    ├── ci.yml                    # Tests y linting en cada PR
    ├── deploy-preview.yml        # Preview deployment para PRs
    ├── deploy-staging.yml        # Deploy a staging (develop)
    ├── deploy-production.yml     # Deploy a producción (main)
    └── tests.yml                 # Tests específicos
```

### 1. CI Workflow (`ci.yml`)

Se ejecuta en **cada push y PR** para validar el código:

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  lint-and-typecheck:
    name: Lint and Type Check
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Lint
        run: bun run lint

      - name: Type check
        run: |
          bun --filter @valplas/api typecheck
          bun --filter @valplas/web typecheck

  test:
    name: Run Tests
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Run tests
        run: bun test
        env:
          NODE_ENV: test
```

### 2. Preview Deployment (`deploy-preview.yml`)

Se ejecuta cuando abres o actualizas un **PR**:

```yaml
name: Deploy Preview

on:
  pull_request:
    branches: [main, develop]
    types: [opened, synchronize, reopened]

jobs:
  deploy-preview:
    name: Deploy Preview to Vercel
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Build frontend
        working-directory: apps/web
        run: bun run build
        env:
          NEXT_PUBLIC_API_URL: ${{ secrets.STAGING_API_URL }}
          NEXT_PUBLIC_MP_PUBLIC_KEY: ${{ secrets.MP_PUBLIC_KEY_TEST }}
          NEXT_PUBLIC_SENTRY_DSN: ${{ secrets.SENTRY_DSN }}
          NEXT_PUBLIC_SENTRY_ENVIRONMENT: preview

      - name: Deploy to Vercel Preview
        id: deploy
        working-directory: apps/web
        run: |
          npm install -g vercel
          URL=$(vercel deploy --token=${{ secrets.VERCEL_TOKEN }} --scope=${{ secrets.VERCEL_ORG_ID }} 2>&1 | grep -o 'https://[^ ]*')
          echo "url=$URL" >> $GITHUB_OUTPUT

      - name: Comment PR with preview URL
        uses: actions/github-script@v7
        with:
          script: |
            const url = '${{ steps.deploy.outputs.url }}';
            const body = `## 🚀 Preview Deployment Ready!

            **Preview URL:** ${url}

            ✅ Revisa los cambios antes de hacer merge.

            ### Testing Checklist
            - [ ] UI/UX funciona correctamente
            - [ ] No hay errores en consola
            - [ ] Performance aceptable (Lighthouse)
            - [ ] Mobile responsive
            `;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: body
            });
```

### 3. Deploy to Staging (`deploy-staging.yml`)

Se ejecuta automáticamente en push a **develop**:

```yaml
name: Deploy to Staging

on:
  push:
    branches: [develop]
  workflow_dispatch:

jobs:
  deploy-api-staging:
    name: Deploy API to Railway Staging
    runs-on: ubuntu-latest
    environment: staging

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Run tests
        working-directory: apps/api
        run: bun test
        env:
          NODE_ENV: test

      - name: Build API
        working-directory: apps/api
        run: bun run build

      - name: Install Railway CLI
        run: npm install -g @railway/cli

      - name: Deploy to Railway
        run: railway up --service ${{ secrets.RAILWAY_SERVICE_ID_STAGING }} --environment staging
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}

      - name: Run migrations
        run: railway run --service ${{ secrets.RAILWAY_SERVICE_ID_STAGING }} bun db:migrate
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}

  deploy-web-staging:
    name: Deploy Web to Vercel Staging
    runs-on: ubuntu-latest
    environment: staging
    needs: deploy-api-staging

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Deploy to Vercel
        working-directory: apps/web
        run: |
          npm install -g vercel
          vercel deploy --token=${{ secrets.VERCEL_TOKEN }} --scope=${{ secrets.VERCEL_ORG_ID }}
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
```

### 4. Deploy to Production (`deploy-production.yml`)

Se ejecuta automáticamente en push a **main**:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy-api-production:
    name: Deploy API to Railway Production
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

      - name: Build API
        working-directory: apps/api
        run: bun run build

      - name: Install Railway CLI
        run: npm install -g @railway/cli

      - name: Deploy to Railway
        run: railway up --service ${{ secrets.RAILWAY_SERVICE_ID }} --environment production
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}

      - name: Run migrations
        run: railway run --service ${{ secrets.RAILWAY_SERVICE_ID }} bun db:migrate
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}

      - name: Health check
        run: |
          sleep 15
          curl -f https://api.valplas.net/api/health || exit 1

      - name: Create Sentry release
        uses: getsentry/action-release@v1
        env:
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
          SENTRY_ORG: valplas
          SENTRY_PROJECT: valplas-api
        with:
          environment: production
          version: ${{ github.sha }}

  deploy-web-production:
    name: Deploy Web to Vercel Production
    runs-on: ubuntu-latest
    environment: production
    needs: deploy-api-production

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Type check
        working-directory: apps/web
        run: bun run typecheck

      - name: Lint
        working-directory: apps/web
        run: bun run lint

      - name: Deploy to Vercel Production
        working-directory: apps/web
        run: |
          npm install -g vercel
          vercel deploy --prod --token=${{ secrets.VERCEL_TOKEN }} --scope=${{ secrets.VERCEL_ORG_ID }}
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

      - name: Create Sentry release
        uses: getsentry/action-release@v1
        env:
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
          SENTRY_ORG: valplas
          SENTRY_PROJECT: valplas-web
        with:
          environment: production
          version: ${{ github.sha }}

      - name: Health check
        run: |
          sleep 10
          curl -f https://valplas.net || exit 1

  post-deploy:
    name: Post-Deployment Notifications
    runs-on: ubuntu-latest
    needs: [deploy-api-production, deploy-web-production]

    steps:
      - name: Notify success
        if: success()
        run: |
          echo "🎉 Deployment to production completed successfully!"
          echo "Web: https://valplas.net"
          echo "API: https://api.valplas.net"

      - name: Notify failure
        if: failure()
        run: |
          echo "❌ Deployment to production failed!"
          echo "Check logs for details."
```

---

## Estrategia de Branching

### Git Flow Simplificado

```
main            [Production]     ← Solo merges desde develop
  │
  ├─ develop    [Staging]        ← Features se mergean aquí primero
  │    │
  │    ├─ feature/add-cart       ← Nueva funcionalidad
  │    ├─ feature/checkout       ← Otra funcionalidad
  │    ├─ fix/payment-bug        ← Bug fix
  │    └─ hotfix/critical-bug    ← Hotfix urgente
```

### Proceso de Desarrollo

1. **Crear feature branch desde develop**

   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/add-product-filters
   ```

2. **Desarrollar y commitear**

   ```bash
   git add .
   git commit -m "feat: add product filters"
   git push origin feature/add-product-filters
   ```

3. **Crear Pull Request**
   - Base: `develop`
   - Compare: `feature/add-product-filters`
   - Esto trigger automáticamente un **Preview Deployment**

4. **Review y Test**
   - Revisa el preview deployment en la URL del PR
   - Código review por otro dev
   - Tests automáticos pasan

5. **Merge a develop**
   - Merge el PR → Deploy automático a **Staging**

6. **Test en Staging**
   - QA en staging environment
   - Si hay bugs, crear `fix/*` branches

7. **Merge a main**
   - Crear PR de `develop` a `main`
   - Merge → Deploy automático a **Production**

### Hotfixes

Para bugs críticos en producción:

```bash
git checkout main
git checkout -b hotfix/payment-critical
# Fix bug
git commit -m "fix: critical payment bug"
git push origin hotfix/payment-critical
```

Crear PR a `main` directamente (bypass develop para urgencia).

---

## Preview Deployments

### ¿Qué es un Preview Deployment?

Un preview deployment es un entorno temporal que se crea automáticamente para cada PR, permitiendo:

- ✅ Revisar cambios visualmente antes de merge
- ✅ Testear funcionalidad en un entorno real
- ✅ Compartir con stakeholders para feedback
- ✅ Ejecutar tests E2E en entorno staging

### Ciclo de Vida

```
1. Abres PR               →  Vercel crea preview deployment
2. Haces push al PR       →  Preview se actualiza automáticamente
3. Mergeas/Cierras PR     →  Preview se elimina automáticamente
```

### URL de Preview

```
https://valplas-web-git-{branch-name}-{org}.vercel.app
```

Ejemplo:

```
https://valplas-web-git-feature-add-cart-valplas.vercel.app
```

### Limitaciones

- **Backend:** Los PRs usan el API de **staging**, no se despliega un backend separado por PR
- **Database:** Usa la DB de staging (datos compartidos)
- **Costo:** Vercel permite deployments ilimitados en plan gratuito/pro

---

## Variables de Entorno

### Frontend (Vercel)

Configura en **Vercel Dashboard** → **Settings** → **Environment Variables**

| Variable                         | Production                | Preview/Staging                              |
| -------------------------------- | ------------------------- | -------------------------------------------- |
| `NEXT_PUBLIC_API_URL`            | `https://api.valplas.net` | `https://valplas-api-staging.up.railway.app` |
| `NEXT_PUBLIC_MP_PUBLIC_KEY`      | `APP-xxx`                 | `TEST-xxx`                                   |
| `NEXT_PUBLIC_SENTRY_DSN`         | `https://...`             | `https://...`                                |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | `production`              | `staging` o `preview`                        |
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY`    | `AIzaxxx`                 | `AIzaxxx`                                    |

### Backend (Railway)

Configura en **Railway Dashboard** → **Variables**

| Variable             | Production                | Staging                                      |
| -------------------- | ------------------------- | -------------------------------------------- |
| `NODE_ENV`           | `production`              | `staging`                                    |
| `API_URL`            | `https://api.valplas.net` | `https://valplas-api-staging.up.railway.app` |
| `DATABASE_URL`       | Production DB             | Staging DB                                   |
| `REDIS_URL`          | Production Redis          | Staging Redis                                |
| `MP_ACCESS_TOKEN`    | `APP-xxx`                 | `TEST-xxx`                                   |
| `JWT_SECRET`         | (unique strong secret)    | (different secret)                           |
| `SENTRY_DSN`         | `https://...`             | `https://...`                                |
| `SENTRY_ENVIRONMENT` | `production`              | `staging`                                    |

---

## Checklist Pre-Deploy

### Antes de Deploy a Staging

- [ ] Tests pasan localmente (`bun test`)
- [ ] Lint sin errores (`bun run lint`)
- [ ] TypeScript compila sin errores (`bun run typecheck`)
- [ ] Build exitoso localmente (`bun run build`)
- [ ] Variables de entorno actualizadas en Railway/Vercel
- [ ] Migraciones de DB testeadas localmente

### Antes de Deploy a Production

- [ ] Todos los checks de staging ✅
- [ ] QA completo en staging environment
- [ ] Performance testing (Lighthouse score > 90)
- [ ] Security audit (no secrets en código)
- [ ] Database backup reciente (< 24h)
- [ ] Rollback plan definido
- [ ] Stakeholders notificados del deploy
- [ ] Sentry configurado y funcionando
- [ ] Health checks configurados
- [ ] Load testing (si es un cambio grande)

---

## Rollback Strategy

### Frontend (Vercel)

Vercel mantiene historial de deployments:

1. Ve a **Vercel Dashboard** → **Deployments**
2. Encuentra el deployment anterior estable
3. Click en **"Promote to Production"**
4. Rollback instantáneo (< 1 minuto)

### Backend (Railway)

Opción 1: **Revert commit y redeploy**

```bash
git revert HEAD
git push origin main
# Trigger auto-deploy con commit revertido
```

Opción 2: **Rollback manual en Railway**

```bash
railway rollback --service $SERVICE_ID
```

### Database

Si la migración causó problemas:

```bash
# Crear migración de rollback
supabase migration new rollback_xxx

# Ejecutar rollback
railway run bun db:migrate
```

---

## Monitoreo Post-Deploy

### Verificaciones Automáticas

Los workflows incluyen health checks:

```yaml
- name: Health check API
  run: curl -f https://api.valplas.net/api/health || exit 1

- name: Health check Web
  run: curl -f https://valplas.net || exit 1
```

### Monitoreo Manual

Después de cada deploy, verifica:

1. **Sentry Dashboard**
   - No debe haber spike de errores
   - Performance metrics estables

2. **Railway Logs**

   ```bash
   railway logs --service api --environment production
   ```

3. **Vercel Analytics**
   - Verifica que el sitio carga correctamente
   - No hay errores 500

4. **Supabase Dashboard**
   - CPU/Memory usage normal
   - No hay queries lentos nuevos

---

## Troubleshooting

### Deploy Falla en CI

**Error:** Tests no pasan

**Solución:**

```bash
# Ejecutar tests localmente para reproducir
bun test

# Fix y push
git add .
git commit -m "fix: tests"
git push
```

---

### Preview Deployment No Funciona

**Error:** Preview URL retorna 500

**Solución:**

1. Verifica variables de entorno en Vercel (Preview environment)
2. Verifica que el API de staging esté funcionando
3. Revisa logs en Vercel Dashboard

---

### Deploy a Production Falla

**Error:** Health check fails después de deploy

**Solución:**

1. Revisa logs de Railway: `railway logs`
2. Verifica variables de entorno
3. Si es crítico, haz rollback inmediatamente
4. Debug en staging antes de reintentar

---

### Database Migration Falla

**Error:** Migración falla en producción

**Solución:**

1. **NO PANIC** - Los datos no se pierden
2. Revisa logs de migración: `railway logs`
3. Conecta a la DB directamente: `psql $DATABASE_URL`
4. Aplica rollback migration si es necesario
5. Fix localmente y testea en staging
6. Redeploy con migración corregida

---

## Costos Totales Estimados

| Servicio         | Plan      | Costo Mensual        |
| ---------------- | --------- | -------------------- |
| Vercel           | Hobby     | $0 (o $20 Pro)       |
| Railway          | Hobby     | $5                   |
| Supabase         | Free      | $0 (o $25 Pro)       |
| Upstash Redis    | Free      | $0 (o $10 Pay-as-go) |
| Sentry           | Developer | $0 (o $26 Team)      |
| Cloudflare       | Free      | $0                   |
| **TOTAL MVP**    |           | **$5-15/mes**        |
| **TOTAL Scaled** |           | **$80-100/mes**      |

---

## Próximos Pasos

Una vez que todo esté configurado:

1. **Testear el flujo completo**
   - Crear feature branch
   - Hacer PR → Verificar preview deployment
   - Merge a develop → Verificar staging deployment
   - Merge a main → Verificar production deployment

2. **Configurar alertas**
   - Sentry alerts para error spikes
   - Railway alerts para CPU/Memory
   - Uptime monitoring (UptimeRobot, Pingdom)

3. **Documentar para el equipo**
   - Compartir esta guía con el equipo
   - Crear runbook para incidentes
   - Documentar rollback procedures

---

## Recursos

- [Vercel Deploy Guide](./VERCEL_DEPLOY.md)
- [Railway Deploy Guide](./RAILWAY_DEPLOY.md)
- [Supabase Setup Guide](./SUPABASE_SETUP.md)
- [Sentry Integration Guide](./SENTRY_INTEGRATION.md)

---

**¡Listo para deployment! 🚀**
