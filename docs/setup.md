# Guia de Instalacion - Valplas E-commerce

## Prerequisitos

### Software Requerido

| Software | Version Minima | Verificar |
|----------|----------------|-----------|
| Bun | 1.0+ | `bun --version` |
| Node.js | 22+ (opcional) | `node --version` |
| Git | 2.40+ | `git --version` |
| PostgreSQL | 15+ (via Supabase) | - |

> **Nota:** Bun incluye un runtime compatible con Node.js, por lo que Node.js es opcional para desarrollo local.

### Instalacion de Prerequisitos

#### Windows (con winget)

```powershell
# Node.js
winget install OpenJS.NodeJS.LTS

# Bun
powershell -c "irm bun.sh/install.ps1 | iex"

# Git
winget install Git.Git
```

#### macOS (con Homebrew)

```bash
# Node.js
brew install node@22

# Bun
brew install oven-sh/bun/bun

# Git
brew install git
```

#### Linux (Ubuntu/Debian)

```bash
# Node.js (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Bun
curl -fsSL https://bun.sh/install | bash

# Git
sudo apt-get install git
```

---

## Instalacion del Proyecto

### 1. Clonar Repositorio

```bash
git clone https://github.com/tu-usuario/valplas.git
cd valplas
```

### 2. Instalar Dependencias

```bash
bun install
```

### 3. Configurar Variables de Entorno

#### Backend (apps/api/.env)

```bash
cp apps/api/.env.example apps/api/.env
```

Editar `apps/api/.env`:

```env
# Server
PORT=3001
NODE_ENV=development
API_URL=http://localhost:3001

# Database (Supabase)
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
DIRECT_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres

# Supabase
SUPABASE_URL=https://[PROJECT-REF].supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...

# Authentication
JWT_SECRET=tu-secret-muy-seguro-minimo-32-caracteres
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Redis (Upstash) - Opcional para MVP
REDIS_URL=redis://default:[PASSWORD]@[HOST].upstash.io:6379

# Mercado Pago
MP_ACCESS_TOKEN=TEST-0000000000000000-000000-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-000000000
MP_WEBHOOK_SECRET=tu-webhook-secret

# Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxx
EMAIL_FROM=Valplas <no-reply@valplas.net>

# Google Maps
GOOGLE_MAPS_API_KEY=AIza...

# Sentry (Opcional)
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
```

#### Frontend (apps/web/.env.local)

```bash
cp apps/web/.env.example apps/web/.env.local
```

Editar `apps/web/.env.local`:

```env
# API
NEXT_PUBLIC_API_URL=http://localhost:3001/api

# Mercado Pago
NEXT_PUBLIC_MP_PUBLIC_KEY=TEST-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Google Maps
NEXT_PUBLIC_GOOGLE_MAPS_KEY=AIza...

# Site URL
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 4. Configurar Base de Datos

#### Crear proyecto en Supabase

1. Ir a [supabase.com](https://supabase.com) y crear cuenta
2. Crear nuevo proyecto
3. Copiar credenciales de Settings > Database > Connection string

#### Ejecutar Migraciones

```bash
bun db:migrate
```

#### Cargar Datos de Prueba (opcional)

```bash
bun db:seed
```

### 5. Iniciar Desarrollo

```bash
# Iniciar frontend y backend simultaneamente
bun dev

# O iniciar por separado:
bun dev:web    # Frontend en http://localhost:3000
bun dev:api    # Backend en http://localhost:3001
```

---

## Estructura del Monorepo

```
valplas/
├── apps/
│   ├── web/                    # Frontend (Next.js 16)
│   │   ├── src/
│   │   │   ├── app/            # App Router
│   │   │   ├── components/     # Componentes React
│   │   │   ├── hooks/          # Custom hooks
│   │   │   ├── stores/         # Zustand stores
│   │   │   ├── lib/            # Utilidades
│   │   │   └── types/          # TypeScript types
│   │   ├── public/             # Assets estaticos
│   │   └── package.json
│   │
│   └── api/                    # Backend (Express)
│       ├── src/
│       │   ├── modules/        # Modulos por dominio
│       │   ├── shared/         # Codigo compartido
│       │   ├── infrastructure/ # DB, cache, jobs, external
│       │   └── config/         # Configuracion
│       └── package.json
│
├── packages/
│   └── shared/                 # Tipos compartidos
│       └── src/
│           └── types/
│
├── .claude/                    # Configuracion Claude Code
│   ├── agents/                 # Agentes especializados
│   └── skills/                 # Skills del proyecto
│
├── .mcp.json                   # MCPs configurados
├── CLAUDE.md                   # Instrucciones del proyecto
├── package.json                # Root package.json
└── bun.lockb                   # Lockfile
```

---

## Comandos Disponibles

### Desarrollo

| Comando | Descripcion |
|---------|-------------|
| `bun dev` | Inicia frontend y backend |
| `bun dev:web` | Inicia solo frontend (Next.js) |
| `bun dev:api` | Inicia solo backend (Express) |

### Build

| Comando | Descripcion |
|---------|-------------|
| `bun build` | Build de todo el proyecto |
| `bun build:web` | Build del frontend |
| `bun build:api` | Build del backend |

### Testing

| Comando | Descripcion |
|---------|-------------|
| `bun test` | Ejecuta todos los tests |
| `bun test:unit` | Tests unitarios |
| `bun test:e2e` | Tests end-to-end |
| `bun test:watch` | Tests en modo watch |

### Base de Datos

| Comando | Descripcion |
|---------|-------------|
| `bun db:migrate` | Ejecuta migraciones pendientes |
| `bun db:migrate:create <nombre>` | Crea nueva migracion |
| `bun db:seed` | Ejecuta seeds |
| `bun db:reset` | Reset completo (dev only) |

### Calidad de Codigo

| Comando | Descripcion |
|---------|-------------|
| `bun lint` | Ejecuta ESLint |
| `bun lint:fix` | Corrige errores de ESLint |
| `bun format` | Formatea con Prettier |
| `bun typecheck` | Verifica tipos TypeScript |

---

## Configuracion de Servicios Externos

### Supabase (Base de Datos + Storage)

1. Crear proyecto en [supabase.com](https://supabase.com)
2. En Settings > Database, copiar Connection string
3. En Settings > API, copiar URL y keys
4. Crear bucket `products` en Storage para imagenes

### Mercado Pago

1. Crear cuenta en [mercadopago.com.ar/developers](https://www.mercadopago.com.ar/developers)
2. Crear aplicacion
3. Copiar credenciales de prueba (TEST-xxx)
4. Configurar webhook URL: `https://tu-api.com/webhooks/mercadopago`

### Resend (Email)

1. Crear cuenta en [resend.com](https://resend.com)
2. Verificar dominio o usar dominio de prueba
3. Copiar API key

### Google Maps

1. Crear proyecto en [Google Cloud Console](https://console.cloud.google.com)
2. Habilitar APIs: Maps JavaScript API, Places API, Geocoding API
3. Crear API key y restringir a tu dominio

### Upstash Redis (Opcional - para cache/jobs)

1. Crear cuenta en [upstash.com](https://upstash.com)
2. Crear database Redis
3. Copiar connection string

---

## Configuracion IDE

### VS Code Extensions Recomendadas

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "prisma.prisma",
    "ms-vscode.vscode-typescript-next"
  ]
}
```

### Settings Recomendados (.vscode/settings.json)

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "tailwindCSS.experimental.classRegex": [
    ["cn\\(([^)]*)\\)", "(?:'|\"|`)([^']*)(?:'|\"|`)"]
  ]
}
```

---

## Troubleshooting

### Error: "Cannot find module"

```bash
# Limpiar cache y reinstalar
rm -rf node_modules bun.lockb
bun install
```

### Error: "Database connection failed"

1. Verificar que DATABASE_URL es correcta
2. Verificar que IP esta permitida en Supabase (Settings > Database > Connection Pooling)
3. Probar conexion: `bun db:migrate:status`

### Error: "Port already in use"

```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <pid> /F

# macOS/Linux
lsof -i :3000
kill -9 <pid>
```

### Build falla con "Type error"

```bash
# Verificar tipos
bun typecheck

# Si hay errores en node_modules, limpiar
rm -rf node_modules/.cache
bun install
```

---

## Proximos Pasos

1. **Crear estructura de apps/** - Los directorios `apps/web` y `apps/api` se crearan en la siguiente fase
2. **Configurar shadcn/ui** - `bunx shadcn@latest init` en apps/web
3. **Crear migracion inicial** - Tablas base (users, products, categories, orders)
4. **Implementar auth** - Login/registro con JWT
5. **Crear catalogo publico** - Home y listado de productos

---

## Recursos Utiles

- [Next.js Documentation](https://nextjs.org/docs)
- [shadcn/ui Components](https://ui.shadcn.com)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Mercado Pago Developers](https://www.mercadopago.com.ar/developers)
- [Express.js](https://expressjs.com)
- [Zod Validation](https://zod.dev)
