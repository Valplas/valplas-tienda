# 🚀 Deploy Frontend en Vercel

Esta guía cubre el deployment del frontend Next.js en Vercel, incluyendo configuración manual, automática y preview deployments para PRs.

## 📋 Tabla de Contenidos

- [Pre-requisitos](#pre-requisitos)
- [Configuración Inicial](#configuración-inicial)
- [Deploy Manual](#deploy-manual)
- [Deploy Automático](#deploy-automático)
- [Preview Deployments](#preview-deployments)
- [Variables de Entorno](#variables-de-entorno)
- [Dominios Personalizados](#dominios-personalizados)
- [Troubleshooting](#troubleshooting)

---

## Pre-requisitos

- Cuenta en [Vercel](https://vercel.com)
- Vercel CLI instalado globalmente:
  ```bash
  npm install -g vercel
  # o
  bun add -g vercel
  ```
- Repository en GitHub
- Backend desplegado en Railway (ver [RAILWAY_DEPLOY.md](./RAILWAY_DEPLOY.md))

---

## Configuración Inicial

### 1. Preparar el Proyecto

Asegúrate de que tu `apps/web/package.json` tenga los scripts necesarios:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  }
}
```

### 2. Crear `.vercelignore`

Crea `apps/web/.vercelignore` para excluir archivos innecesarios:

```
# Dependencies
node_modules
.pnp
.pnp.js

# Testing
coverage
*.test.ts
*.test.tsx

# Environment
.env.local
.env*.local

# Debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
bun-debug.log*

# Local
.DS_Store
*.local
```

### 3. Configuración de Next.js

Crea/actualiza `apps/web/next.config.js`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Output standalone para optimizar bundle
  output: 'standalone',

  // Permitir imágenes de Supabase
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/**'
      }
    ]
  },

  // Headers de seguridad
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          }
        ]
      }
    ];
  },

  // Configuración específica de Vercel
  ...(process.env.VERCEL === '1' && {
    experimental: {
      serverActions: {
        bodySizeLimit: '2mb'
      }
    }
  })
};

module.exports = nextConfig;
```

---

## Deploy Manual

### Paso 1: Login en Vercel

```bash
vercel login
```

### Paso 2: Link del Proyecto

Desde la raíz del proyecto:

```bash
cd apps/web
vercel link
```

Selecciona:

- **Scope**: Tu cuenta u organización
- **Link to existing project?**: No (primera vez) o Yes (si ya existe)
- **Project name**: `valplas-web` (o el que prefieras)

Esto creará un directorio `.vercel/` con los IDs del proyecto.

### Paso 3: Deploy a Preview

```bash
vercel
```

Esto desplegará a un entorno de preview y te dará una URL temporal.

### Paso 4: Deploy a Production

```bash
vercel --prod
```

Esto desplegará a producción (dominio principal).

---

## Deploy Automático

### Configurar Secrets en GitHub

Ve a tu repositorio en GitHub → **Settings** → **Secrets and variables** → **Actions** y agrega:

| Secret              | Descripción            | Cómo obtenerlo                                                              |
| ------------------- | ---------------------- | --------------------------------------------------------------------------- |
| `VERCEL_TOKEN`      | Token de autenticación | [Vercel Account Settings](https://vercel.com/account/tokens) → Create Token |
| `VERCEL_ORG_ID`     | ID de tu organización  | En `.vercel/project.json` (key `orgId`)                                     |
| `VERCEL_PROJECT_ID` | ID del proyecto        | En `.vercel/project.json` (key `projectId`)                                 |

**Importante**: Nunca commitees el directorio `.vercel/`. Está en `.gitignore`.

### Variables de Entorno para Builds

En el dashboard de Vercel:

1. Ve a tu proyecto → **Settings** → **Environment Variables**
2. Agrega las siguientes variables:

#### Production Environment

```bash
NEXT_PUBLIC_API_URL=https://api.valplas.net/api
NEXT_PUBLIC_MP_PUBLIC_KEY=APP-xxx (producción)
NEXT_PUBLIC_GOOGLE_MAPS_KEY=AIzaxxx
NEXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/xxx
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
```

#### Preview/Development Environment

```bash
NEXT_PUBLIC_API_URL=https://valplas-api-staging.up.railway.app/api
NEXT_PUBLIC_MP_PUBLIC_KEY=TEST-xxx (sandbox)
NEXT_PUBLIC_GOOGLE_MAPS_KEY=AIzaxxx
NEXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/xxx
NEXT_PUBLIC_SENTRY_ENVIRONMENT=preview
```

**Nota:** Vercel inyecta estas variables durante el build automáticamente.

---

## Preview Deployments

Los preview deployments se generan automáticamente para cada PR.

### Configuración en Vercel Dashboard

1. Ve a tu proyecto en Vercel → **Settings** → **Git**
2. Asegúrate de que esté habilitado:
   - ✅ **Automatic Deployments** (deploy en cada push)
   - ✅ **Preview Deployments** (deploy para cada PR)
   - ✅ **Production Branch**: `main`
   - ✅ **Deploy Hooks** (opcional para deploys manuales)

### Workflow de GitHub Actions

El workflow en `.github/workflows/deploy-preview.yml` está configurado para:

1. Hacer build del frontend cuando se abre/actualiza un PR
2. Comentar en el PR con el link de preview generado por Vercel

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

      - name: Deploy to Vercel Preview
        id: deploy
        run: |
          cd apps/web
          vercel deploy --token=${{ secrets.VERCEL_TOKEN }} --scope=${{ secrets.VERCEL_ORG_ID }} > deployment-url.txt
          echo "url=$(cat deployment-url.txt)" >> $GITHUB_OUTPUT

      - name: Comment PR with preview URL
        uses: actions/github-script@v7
        with:
          script: |
            const url = '${{ steps.deploy.outputs.url }}';
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `🚀 Preview deployment listo!\n\n🔗 **URL:** ${url}\n\n✅ Revisa los cambios antes de hacer merge.`
            })
```

### Comportamiento de Preview Deployments

- **URL única por PR**: `valplas-web-git-feature-name-your-org.vercel.app`
- **Actualización automática**: Cada push actualiza el preview
- **Persistencia**: La URL permanece hasta cerrar/mergear el PR
- **Variables de entorno**: Usa las del entorno Preview configurado en Vercel

---

## Variables de Entorno

### Organización Recomendada

| Entorno         | Branch      | Variables                           |
| --------------- | ----------- | ----------------------------------- |
| **Production**  | `main`      | Producción real (API prod, MP prod) |
| **Preview**     | PR branches | Staging (API staging, MP test)      |
| **Development** | Local       | Variables locales (`.env.local`)    |

### Crear `.env.local` para desarrollo local

```bash
# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_MP_PUBLIC_KEY=TEST-xxx
NEXT_PUBLIC_GOOGLE_MAPS_KEY=AIzaxxx
NEXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/xxx
NEXT_PUBLIC_SENTRY_ENVIRONMENT=development
```

**Nunca commitees este archivo**. Está en `.gitignore`.

---

## Dominios Personalizados

### Configurar Dominio Principal

1. Ve a tu proyecto en Vercel → **Settings** → **Domains**
2. Agrega tu dominio: `valplas.net` y `www.valplas.net`
3. Vercel te dará registros DNS para configurar:

```
Type    Name    Value
────────────────────────────────────────────────
CNAME   www     cname.vercel-dns.com
A       @       76.76.21.21
```

4. Agrega estos registros en tu proveedor DNS (Cloudflare)
5. Espera propagación (puede tomar hasta 48h, usualmente < 1h)

### Configurar Subdominios para Staging

Si quieres un subdominio para staging/preview permanente:

```
staging.valplas.net → vercel preview deployment
```

1. Agrega el subdominio en Vercel
2. Configura CNAME en Cloudflare:
   ```
   CNAME   staging   cname.vercel-dns.com
   ```

---

## Configuración de Build

### Build Settings en Vercel Dashboard

| Setting              | Valor           |
| -------------------- | --------------- |
| **Framework Preset** | Next.js         |
| **Root Directory**   | `apps/web`      |
| **Build Command**    | `bun run build` |
| **Output Directory** | `.next`         |
| **Install Command**  | `bun install`   |
| **Node Version**     | 20.x            |

### Override de Build Command (monorepo)

Si usas monorepo, puedes necesitar instalar dependencias desde la raíz:

```bash
# Build Command
cd ../.. && bun install && cd apps/web && bun run build
```

O mejor, usa `vercel.json` en la raíz del proyecto:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "apps/web/package.json",
      "use": "@vercel/next",
      "config": {
        "zeroConfig": true
      }
    }
  ]
}
```

---

## Monitoreo y Performance

### Vercel Analytics

Habilita Vercel Analytics para métricas de performance:

1. Ve a tu proyecto → **Analytics**
2. Habilita **Web Analytics** (gratuito)
3. Agrega el script en `apps/web/app/layout.tsx`:

```tsx
import { Analytics } from '@vercel/analytics/react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
```

### Speed Insights

Para Core Web Vitals:

```bash
bun add @vercel/speed-insights
```

```tsx
import { SpeedInsights } from '@vercel/speed-insights/next';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
```

---

## Troubleshooting

### Error: Build fails con "Module not found"

**Causa**: Dependencias no instaladas correctamente en monorepo.

**Solución**:

```bash
# Limpiar y reinstalar
rm -rf node_modules bun.lockb
bun install
```

En Vercel, asegúrate de que el **Install Command** sea desde la raíz:

```bash
cd ../.. && bun install
```

---

### Error: "NEXT_PUBLIC_API_URL is undefined"

**Causa**: Variables de entorno no configuradas en Vercel.

**Solución**:

1. Ve a Vercel Dashboard → Settings → Environment Variables
2. Asegúrate de que `NEXT_PUBLIC_API_URL` esté configurada
3. Redeploy: `vercel --prod` o push a `main`

**Importante**: Variables `NEXT_PUBLIC_*` deben estar disponibles en **build time**, no runtime.

---

### Error: "Too Many Requests" en Preview Deployments

**Causa**: Rate limit de Vercel en plan gratuito (100 deployments/día).

**Solución**:

- Limita los preview deployments a branches específicos
- Usa `vercel.json` para ignorar ciertos paths:

```json
{
  "github": {
    "silent": true,
    "autoJobCancelation": true
  }
}
```

---

### Build Time Optimization

Si el build es muy lento:

1. **Reduce dependencias**:

   ```bash
   bun run build --profile
   ```

2. **Cache de build**:
   Vercel cachea automáticamente, pero puedes optimizar con:

   ```javascript
   // next.config.js
   module.exports = {
     experimental: {
       optimizePackageImports: ['lucide-react', '@radix-ui']
     }
   };
   ```

3. **Lazy imports**:
   ```tsx
   const Chart = dynamic(() => import('@/components/Chart'), { ssr: false });
   ```

---

## Checklist de Deploy

Antes de hacer deploy a producción, verifica:

- [ ] Variables de entorno configuradas en Vercel
- [ ] Backend desplegado y funcionando
- [ ] Dominio configurado y propagado
- [ ] HTTPS habilitado (automático en Vercel)
- [ ] Analytics habilitado
- [ ] Sentry configurado (ver [SENTRY_INTEGRATION.md](./SENTRY_INTEGRATION.md))
- [ ] Tests pasando (`bun test`)
- [ ] Build exitoso localmente (`bun run build`)
- [ ] Lighthouse score > 90 en todas las métricas

---

## Recursos Adicionales

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Deployment](https://nextjs.org/docs/app/building-your-application/deploying)
- [Vercel CLI Reference](https://vercel.com/docs/cli)
- [Environment Variables in Vercel](https://vercel.com/docs/concepts/projects/environment-variables)
