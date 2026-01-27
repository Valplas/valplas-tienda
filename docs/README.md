# 📚 Documentación de Deployment - Valplas

Esta carpeta contiene toda la documentación necesaria para configurar y hacer deployment de Valplas en producción.

## 📖 Guías Disponibles

### 🚀 [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - **EMPIEZA AQUÍ**

Guía maestra que integra todos los aspectos del deployment. Incluye:

- Visión general de la arquitectura
- Configuración de entornos (local, staging, production)
- Workflows de GitHub Actions completos
- Estrategia de branching y preview deployments
- Checklist pre-deploy y troubleshooting

### 🎨 [VERCEL_DEPLOY.md](./VERCEL_DEPLOY.md)

Guía detallada para deployment del frontend Next.js en Vercel:

- Configuración inicial del proyecto
- Deploy manual y automático
- Preview deployments para PRs
- Variables de entorno por ambiente
- Dominios personalizados
- Performance monitoring con Vercel Analytics

### 🚂 [RAILWAY_DEPLOY.md](./RAILWAY_DEPLOY.md)

Guía completa para deployment del backend Express en Railway:

- Configuración del proyecto y CLI
- Deploy manual y automático
- Entornos separados (production/staging)
- Variables de entorno
- Health checks y monitoreo
- Configuración de Redis (Upstash)
- Migraciones automáticas en deploy

### 🗄️ [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)

Guía de configuración de Supabase (PostgreSQL + Storage):

- Crear y configurar proyectos
- Migraciones de base de datos
- Storage para imágenes de productos
- Row Level Security (RLS)
- Triggers de negocio (stock, pedidos)
- Backups automáticos y manuales
- Configuración local con Supabase CLI

### 🔍 [SENTRY_INTEGRATION.md](./SENTRY_INTEGRATION.md)

Guía de integración de Sentry para monitoreo:

- Configuración en backend (Express)
- Configuración en frontend (Next.js)
- Source maps para debugging
- Performance monitoring
- Alertas y notificaciones
- Releases y deploy tracking
- Best practices de error handling

### ☁️ [CLOUDFLARE_SETUP.md](./CLOUDFLARE_SETUP.md)

Guía de configuración de Cloudflare (DNS + CDN):

- Configuración de nameservers y DNS
- Registros DNS para Vercel y Railway
- SSL/TLS configuration (Full strict)
- Page Rules para cache y redirects
- Firewall rules y security headers
- Performance optimization
- Email routing (opcional)

---

## 🚀 Quick Start

Si es tu primera vez configurando el proyecto para deployment:

1. **Lee primero** [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) para entender la arquitectura completa

2. **Configura los servicios** en este orden:
   - [Cloudflare](./CLOUDFLARE_SETUP.md) - DNS y dominio primero
   - [Supabase](./SUPABASE_SETUP.md) - Base de datos segundo
   - [Railway](./RAILWAY_DEPLOY.md) - Backend tercero
   - [Vercel](./VERCEL_DEPLOY.md) - Frontend cuarto
   - [Sentry](./SENTRY_INTEGRATION.md) - Monitoreo último

3. **Configura GitHub Actions**:
   - Agrega los secrets necesarios (ver [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md#setup-inicial))
   - Los workflows ya están configurados en `.github/workflows/`

4. **Testea el flujo**:
   - Crea un feature branch
   - Abre un PR → Verifica preview deployment
   - Merge a `develop` → Verifica staging deployment
   - Merge a `main` → Verifica production deployment

---

## 🌍 Entornos

| Entorno        | Branch      | Frontend                             | Backend                              | Database            |
| -------------- | ----------- | ------------------------------------ | ------------------------------------ | ------------------- |
| **Local**      | -           | `localhost:3000`                     | `localhost:3001`                     | Local Supabase      |
| **Preview**    | PR branches | `*.vercel.app`                       | Staging API                          | Supabase Staging    |
| **Staging**    | `develop`   | `valplas-web-git-develop.vercel.app` | `valplas-api-staging.up.railway.app` | Supabase Staging    |
| **Production** | `main`      | `valplas.net`                        | `api.valplas.net`                    | Supabase Production |

---

## 📋 Checklist de Setup

### Servicios Externos

- [ ] Cuenta en [Vercel](https://vercel.com)
- [ ] Cuenta en [Railway](https://railway.app)
- [ ] Cuenta en [Supabase](https://supabase.com)
- [ ] Cuenta en [Sentry](https://sentry.io)
- [ ] Cuenta en [Upstash](https://upstash.com) (Redis)
- [ ] Dominio configurado en Cloudflare

### Configuración de Proyectos

- [ ] Proyecto `valplas-production` creado en Supabase
- [ ] Proyecto `valplas-staging` creado en Supabase
- [ ] Proyecto `valplas-api` creado en Railway (prod + staging)
- [ ] Proyecto `valplas-web` creado en Vercel
- [ ] Proyectos `valplas-api` y `valplas-web` creados en Sentry
- [ ] Redis database creado en Upstash

### GitHub Secrets

- [ ] `VERCEL_TOKEN`
- [ ] `VERCEL_ORG_ID`
- [ ] `VERCEL_PROJECT_ID`
- [ ] `RAILWAY_TOKEN`
- [ ] `RAILWAY_SERVICE_ID`
- [ ] `RAILWAY_SERVICE_ID_STAGING`
- [ ] `SENTRY_AUTH_TOKEN`
- [ ] `DATABASE_URL` (production)
- [ ] `STAGING_DATABASE_URL`
- [ ] `SUPABASE_SERVICE_KEY`

### Variables de Entorno

- [ ] Variables configuradas en Vercel (production + preview)
- [ ] Variables configuradas en Railway (production + staging)
- [ ] `.env.local` configurado para desarrollo local

### Testing

- [ ] Flujo de preview deployment funcionando
- [ ] Deploy a staging funcionando
- [ ] Deploy a production funcionando
- [ ] Health checks pasando
- [ ] Sentry recibiendo eventos

---

## 🛠️ Comandos Útiles

```bash
# Desarrollo local
bun dev                    # Frontend + Backend
bun dev:web               # Solo frontend
bun dev:api               # Solo backend

# Tests
bun test                  # Todos los tests
bun test:unit             # Tests unitarios
bun test:e2e              # Tests E2E

# Build
bun build                 # Build completo
bun build:web             # Build frontend
bun build:api             # Build backend

# Database
bun db:migrate            # Ejecutar migraciones
bun db:seed               # Seed de datos
bun db:reset              # Reset DB local

# Linting
bun lint                  # Lint completo
bun lint:fix              # Fix automático
bun typecheck             # Type checking
```

---

## 🆘 Troubleshooting

Si algo no funciona, consulta la sección de **Troubleshooting** en cada guía específica:

- [Troubleshooting Vercel](./VERCEL_DEPLOY.md#troubleshooting)
- [Troubleshooting Railway](./RAILWAY_DEPLOY.md#troubleshooting)
- [Troubleshooting Supabase](./SUPABASE_SETUP.md#troubleshooting)
- [Troubleshooting Sentry](./SENTRY_INTEGRATION.md#troubleshooting)

También puedes revisar:

- Railway logs: `railway logs --follow`
- Vercel logs: Dashboard de Vercel
- Supabase logs: Dashboard de Supabase → Logs
- Sentry dashboard: Para errores en tiempo real

---

## 💰 Costos Estimados

| Servicio         | Plan Recomendado | Costo Mensual |
| ---------------- | ---------------- | ------------- |
| Vercel           | Hobby            | $0            |
| Railway          | Hobby            | $5            |
| Supabase         | Free (MVP) / Pro | $0 / $25      |
| Upstash Redis    | Free             | $0            |
| Sentry           | Developer        | $0            |
| Cloudflare       | Free             | $0            |
| **Total MVP**    |                  | **$5/mes**    |
| **Total Scaled** |                  | **$55/mes**   |

---

## 📞 Soporte

Si tienes preguntas sobre el deployment:

1. Revisa la documentación relevante arriba
2. Busca en la sección de Troubleshooting
3. Revisa los logs de los servicios
4. Contacta al equipo de desarrollo

---

## 🔄 Actualizaciones

Este documento y las guías asociadas se actualizan regularmente. Asegúrate de estar usando la última versión:

```bash
git pull origin main
```

**Última actualización:** 2026-01-27
