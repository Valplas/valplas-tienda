# Valplas E-commerce

Plataforma e-commerce para distribuidora de artículos plásticos, productos de limpieza y electrodomésticos.

## Stack Tecnológico

- **Frontend:** Next.js 16 (App Router, React 19, Server Components)
- **Backend:** Express.js + TypeScript
- **Base de datos:** PostgreSQL (Supabase)
- **Estilos:** Tailwind CSS + shadcn/ui
- **Estado:** Zustand
- **Validación:** Zod
- **Package Manager:** Bun
- **Monorepo:** Bun workspaces

## Estructura del Proyecto

```
valplas-tienda/
├── apps/
│   ├── web/                    # Frontend Next.js
│   └── api/                    # Backend Express
├── packages/
│   └── shared/                 # Tipos compartidos
├── CLAUDE.md                   # Convenciones del proyecto
└── mds/
    └── setup.md                # Guía de instalación
```

## Inicio Rápido

### Prerequisitos

- Node.js 22+
- Bun 1.0+
- Cuenta en Supabase (base de datos)

### Instalación

```bash
# Clonar repositorio
git clone <repo-url>
cd valplas-tienda

# Instalar dependencias
bun install

# Configurar variables de entorno
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# Editar .env con tus credenciales
```

### Desarrollo

```bash
# Iniciar frontend y backend
bun dev

# O iniciar por separado:
bun dev:web    # Frontend en http://localhost:3000
bun dev:api    # Backend en http://localhost:3001
```

### Base de Datos

```bash
# Ejecutar migraciones
bun db:migrate

# Crear nueva migración
bun db:migrate:create nombre_descriptivo

# Cargar datos de prueba
bun db:seed
```

## Scripts Disponibles

| Comando          | Descripción                            |
| ---------------- | -------------------------------------- |
| `bun dev`        | Inicia desarrollo (frontend + backend) |
| `bun dev:web`    | Solo frontend                          |
| `bun dev:api`    | Solo backend                           |
| `bun build`      | Build de todo el proyecto              |
| `bun test`       | Ejecuta todos los tests                |
| `bun lint`       | Ejecuta linter                         |
| `bun format`     | Formatea código                        |
| `bun typecheck`  | Verifica tipos TypeScript              |
| `bun db:migrate` | Ejecuta migraciones                    |

## Git Hooks y CI/CD

### Git Hooks (Husky)

El proyecto usa Husky para ejecutar verificaciones antes de commits y pushes:

**Pre-commit:**

- Verifica secrets (API keys, tokens, passwords)
- Ejecuta lint-staged (prettier + eslint)

**Commit-msg:**

- Valida formato de Conventional Commits

**Pre-push:**

- Type check completo
- Lint completo
- Build completo

**Formato de commits:**

```bash
tipo(scope): descripción

# Ejemplos:
git commit -m "feat(products): add filter by category"
git commit -m "fix(auth): resolve token expiration"
```

Ver más en: [.husky/README.md](.husky/README.md)

### GitHub Actions

**CI Workflow** (`.github/workflows/ci.yml`):

- Type check, lint, format check
- Build de frontend y backend
- Security checks (detección de secrets)
- Dependency audit

**PR Checks** (`.github/workflows/pr-checks.yml`):

- Validación de título del PR (Conventional Commits)
- Check de tamaño del PR
- **Verificación de migraciones** (asegura que no se modifiquen existentes)

**Deploy Preview** (`.github/workflows/deploy-preview.yml`):

- Deploy de preview en Vercel para cada PR

## Configuración de shadcn/ui

```bash
# Instalar componentes
cd apps/web
bunx shadcn@latest add button
bunx shadcn@latest add card
bunx shadcn@latest add dialog
# ... etc
```

## Documentación

- [Guía de Instalación](./mds/setup.md) - Instrucciones detalladas de instalación
- [CLAUDE.md](./CLAUDE.md) - Convenciones del proyecto y arquitectura
- [PRD](./docs/PRD.md) - Product Requirements Document (si existe)

## Servicios Externos

- **Supabase:** Base de datos PostgreSQL + Storage
- **Mercado Pago:** Procesamiento de pagos
- **Resend:** Envío de emails
- **Google Maps:** Geocodificación y autocompletado de direcciones
- **Upstash Redis:** Cache y jobs en background (opcional)

## Deployment

- **Frontend:** Vercel
- **Backend:** Railway
- **Base de datos:** Supabase

## Licencia

Privado - Todos los derechos reservados
