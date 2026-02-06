# Deploy Frontend a Vercel

## 🚀 Configuración Inicial

### 1. Conectar Repositorio

1. Ve a [Vercel Dashboard](https://vercel.com)
2. **Add New** → **Project**
3. Importa el repositorio de GitHub
4. Selecciona la rama: `main` o `backend-mvp`

### 2. Configuración del Proyecto

**Framework Preset:** Next.js

**Root Directory:** `apps/web`

**Build Command:**

```bash
cd ../.. && bun run build:web
```

**Install Command:**

```bash
cd ../.. && bun install
```

**Output Directory:** `.next`

### 3. Variables de Entorno

Ve a **Settings** → **Environment Variables** y agrega:

#### Production

| Variable                      | Valor                                      | Ejemplo                                          |
| ----------------------------- | ------------------------------------------ | ------------------------------------------------ |
| `NEXT_PUBLIC_API_URL`         | URL del backend en Railway                 | `https://valplas-api-production.railway.app/api` |
| `NEXT_PUBLIC_MP_PUBLIC_KEY`   | Clave pública de Mercado Pago (Producción) | `APP-xxxx-xxxx-xxxx`                             |
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | API Key de Google Maps                     | `AIza...`                                        |
| `NEXT_PUBLIC_SITE_URL`        | URL del sitio en Vercel                    | `https://valplas.vercel.app`                     |

#### Preview (opcional)

Las mismas variables pero puedes usar:

- `NEXT_PUBLIC_API_URL`: Backend de staging o mismo de producción
- `NEXT_PUBLIC_MP_PUBLIC_KEY`: `TEST-xxxx-xxxx-xxxx` (clave de prueba)

#### Development (opcional)

- `NEXT_PUBLIC_API_URL`: `http://localhost:3001/api`
- `NEXT_PUBLIC_MP_PUBLIC_KEY`: `TEST-xxxx-xxxx-xxxx`

---

## 📝 Obtener URL del Backend (Railway)

```bash
# Desde apps/api
railway domain
```

La URL será algo como: `https://valplas-api-production.up.railway.app`

**⚠️ IMPORTANTE:** Agrega `/api` al final: `https://valplas-api-production.up.railway.app/api`

---

## 🔄 Deploy

### Automático (Recomendado)

Vercel hace deploy automático en cada push a la rama configurada.

### Manual

```bash
# Instalar Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy a preview
cd apps/web
vercel

# Deploy a producción
vercel --prod
```

---

## ✅ Verificar Deploy

1. **Build exitoso** ✅
   - Vercel debe mostrar "Build Completed"

2. **Variables cargadas** ✅
   - Ir a Settings → Environment Variables
   - Verificar que todas estén configuradas

3. **Test del sitio** ✅
   - Abrir la URL de Vercel
   - Verificar que no haya errores en la consola (F12)
   - Test de login/catálogo

4. **API conectada** ✅
   - En Network tab (F12) verificar que las llamadas vayan a Railway
   - No debe haber errores CORS

---

## 🐛 Troubleshooting

### Error de CORS

**Síntoma:** Error en consola: `Access to fetch blocked by CORS`

**Solución:**

1. Verificar que el backend tenga configurada la variable `ALLOWED_ORIGINS` en Railway
2. Verificar que incluya la URL de Vercel:
   ```
   ALLOWED_ORIGINS=https://valplas.vercel.app,https://*.vercel.app
   ```

### Variables de entorno no funcionan

**Síntoma:** `NEXT_PUBLIC_API_URL` es `undefined`

**Solución:**

1. Verificar que las variables estén configuradas en Vercel
2. Hacer **Redeploy** después de agregar variables
3. Las variables deben empezar con `NEXT_PUBLIC_` para estar disponibles en el cliente

### Build falla

**Síntoma:** Error `Cannot find module '@valplas/shared'`

**Solución:**

1. Verificar que `Root Directory` esté en `apps/web`
2. Verificar que `Install Command` sea `cd ../.. && bun install`
3. Verificar que `Build Command` sea `cd ../.. && bun run build:web`

---

## 📚 Recursos

- [Vercel Docs](https://vercel.com/docs)
- [Next.js on Vercel](https://vercel.com/docs/frameworks/nextjs)
- [Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
