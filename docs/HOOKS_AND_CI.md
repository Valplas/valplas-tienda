# Hooks y CI/CD - Valplas E-commerce

## 📋 Resumen

Este documento explica todos los hooks de Git y workflows de CI/CD configurados en el proyecto para garantizar calidad de código y seguridad.

## 🪝 Git Hooks (Husky)

Los hooks se ejecutan automáticamente en tu máquina local antes de ciertas operaciones de Git.

### 1. commit-msg

**Cuándo:** Antes de crear un commit
**Qué hace:**

- Valida formato Conventional Commits
- Verifica longitud mínima (10 caracteres)

**Tipos permitidos:**

```
feat(scope):     Nueva funcionalidad
fix(scope):      Corrección de bug
docs:            Documentación
style:           Formato (no afecta lógica)
refactor(scope): Refactorización
test:            Tests
chore:           Configuración, deps
perf(scope):     Performance
ci:              CI/CD
build:           Build system
revert:          Revertir commit
```

**Ejemplos:**

```bash
git commit -m "feat(products): agregar filtro por categoría"
git commit -m "fix(auth): corregir expiración de token"
git commit -m "docs: actualizar README con instrucciones"
```

**Bypass (no recomendado):**

```bash
git commit --no-verify -m "mensaje sin formato"
```

---

### 2. pre-commit

**Cuándo:** Antes de crear un commit
**Qué hace:**

1. 🔒 **Check secrets** - Detecta API keys, tokens, passwords
2. 🔍 **Type check** - Verifica tipos TypeScript en todo el monorepo
3. 🧹 **Lint staged** - Ejecuta ESLint + Prettier solo en archivos staged

**Archivos verificados:**

- `*.ts`, `*.tsx`, `*.js`, `*.jsx`, `*.json` para secrets
- Excluye `.env.example`, `node_modules`, archivos de configuración

**Patrones detectados:**

- API Keys (cualquier formato)
- Tokens de autenticación
- AWS Keys (AKIA...)
- Private Keys (PEM)
- Passwords/Secrets
- JWT Tokens
- Mercado Pago tokens
- Supabase keys
- Resend API keys
- Stripe keys
- Google API keys
- Base64 high-entropy strings

**Archivos bloqueados:**

- `.env`, `.env.local`, `.env.production`
- `credentials.json`, `secrets.*`
- `*.pem`, `*.key`, `*.p12`

**Si falla:**

```bash
# Ver qué se detectó
git diff --cached

# Arreglar y volver a intentar
git add .
git commit -m "..."

# Bypass solo si es falso positivo (con precaución)
git commit --no-verify -m "..."
```

---

### 3. pre-push

**Cuándo:** Antes de hacer push
**Qué hace:**

1. 📝 **Type check** - Todo el monorepo
2. 🧹 **Lint** - Todo el monorepo
3. 🏗️ **Build** - API y Web

**Por qué es más estricto que pre-commit:**

- Pre-commit solo valida archivos staged (rápido)
- Pre-push valida TODO (completo, más lento)
- Garantiza que lo pusheado compila 100%

**Si falla:**

```bash
# Ver errores
bun typecheck
bun lint
bun build

# Arreglar y reintentar push
git push

# Bypass solo en emergencias
git push --no-verify
```

---

## 🤖 GitHub Actions Workflows

Los workflows se ejecutan en GitHub automáticamente en respuesta a eventos.

### 1. ci.yml - Continuous Integration

**Triggers:**

- Push a `main` o `develop`
- Pull Request a `main` o `develop`

**Jobs:**

#### Job 1: ci

**Qué hace:**

1. ✅ Type check
2. ✅ Lint
3. ✅ Format check (Prettier)
4. ✅ Build API (con env vars dummy)
5. ✅ Build Web (con env vars dummy)

**Env vars de prueba:**

```yaml
DATABASE_URL: postgresql://dummy:dummy@localhost:5432/dummy
JWT_SECRET: ci-test-secret-min-32-characters-long
NEXT_PUBLIC_API_URL: http://localhost:3001/api
```

#### Job 2: security

**Qué hace:**

1. 🔒 Busca secrets hardcodeados en código
2. 🔒 Verifica que no haya `.env` files commiteados
3. 🔒 Verifica archivos de credenciales (`*.pem`, `*.key`)
4. ⚠️ Busca IPs hardcodeadas (warning)

**Patrones detectados:**

- API keys: `api_key = "xxx"`
- Secrets: `secret = "xxx"`
- Tokens: `token = "xxx"`
- Archivos: `.env`, `credentials.json`

**Excepciones permitidas:**

- `process.env.VARIABLE`
- Valores con `example`, `dummy`, `test`, `ci-`
- Scripts de seguridad (`check-secrets.js`)

#### Job 3: audit

**Qué hace:**

- 🔍 Auditoría de dependencias (npm audit)
- Detecta vulnerabilidades conocidas
- Solo warning (no bloquea)

---

### 2. pr-checks.yml - Pull Request Validation

**Triggers:**

- Pull Request a `main` o `develop`

**Jobs:**

#### Job 1: pr-validation

**Qué hace:**

1. ✅ Verifica título del PR (Conventional Commits)
2. ⚠️ Verifica que tenga descripción
3. ⚠️ Detecta breaking changes en título

**Ejemplos de títulos válidos:**

```
feat(products): add category filter
fix(auth): resolve token expiration
docs: update setup instructions
```

#### Job 2: size-check

**Qué hace:**

- Cuenta líneas cambiadas
- ⚠️ Warning si >500 líneas
- ⚠️ Warning si >1000 líneas (recomienda dividir)

#### Job 3: migration-check

**Qué hace:**

- ❌ **BLOQUEA** si modificás una migración existente
- ✅ Permite nuevas migraciones
- ℹ️ Lista migraciones nuevas en el PR

**Regla crítica:**

> NUNCA modificar una migración existente. Crear nueva migración.

---

### 3. deploy-preview.yml - Preview Deployments

**Triggers:**

- Pull Request opened/updated a `main` o `develop`

**Qué hace:**

1. Build frontend con env staging
2. Comenta en el PR con URL de preview
3. Deploy a Vercel preview (comentado, listo para activar)

**Variables necesarias:**

- `STAGING_API_URL`
- `VERCEL_TOKEN` (opcional)

---

### 4. deploy-production.yml - Production Deployment

**Triggers:**

- Push a `main`
- Manual (workflow_dispatch)

**Jobs:**

#### Job 1: deploy-api

**Qué hace:**

1. Type check + Lint API
2. Build API con env production
3. Deploy a Railway (comentado, listo para activar)

**Variables necesarias:**

- `DATABASE_URL`
- `JWT_SECRET`
- `RAILWAY_TOKEN`

#### Job 2: deploy-web

**Qué hace:**

1. Type check + Lint Web
2. Build Web con env production
3. Deploy a Vercel production (comentado)
4. Espera a que API esté deployed

**Variables necesarias:**

- `PROD_API_URL`
- `MP_PUBLIC_KEY`
- `GOOGLE_MAPS_KEY`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

#### Job 3: post-deploy

**Qué hace:**

1. Health check API (`/health`)
2. Health check Web (curl homepage)
3. Notifica resultado

---

### 5. tests.yml - Automated Testing

**Triggers:**

- Push a `main` o `develop`
- Pull Request a `main` o `develop`

**Jobs:**

#### Job 1: unit-tests

**Qué hace:**

- Ejecuta tests unitarios (cuando estén implementados)
- Placeholder actual

#### Job 2: integration-tests

**Qué hace:**

- Levanta PostgreSQL + Redis
- Ejecuta migraciones
- Ejecuta tests de integración (cuando estén implementados)
- Placeholder actual

#### Job 3: e2e-tests

**Qué hace:**

- Instala Playwright
- Ejecuta tests E2E (cuando estén implementados)
- Sube reportes como artifacts
- Placeholder actual

#### Job 4: coverage

**Qué hace:**

- Ejecuta tests con coverage
- Sube reporte a Codecov (cuando esté configurado)
- Placeholder actual

---

## 🔒 Scripts de Seguridad

### check-secrets.js

**Ubicación:** `scripts/check-secrets.js`

**Ejecutar manualmente:**

```bash
bun run check-secrets
```

**Qué detecta:**

- API Keys (20+ caracteres)
- Auth Tokens (20+ caracteres)
- AWS Access Keys (`AKIA...`)
- Private Keys (`-----BEGIN PRIVATE KEY-----`)
- Secrets/Passwords (8+ caracteres)
- JWT Tokens (`eyJ...`)
- Mercado Pago tokens (`APP-xxx`, `TEST-xxx`)
- Supabase JWT/Service Keys
- Resend API Keys (`re_xxx`)
- Stripe Keys (`sk_live_xxx`, `pk_test_xxx`)
- Google API Keys (`AIza...`)
- Base64 high-entropy strings (32+ caracteres)

**Patrones permitidos (no falsos positivos):**

- `process.env.VARIABLE`
- Archivos `.env.example`
- Variables `NEXT_PUBLIC_*`
- Valores con: `dummy`, `test`, `example`, `placeholder`, `mock`, `fake_`
- URLs locales: `localhost`, `127.0.0.1`
- Template variables: `${API_KEY}`, `${SECRET}`
- Comentarios

**Archivos siempre bloqueados:**

- `.env`, `.env.local`, `.env.production`
- `credentials.json`, `secrets.*`
- `*.pem`, `*.key`, `*.cert`, `*.p12`

---

## 🚀 Comandos Útiles

### Verificación local (antes de commit/push)

```bash
# Type check
bun typecheck

# Lint
bun lint

# Lint y auto-fix
bun lint --fix

# Format
bun format

# Build completo
bun build

# Check secrets manualmente
bun run check-secrets
```

### Bypass de hooks (usar con precaución)

```bash
# Bypass pre-commit
git commit --no-verify -m "mensaje"

# Bypass pre-push
git push --no-verify
```

**⚠️ Advertencia:** Solo usar `--no-verify` cuando:

- Es un falso positivo confirmado
- Es una emergencia crítica
- Sabés exactamente qué estás haciendo

---

## 📊 Flujo de Trabajo Completo

### Desarrollo local

```
1. Modificar archivos
2. git add .
3. git commit -m "feat(scope): descripción"
   ├─ commit-msg: valida formato ✅
   ├─ pre-commit: check-secrets ✅
   ├─ pre-commit: typecheck ✅
   └─ pre-commit: lint-staged ✅
4. git push
   ├─ pre-push: typecheck ✅
   ├─ pre-push: lint ✅
   └─ pre-push: build ✅
```

### GitHub (automático)

```
5. Push trigger workflows:
   ├─ ci.yml: typecheck, lint, format, build, security, audit ✅
   └─ tests.yml: unit, integration, e2e, coverage ✅

6. Crear PR:
   ├─ pr-checks.yml: title format, size, migrations ✅
   └─ deploy-preview.yml: preview deployment ✅

7. Merge a main:
   └─ deploy-production.yml: deploy API + Web ✅
```

---

## 🔧 Configuración de Secrets en GitHub

Para que los workflows funcionen en producción, configurar estos secrets en GitHub:

**Repositorio → Settings → Secrets and variables → Actions**

### Production

- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - JWT secret key (min 32 caracteres)
- `PROD_API_URL` - URL del API en producción
- `MP_PUBLIC_KEY` - Mercado Pago public key
- `GOOGLE_MAPS_KEY` - Google Maps API key
- `VERCEL_TOKEN` - Token de Vercel
- `VERCEL_ORG_ID` - ID de organización Vercel
- `VERCEL_PROJECT_ID` - ID de proyecto Vercel
- `RAILWAY_TOKEN` - Token de Railway

### Staging

- `STAGING_API_URL` - URL del API en staging

### Optional

- `CODECOV_TOKEN` - Token de Codecov para coverage

---

## ❓ Preguntas Frecuentes

### ¿Por qué falló mi commit?

**Check secrets:**

- Verificá que no hayas hardcodeado API keys, tokens o passwords
- Usá `process.env.VARIABLE_NAME` en lugar de valores directos
- Si es un falso positivo, usá valores como `dummy`, `test`, `example`

**Type check:**

- Ejecutá `bun typecheck` para ver errores
- Arreglá errores de tipos TypeScript

**Lint staged:**

- Ejecutá `bun lint` para ver problemas
- Ejecutá `bun lint --fix` para auto-corregir

### ¿Por qué falló mi push?

**Build:**

- Ejecutá `bun build` para ver el error
- Verificá que todo compile correctamente

**Lint:**

- Todo el proyecto debe pasar lint, no solo archivos cambiados
- Ejecutá `bun lint --fix` para corregir

### ¿Cómo saltear un hook en emergencia?

```bash
# Commit sin hooks
git commit --no-verify -m "hotfix: mensaje"

# Push sin hooks
git push --no-verify
```

**⚠️ Solo en emergencias reales**

### ¿Cómo probar workflows localmente?

Usar [act](https://github.com/nektos/act):

```bash
# Instalar act
brew install act  # macOS
# o seguir https://github.com/nektos/act#installation

# Ejecutar workflow
act -j ci  # Ejecutar job 'ci'
act pull_request  # Simular PR
```

---

## 📚 Referencias

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Husky](https://typicode.github.io/husky/)
- [lint-staged](https://github.com/okonet/lint-staged)
- [GitHub Actions](https://docs.github.com/en/actions)
- [Vercel Deployment](https://vercel.com/docs/concepts/deployments/overview)
- [Railway Deployment](https://docs.railway.app/)

---

**Última actualización:** 26 de enero de 2026
**Versión:** 1.0
