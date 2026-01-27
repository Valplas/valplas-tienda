# 🔍 Integración de Sentry

Esta guía cubre la configuración completa de Sentry para monitoreo de errores, performance tracking y alertas en tiempo real para Valplas.

## 📋 Tabla de Contenidos

- [Pre-requisitos](#pre-requisitos)
- [Configuración de Proyecto](#configuración-de-proyecto)
- [Integración en Backend](#integración-en-backend)
- [Integración en Frontend](#integración-en-frontend)
- [Source Maps](#source-maps)
- [Performance Monitoring](#performance-monitoring)
- [Alertas y Notificaciones](#alertas-y-notificaciones)
- [Releases y Deploy Tracking](#releases-y-deploy-tracking)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Pre-requisitos

- Cuenta en [Sentry](https://sentry.io)
- Sentry CLI instalado (para source maps):
  ```bash
  npm install -g @sentry/cli
  # o
  bun add -g @sentry/cli
  ```

---

## Configuración de Proyecto

### Paso 1: Crear Organización y Proyectos

1. Ve a [Sentry Dashboard](https://sentry.io)
2. Crea una organización: `valplas`
3. Crea dos proyectos:
   - **valplas-api** (Node.js/Express)
   - **valplas-web** (Next.js)

### Paso 2: Obtener DSN

Para cada proyecto, obtén el **DSN** (Data Source Name):

1. Ve a **Settings** → **Projects** → `valplas-api`
2. Click en **Client Keys (DSN)**
3. Copia el DSN: `https://[KEY]@[ORG].ingest.sentry.io/[PROJECT_ID]`

Haz lo mismo para `valplas-web`.

### Paso 3: Configurar Auth Token

Para subir source maps, necesitas un auth token:

1. Ve a **Settings** → **Auth Tokens**
2. Click en **Create New Token**
3. Configura:
   - **Name**: `valplas-ci`
   - **Scopes**: `project:releases`, `project:write`
   - **Projects**: `valplas-api`, `valplas-web`
4. Copia el token (lo usarás en GitHub Actions)

---

## Integración en Backend

### Instalación

```bash
cd apps/api
bun add @sentry/node @sentry/profiling-node
```

### Configuración en Express

Crea `apps/api/src/config/sentry.ts`:

```typescript
import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

export function initSentry() {
  if (!process.env.SENTRY_DSN) {
    console.warn('⚠️ Sentry DSN not configured. Error tracking disabled.');
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',

    // Release tracking
    release: process.env.SENTRY_RELEASE || 'unknown',

    // Sample rate (1.0 = 100% de errores)
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Performance monitoring
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    integrations: [
      // Performance profiling
      nodeProfilingIntegration(),

      // HTTP instrumentation
      new Sentry.Integrations.Http({ tracing: true }),

      // Express instrumentation
      new Sentry.Integrations.Express({ app: true })
    ],

    // Filtrar información sensible
    beforeSend(event, hint) {
      // Remover datos sensibles de headers
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }

      // Remover datos sensibles del body
      if (event.request?.data) {
        const data = event.request.data as any;
        if (data.password) data.password = '[FILTERED]';
        if (data.token) data.token = '[FILTERED]';
      }

      return event;
    },

    // Ignorar errores esperados
    ignoreErrors: ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'UnauthorizedError']
  });
}
```

### Integrar en Express App

Actualiza `apps/api/src/server.ts`:

```typescript
import express from 'express';
import * as Sentry from '@sentry/node';
import { initSentry } from './config/sentry';

// IMPORTANTE: Inicializar Sentry ANTES de cualquier otra cosa
initSentry();

const app = express();

// Sentry request handler (DEBE ser el primer middleware)
app.use(Sentry.Handlers.requestHandler());

// Sentry tracing middleware (después de requestHandler)
app.use(Sentry.Handlers.tracingHandler());

// ... Resto de middlewares (body-parser, cors, etc.)
app.use(express.json());

// ... Rutas
app.use('/api', routes);

// Sentry error handler (DEBE ser DESPUÉS de las rutas, ANTES de error handlers)
app.use(Sentry.Handlers.errorHandler());

// Error handler personalizado (después de Sentry)
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
    }
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
```

### Capturar Errores Manualmente

```typescript
// En cualquier parte del código
import * as Sentry from '@sentry/node';

try {
  // Código que puede fallar
  await someAsyncOperation();
} catch (error) {
  // Capturar error con contexto adicional
  Sentry.captureException(error, {
    tags: {
      operation: 'payment_processing',
      user_id: userId
    },
    extra: {
      orderId: order.id,
      amount: order.total
    }
  });

  throw error; // Re-throw si es necesario
}
```

### Breadcrumbs (trazas de actividad)

```typescript
Sentry.addBreadcrumb({
  category: 'payment',
  message: 'Payment preference created',
  level: 'info',
  data: {
    preferenceId: preference.id,
    amount: preference.transaction_amount
  }
});
```

---

## Integración en Frontend

### Instalación

```bash
cd apps/web
bun add @sentry/nextjs
```

### Configuración con Wizard

```bash
npx @sentry/wizard@latest -i nextjs
```

Esto creará automáticamente:

- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`
- `next.config.js` con integración de Sentry

### Configuración Manual

Si prefieres configurar manualmente:

#### 1. `apps/web/sentry.client.config.ts`

```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || 'development',

  // Release tracking
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,

  // Sample rates
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  replaysSessionSampleRate: 0.1, // 10% de sesiones normales
  replaysOnErrorSampleRate: 1.0, // 100% de sesiones con errores

  integrations: [
    // Session replay (grabar sesiones con errores)
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true
    }),

    // Browser profiling
    Sentry.browserProfilingIntegration()
  ],

  // Filtrar información sensible
  beforeSend(event, hint) {
    // Remover datos sensibles
    if (event.request?.data) {
      const data = event.request.data as any;
      if (data.password) data.password = '[FILTERED]';
      if (data.email) data.email = '[FILTERED]';
    }

    return event;
  },

  // Ignorar errores conocidos
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'Non-Error promise rejection captured',
    /Extension context invalidated/i
  ]
});
```

#### 2. `apps/web/sentry.server.config.ts`

```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || 'development',
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Server-side specific config
  integrations: [
    // Database query tracking (si usas Prisma)
    // new Sentry.Integrations.Prisma({ client: prisma }),
  ]
});
```

#### 3. `apps/web/next.config.js`

```javascript
const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Tu configuración de Next.js aquí
};

// Wrap con Sentry config
module.exports = withSentryConfig(
  nextConfig,
  {
    // Opciones de Sentry Webpack Plugin
    silent: true, // Suprime logs de Sentry durante build
    org: 'valplas',
    project: 'valplas-web',
    authToken: process.env.SENTRY_AUTH_TOKEN
  },
  {
    // Opciones de upload de source maps
    widenClientFileUpload: true,
    transpileClientSDK: true,
    tunnelRoute: '/monitoring',
    hideSourceMaps: true,
    disableLogger: true
  }
);
```

### Usar en Componentes

```tsx
'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function MyComponent() {
  useEffect(() => {
    // Capturar errores manualmente
    try {
      // Código que puede fallar
    } catch (error) {
      Sentry.captureException(error, {
        tags: { component: 'MyComponent' }
      });
    }
  }, []);

  return <div>My Component</div>;
}
```

### Error Boundary

Crea un error boundary personalizado:

```tsx
// apps/web/src/components/ErrorBoundary.tsx
'use client';

import * as Sentry from '@sentry/nextjs';
import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack
        }
      }
    });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || <div>Algo salió mal. Intenta recargar la página.</div>;
    }

    return this.props.children;
  }
}
```

Úsalo en el layout:

```tsx
// apps/web/src/app/layout.tsx
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}
```

---

## Source Maps

Los source maps permiten ver el código original en los errores de Sentry (en lugar de código minificado).

### Configuración Automática (Next.js)

Si usaste `withSentryConfig`, los source maps se suben automáticamente en cada build.

Asegúrate de configurar variables de entorno:

```bash
# .env.local
SENTRY_AUTH_TOKEN=your-auth-token
SENTRY_ORG=valplas
SENTRY_PROJECT=valplas-web
```

### Configuración Manual (Backend)

Para el backend (Express), usa Sentry CLI:

```bash
# Después de compilar TypeScript
tsc

# Subir source maps
sentry-cli sourcemaps upload \
  --org valplas \
  --project valplas-api \
  --release $SENTRY_RELEASE \
  ./dist
```

Integra en el script de build:

```json
// apps/api/package.json
{
  "scripts": {
    "build": "tsc && npm run sentry:sourcemaps",
    "sentry:sourcemaps": "sentry-cli sourcemaps upload --org valplas --project valplas-api --release $SENTRY_RELEASE ./dist"
  }
}
```

---

## Performance Monitoring

### Backend: Transaction Tracking

```typescript
import * as Sentry from '@sentry/node';

export async function getProducts(req: Request, res: Response) {
  // Crear transaction
  const transaction = Sentry.startTransaction({
    op: 'http.server',
    name: 'GET /api/products'
  });

  Sentry.getCurrentHub().configureScope((scope) => {
    scope.setSpan(transaction);
  });

  try {
    // Span para query de DB
    const spanDb = transaction.startChild({
      op: 'db.query',
      description: 'Fetch products from database'
    });
    const products = await db.products.findAll();
    spanDb.finish();

    // Span para cache
    const spanCache = transaction.startChild({
      op: 'cache.set',
      description: 'Cache products'
    });
    await cache.set('products', products);
    spanCache.finish();

    res.json({ success: true, data: products });
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({ success: false, error: 'Internal error' });
  } finally {
    transaction.finish();
  }
}
```

### Frontend: Automatic Performance Tracking

Next.js con Sentry trackea automáticamente:

- Page loads
- Route changes
- API calls (fetch)

Para tracking manual:

```typescript
import * as Sentry from '@sentry/nextjs';

async function loadData() {
  const transaction = Sentry.startTransaction({
    name: 'Load Product Data',
    op: 'function'
  });

  try {
    const span1 = transaction.startChild({ op: 'http', description: 'Fetch product' });
    const product = await fetch('/api/products/123');
    span1.finish();

    const span2 = transaction.startChild({ op: 'http', description: 'Fetch reviews' });
    const reviews = await fetch('/api/reviews?product=123');
    span2.finish();

    return { product, reviews };
  } finally {
    transaction.finish();
  }
}
```

---

## Alertas y Notificaciones

### Configurar Alerts

1. Ve a **Alerts** → **Create Alert**
2. Configura reglas:

#### Alert: Error Rate Spike

```
Conditions:
- When error rate is above 10% for 5 minutes
- In project: valplas-api
- Environment: production

Actions:
- Send email to: dev@valplas.net
- Send Slack notification to: #alerts
```

#### Alert: Performance Degradation

```
Conditions:
- When p95 response time is above 1000ms for 10 minutes
- In project: valplas-web
- Environment: production

Actions:
- Send email to: dev@valplas.net
```

### Integración con Slack

1. Ve a **Settings** → **Integrations** → **Slack**
2. Click en **Add Workspace**
3. Autoriza la app de Sentry en tu workspace
4. Configura el canal: `#sentry-alerts`

---

## Releases y Deploy Tracking

### Crear Release en Deploy

Agrega a tu workflow de GitHub Actions:

```yaml
# .github/workflows/deploy-production.yml
- name: Create Sentry release
  uses: getsentry/action-release@v1
  env:
    SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
    SENTRY_ORG: valplas
    SENTRY_PROJECT: valplas-web
  with:
    environment: production
    version: ${{ github.sha }}
```

O manualmente con Sentry CLI:

```bash
export SENTRY_RELEASE=$(git rev-parse HEAD)

# Crear release
sentry-cli releases new $SENTRY_RELEASE

# Asociar commits
sentry-cli releases set-commits $SENTRY_RELEASE --auto

# Marcar como deployed
sentry-cli releases finalize $SENTRY_RELEASE

# Crear deploy
sentry-cli releases deploys $SENTRY_RELEASE new -e production
```

---

## Best Practices

### 1. **Contexto Rico en Errores**

```typescript
Sentry.captureException(error, {
  tags: {
    operation: 'checkout',
    payment_method: 'mercadopago'
  },
  extra: {
    userId: user.id,
    orderId: order.id,
    orderTotal: order.total
  },
  user: {
    id: user.id,
    email: user.email
  }
});
```

### 2. **Filtrar Información Sensible**

Nunca envíes:

- Passwords
- Tokens de autenticación
- Datos de tarjetas de crédito
- Información personal identificable (PII)

### 3. **Sample Rate Apropiado**

```typescript
// Producción: sample 10% de transactions (reduce costos)
tracesSampleRate: 0.1,

// Development: sample 100% (debug completo)
tracesSampleRate: 1.0,
```

### 4. **Agrupar Errores**

Usa `fingerprint` para agrupar errores relacionados:

```typescript
Sentry.captureException(error, {
  fingerprint: ['payment-error', paymentMethod, errorCode]
});
```

### 5. **Ignorar Errores Esperados**

```typescript
ignoreErrors: [
  'NetworkError',
  'AbortError',
  /timeout of \d+ms exceeded/i,
],
```

---

## Troubleshooting

### Errores No Aparecen en Sentry

1. Verifica que `SENTRY_DSN` esté configurado
2. Verifica que no estés en modo development (puede estar silenciado)
3. Revisa el sample rate (puede estar filtrando)
4. Verifica que el error no esté en `ignoreErrors`

### Source Maps No Funcionan

1. Verifica que `SENTRY_AUTH_TOKEN` esté configurado
2. Verifica que el release sea el mismo en código y en Sentry
3. Asegúrate de subir source maps DESPUÉS de compilar
4. Verifica que `hideSourceMaps: true` esté configurado

### Performance Tracking No Funciona

1. Verifica `tracesSampleRate > 0`
2. Verifica que los middlewares de Sentry estén en el orden correcto
3. En Next.js, verifica que `withSentryConfig` esté aplicado

---

## Costos Estimados

| Plan      | Errores/mes | Performance Events | Costo   |
| --------- | ----------- | ------------------ | ------- |
| Developer | 5,000       | -                  | $0/mes  |
| Team      | 50,000      | 100,000            | $26/mes |
| Business  | 250,000     | 500,000            | $80/mes |

Para Valplas MVP, el plan **Developer (gratuito)** es suficiente. Upgrade a Team cuando:

- Más de 5,000 errores/mes
- Necesites performance monitoring
- Necesites más de 1 proyecto

---

## Checklist de Configuración

- [ ] Proyectos creados en Sentry (`valplas-api`, `valplas-web`)
- [ ] DSN configurado en variables de entorno
- [ ] Sentry inicializado en backend (antes de middlewares)
- [ ] Sentry configurado en Next.js (wizard o manual)
- [ ] Source maps subiendo correctamente
- [ ] Error handler personalizado después de Sentry middleware
- [ ] Información sensible filtrada (`beforeSend`)
- [ ] Alerts configuradas (error rate, performance)
- [ ] Integración con Slack configurada
- [ ] Releases trackeadas en deploys
- [ ] Sample rates ajustados para producción

---

## Recursos Adicionales

- [Sentry Node.js Documentation](https://docs.sentry.io/platforms/node/)
- [Sentry Next.js Documentation](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Sentry Performance Monitoring](https://docs.sentry.io/product/performance/)
- [Sentry Best Practices](https://docs.sentry.io/platforms/javascript/best-practices/)
