# GitHub Actions Setup

Este documento explica cómo configurar los workflows de GitHub Actions para el proyecto Valplas.

## Workflows Configurados

### 1. CI (`.github/workflows/ci.yml`)

Se ejecuta en:

- Push a `main` o `develop`
- Pull Requests a `main` o `develop`

**Jobs:**

- **ci**: Type check, lint, format check, builds
- **security**: Detección de secrets, verificación de archivos sensibles
- **audit**: Auditoría de dependencias

### 2. PR Checks (`.github/workflows/pr-checks.yml`)

Se ejecuta solo en Pull Requests.

**Jobs:**

- **pr-validation**: Valida título del PR (Conventional Commits)
- **size-check**: Alerta si el PR es muy grande (>500 líneas)
- **migration-check**: ⚠️ **CRÍTICO** - Asegura que no se modifiquen migraciones existentes

### 3. Deploy Preview (`.github/workflows/deploy-preview.yml`)

Se ejecuta en Pull Requests para generar preview deployments.

## Secrets Necesarios

Para que los workflows funcionen completamente, configura estos secrets en GitHub:

### Repository Secrets

Ve a: `Settings` > `Secrets and variables` > `Actions` > `New repository secret`

| Secret              | Descripción                  | Requerido    |
| ------------------- | ---------------------------- | ------------ |
| `STAGING_API_URL`   | URL del API de staging       | ✅ Sí        |
| `VERCEL_TOKEN`      | Token de Vercel para deploys | Para preview |
| `VERCEL_ORG_ID`     | ID de organización de Vercel | Para preview |
| `VERCEL_PROJECT_ID` | ID del proyecto en Vercel    | Para preview |

### Obtener Tokens

#### Vercel Token

1. Ve a [Vercel Account Settings](https://vercel.com/account/tokens)
2. Crea un nuevo token con scope del proyecto
3. Copia el token y agrégalo como secret `VERCEL_TOKEN`

```bash
# Obtener IDs de Vercel
cd apps/web
vercel link
# Copia los valores de .vercel/project.json
```

## Variables de Entorno para CI

Los workflows ya tienen variables de entorno dummy para CI. Si necesitas agregar más:

```yaml
env:
  DATABASE_URL: postgresql://dummy:dummy@localhost:5432/dummy
  JWT_SECRET: ci-test-secret-min-32-characters-long
  NEXT_PUBLIC_API_URL: http://localhost:3001/api
```

## Configuración Avanzada

### Deshabilitar Workflows

Para deshabilitar un workflow temporalmente, comenta la sección `on:`:

```yaml
# Deshabilitado temporalmente
# on:
#   push:
#     branches: [main, develop]
```

### Modificar Security Checks

Los checks de seguridad están en `ci.yml` > job `security`. Puedes ajustar los patrones de búsqueda:

```yaml
# Buscar API keys
if git grep -i -E "(api_key|api-key|apikey).*=.*['\"][a-zA-Z0-9]{20,}"
```

### Agregar Notificaciones

Para recibir notificaciones de fallos, agrega Slack o Discord:

```yaml
- name: Notify on failure
  if: failure()
  uses: slackapi/slack-github-action@v1
  with:
    webhook-url: ${{ secrets.SLACK_WEBHOOK_URL }}
    payload: |
      {
        "text": "❌ CI falló en ${{ github.repository }}"
      }
```

## Branch Protection Rules

Configura reglas de protección en GitHub:

`Settings` > `Branches` > `Add rule`

### Para `main`:

- ✅ Require a pull request before merging
- ✅ Require approvals (1)
- ✅ Require status checks to pass before merging:
  - `CI Checks`
  - `Security Checks`
  - `PR Validation`
  - `Migration Check` ⚠️ **CRÍTICO**
- ✅ Require branches to be up to date before merging
- ✅ Do not allow bypassing the above settings

### Para `develop`:

- ✅ Require status checks to pass before merging:
  - `CI Checks`
  - `Migration Check` ⚠️ **CRÍTICO**

## Troubleshooting

### CI falla con "command not found"

Verifica que el comando esté en el `package.json` del workspace correcto:

```json
{
  "scripts": {
    "build:api": "bun --filter @valplas/api build"
  }
}
```

### Security check da falso positivo

Si un string no es un secret pero lo detecta:

1. Usa `process.env.VARIABLE`
2. Usa valores placeholder: `dummy`, `test`, `example`, `ci-`
3. Ajusta el patrón en `.github/workflows/ci.yml`

### Migration check falla incorrectamente

Verifica que los archivos de migración estén en:

```
apps/api/src/infrastructure/database/migrations/*.sql
```

## Monitoring

### Ver runs de workflows

`Actions` tab en GitHub

### Logs detallados

Click en cualquier workflow run > Click en el job > Expandir steps

### Re-ejecutar workflow fallido

Click en "Re-run all jobs" en la esquina superior derecha

## Best Practices

1. ✅ Siempre espera que CI pase antes de mergear
2. ✅ Revisa los logs de security checks cuidadosamente
3. ✅ No uses `--no-verify` en git hooks (bypasea verificaciones locales)
4. ✅ Si CI falla, fíjalo antes de pushear más commits
5. ✅ Mantén los PRs pequeños (<500 líneas cuando sea posible)

## Recursos

- [GitHub Actions Docs](https://docs.github.com/en/actions)
- [Bun GitHub Action](https://github.com/oven-sh/setup-bun)
- [Conventional Commits](https://www.conventionalcommits.org/)
