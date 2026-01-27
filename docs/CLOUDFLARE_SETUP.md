# ☁️ Configuración de Cloudflare DNS + CDN

Esta guía cubre la configuración completa de Cloudflare para Valplas: DNS, CDN, SSL, y reglas de seguridad.

## 📋 Tabla de Contenidos

- [Pre-requisitos](#pre-requisitos)
- [Agregar Dominio a Cloudflare](#agregar-dominio-a-cloudflare)
- [Configuración de DNS](#configuración-de-dns)
- [Configuración de SSL](#configuración-de-ssl)
- [Page Rules](#page-rules)
- [Firewall Rules](#firewall-rules)
- [Performance Optimization](#performance-optimization)
- [Analytics](#analytics)
- [Troubleshooting](#troubleshooting)

---

## Pre-requisitos

- Cuenta en [Cloudflare](https://cloudflare.com) (plan Free es suficiente)
- Dominio registrado (valplas.net)
- Acceso al panel de control del registrador de dominio

---

## Agregar Dominio a Cloudflare

### Paso 1: Agregar Sitio

1. Inicia sesión en [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Click en **Add a Site**
3. Ingresa tu dominio: `valplas.net`
4. Selecciona el plan: **Free** (suficiente para MVP)
5. Click en **Add Site**

### Paso 2: Revisar Registros DNS

Cloudflare escaneará automáticamente los registros DNS existentes. Revisa que todos los registros importantes estén presentes.

### Paso 3: Cambiar Nameservers

Cloudflare te dará 2 nameservers:

```
ns1.cloudflare.com
ns2.cloudflare.com
```

Ve al panel de control de tu registrador de dominio (donde compraste valplas.net) y cambia los nameservers a los proporcionados por Cloudflare.

**Tiempo de propagación:** 2-48 horas (usualmente < 4 horas)

Verifica el cambio:

```bash
dig valplas.net NS +short
```

---

## Configuración de DNS

### Registros para Valplas

Una vez que Cloudflare esté activo, configura los siguientes registros DNS:

| Type      | Name      | Content                                 | Proxy Status | TTL  |
| --------- | --------- | --------------------------------------- | ------------ | ---- |
| **CNAME** | `www`     | `cname.vercel-dns.com`                  | ✅ Proxied   | Auto |
| **A**     | `@`       | `76.76.21.21`                           | ✅ Proxied   | Auto |
| **CNAME** | `api`     | `valplas-api-production.up.railway.app` | ✅ Proxied   | Auto |
| **CNAME** | `staging` | `cname.vercel-dns.com`                  | ⚠️ DNS Only  | Auto |

**Nota sobre Proxy Status:**

- **Proxied (☁️):** El tráfico pasa por Cloudflare (CDN + protección)
- **DNS Only (🔄):** Cloudflare solo resuelve DNS (sin CDN)

### Explicación de Registros

#### 1. Frontend Principal (`www` y `@`)

```
Type: CNAME
Name: www
Content: cname.vercel-dns.com
Proxy: ✅ Proxied
```

```
Type: A
Name: @ (root domain)
Content: 76.76.21.21 (Vercel IP)
Proxy: ✅ Proxied
```

Esto hace que tanto `valplas.net` como `www.valplas.net` apunten a Vercel.

#### 2. Backend API (`api`)

```
Type: CNAME
Name: api
Content: valplas-api-production.up.railway.app
Proxy: ✅ Proxied
```

Esto hace que `api.valplas.net` apunte a Railway con CDN de Cloudflare.

#### 3. Staging Environment (opcional)

```
Type: CNAME
Name: staging
Content: cname.vercel-dns.com
Proxy: ⚠️ DNS Only
```

Para staging, puedes usar DNS Only para evitar problemas con certificados SSL de preview.

---

## Configuración de SSL

### Paso 1: Habilitar SSL/TLS

1. Ve a **SSL/TLS** en el dashboard
2. Configura el modo de encriptación:

```
Encryption mode: Full (strict)
```

**Importante:** Usa "Full (strict)" porque Vercel y Railway ya tienen SSL.

| Modo              | Descripción                             | Cuándo usar                   |
| ----------------- | --------------------------------------- | ----------------------------- |
| **Off**           | Sin SSL                                 | ❌ Nunca                      |
| **Flexible**      | SSL solo entre usuario y Cloudflare     | ❌ Inseguro                   |
| **Full**          | SSL end-to-end, sin validar certificado | ⚠️ Solo si no hay otra opción |
| **Full (strict)** | SSL end-to-end con validación           | ✅ **Usa este**               |

### Paso 2: Habilitar Always Use HTTPS

1. Ve a **SSL/TLS** → **Edge Certificates**
2. Habilita:
   - ✅ **Always Use HTTPS** (redirige HTTP a HTTPS)
   - ✅ **Automatic HTTPS Rewrites**
   - ✅ **Minimum TLS Version: 1.2**

### Paso 3: Habilitar HSTS (Opcional, pero recomendado)

1. Ve a **SSL/TLS** → **Edge Certificates**
2. Habilita **HTTP Strict Transport Security (HSTS)**:
   - **Max Age**: 12 months
   - **Include subdomains**: Yes
   - **Preload**: Yes (solo si estás seguro)

⚠️ **ADVERTENCIA:** HSTS es permanente por el tiempo configurado. Solo habilita si estás 100% seguro de que el sitio siempre tendrá HTTPS.

---

## Page Rules

Las Page Rules te permiten configurar comportamiento específico para diferentes URLs.

### Regla 1: Forzar HTTPS en Todo el Sitio

```
URL: *valplas.net/*
Settings:
  - Always Use HTTPS: On
```

### Regla 2: Cache para Assets Estáticos

```
URL: valplas.net/_next/static/*
Settings:
  - Cache Level: Cache Everything
  - Edge Cache TTL: 1 year
  - Browser Cache TTL: 1 year
```

### Regla 3: No Cache para API

```
URL: api.valplas.net/*
Settings:
  - Cache Level: Bypass
```

### Regla 4: Redirect www a non-www (o viceversa)

Si prefieres que `www.valplas.net` redirija a `valplas.net`:

```
URL: www.valplas.net/*
Settings:
  - Forwarding URL: 301 Permanent Redirect
  - Destination: https://valplas.net/$1
```

O al revés (non-www a www):

```
URL: valplas.net/*
Settings:
  - Forwarding URL: 301 Permanent Redirect
  - Destination: https://www.valplas.net/$1
```

**Límite:** Plan Free tiene 3 Page Rules. Usa las más importantes.

---

## Firewall Rules

Protege tu sitio con reglas de firewall.

### Regla 1: Bloquear Bots Conocidos

```
Field: Known Bots
Operator: equals
Value: On
Action: Block
```

### Regla 2: Challenge Países Sospechosos (Opcional)

Si tu negocio es solo Argentina:

```
Field: Country
Operator: does not equal
Value: AR (Argentina)
Action: JS Challenge
```

**Nota:** Esto puede afectar crawlers de búsqueda. Usa con precaución.

### Regla 3: Rate Limiting para API

```
URL: api.valplas.net/api/*
Rate: 100 requests per 10 minutes
Action: Block
```

**Límite:** Plan Free no incluye Rate Limiting. Upgrade a Pro ($20/mes) si lo necesitas.

---

## Performance Optimization

### Auto Minify

1. Ve a **Speed** → **Optimization**
2. Habilita Auto Minify:
   - ✅ JavaScript
   - ✅ CSS
   - ✅ HTML

### Brotli Compression

1. Ve a **Speed** → **Optimization**
2. Habilita:
   - ✅ **Brotli**

Brotli es más eficiente que Gzip (10-20% mejor compresión).

### Early Hints

1. Ve a **Speed** → **Optimization**
2. Habilita:
   - ✅ **Early Hints**

Esto envía preload hints antes de que la página esté lista, mejorando LCP.

### Caching

1. Ve a **Caching** → **Configuration**
2. Configura:
   - **Caching Level:** Standard
   - **Browser Cache TTL:** Respect Existing Headers

**Importante:** Deja que Next.js y Railway manejen el cache. Cloudflare solo cachea assets estáticos.

---

## Analytics

### Cloudflare Web Analytics

Cloudflare ofrece analytics gratuito (similar a Google Analytics pero más ligero y privacy-friendly).

1. Ve a **Analytics** → **Web Analytics**
2. Click en **Enable Web Analytics**
3. Copia el script y agrégalo al `<head>` de tu sitio (Next.js):

```tsx
// apps/web/src/app/layout.tsx
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        {/* Cloudflare Web Analytics */}
        <script
          defer
          src="https://static.cloudflareinsights.com/beacon.min.js"
          data-cf-beacon='{"token": "YOUR_TOKEN_HERE"}'
        ></script>
      </head>
      <body>{children}</body>
    </html>
  );
}
```

**Métricas disponibles:**

- Page views
- Unique visitors
- Page load time
- Bounce rate
- Top pages
- Referrers
- Countries

---

## Security Headers

Cloudflare puede agregar headers de seguridad automáticamente.

### Configurar en Transform Rules

1. Ve a **Rules** → **Transform Rules** → **Modify Response Header**
2. Crea reglas para agregar headers:

```
Rule 1: Content Security Policy
  Header Name: Content-Security-Policy
  Value: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live https://va.vercel-scripts.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:;

Rule 2: X-Frame-Options
  Header Name: X-Frame-Options
  Value: DENY

Rule 3: X-Content-Type-Options
  Header Name: X-Content-Type-Options
  Value: nosniff

Rule 4: Referrer-Policy
  Header Name: Referrer-Policy
  Value: strict-origin-when-cross-origin

Rule 5: Permissions-Policy
  Header Name: Permissions-Policy
  Value: camera=(), microphone=(), geolocation=()
```

**Nota:** Si ya configuras estos headers en Next.js, Cloudflare no los sobrescribirá.

---

## Email Configuration

Si necesitas configurar email forwarding (ej: `contacto@valplas.net`):

### Opción 1: Cloudflare Email Routing (Gratis)

1. Ve a **Email** → **Email Routing**
2. Habilita Email Routing
3. Agrega reglas de forwarding:
   ```
   contacto@valplas.net → tu-email-personal@gmail.com
   ventas@valplas.net → ventas@empresa.com
   ```

### Opción 2: External Email (Google Workspace, Microsoft 365)

Configura los registros MX según tu proveedor de email.

**Ejemplo para Google Workspace:**

| Type | Name | Content                 | Priority | TTL  |
| ---- | ---- | ----------------------- | -------- | ---- |
| MX   | @    | aspmx.l.google.com      | 1        | Auto |
| MX   | @    | alt1.aspmx.l.google.com | 5        | Auto |

---

## Monitoring y Logs

### Cloudflare Logs

El plan Free de Cloudflare no incluye logs completos, pero puedes ver:

1. Ve a **Analytics** → **Traffic**
2. Métricas disponibles:
   - Requests
   - Bandwidth
   - Threats blocked
   - Status codes

### Configurar Alerts (Plan Pro)

Si upgradeaste a Pro, puedes configurar alerts:

1. Ve a **Notifications**
2. Configura alerts para:
   - Picos de tráfico
   - Errores 5xx
   - SSL certificate expiration
   - Cambios en DNS

---

## Troubleshooting

### Problema: "ERR_TOO_MANY_REDIRECTS"

**Causa:** Configuración incorrecta de SSL.

**Solución:**

1. Ve a **SSL/TLS**
2. Cambia a **Full (strict)**
3. Limpia cache del navegador

---

### Problema: Certificado SSL Inválido

**Causa:** Cloudflare está en modo "Proxied" pero el origen no tiene SSL.

**Solución:**

1. Verifica que Vercel/Railway tengan SSL habilitado (lo tienen por defecto)
2. Usa SSL mode **Full (strict)**

---

### Problema: Cambios en DNS No Se Reflejan

**Causa:** Cache de DNS.

**Solución:**

```bash
# Limpiar cache de DNS local (Windows)
ipconfig /flushdns

# Limpiar cache de DNS local (Mac/Linux)
sudo dscacheutil -flushcache

# Verificar propagación
dig valplas.net @8.8.8.8
```

También puedes usar herramientas online:

- [DNS Checker](https://dnschecker.org)
- [WhatsMyDNS](https://whatsmydns.net)

---

### Problema: API CORS Errors

**Causa:** Cloudflare está bloqueando requests o modificando headers.

**Solución:**

1. Deshabilita "Rocket Loader" para el API:
   - Page Rule: `api.valplas.net/*`
   - Setting: Rocket Loader = Off
2. Verifica que el backend tenga CORS configurado correctamente

---

### Problema: CSS/JS No Carga (404)

**Causa:** Page Rules incorrectas o Minify rompiendo código.

**Solución:**

1. Deshabilita Auto Minify temporalmente
2. Limpia cache de Cloudflare:
   - Ve a **Caching** → **Configuration**
   - Click en **Purge Everything**

---

## Configuración Recomendada para Valplas

```yaml
SSL/TLS:
  - Encryption Mode: Full (strict)
  - Always Use HTTPS: On
  - Minimum TLS: 1.2
  - HSTS: Enabled (12 months)

Speed:
  - Auto Minify: JS, CSS, HTML
  - Brotli: On
  - Early Hints: On

Caching:
  - Caching Level: Standard
  - Browser Cache TTL: Respect Existing Headers

Firewall:
  - Security Level: Medium
  - Bot Fight Mode: On
  - Challenge Passage: 30 minutes

Page Rules:
  1. *valplas.net/* → Always Use HTTPS
  2. valplas.net/_next/static/* → Cache Everything (1 year)
  3. api.valplas.net/* → Cache Level: Bypass
```

---

## Checklist de Configuración

- [ ] Dominio agregado a Cloudflare
- [ ] Nameservers actualizados en registrador
- [ ] Propagación de DNS completada (verificar con dig)
- [ ] Registros DNS configurados (A, CNAME)
- [ ] SSL mode configurado (Full strict)
- [ ] Always Use HTTPS habilitado
- [ ] Page Rules configuradas
- [ ] Auto Minify habilitado
- [ ] Brotli habilitado
- [ ] Bot Fight Mode habilitado
- [ ] Analytics configurado (opcional)
- [ ] Dominio verificado en Vercel
- [ ] Custom domain configurado en Railway

---

## Costos

| Plan         | Precio   | Features                                                  |
| ------------ | -------- | --------------------------------------------------------- |
| **Free**     | $0/mes   | DNS, SSL, CDN básico, DDoS protection, 3 Page Rules       |
| **Pro**      | $20/mes  | Todo lo anterior + WAF, 20 Page Rules, Image Optimization |
| **Business** | $200/mes | Todo lo anterior + 50 Page Rules, SLA 100%, Support 24/7  |

Para Valplas, el **plan Free es suficiente** para MVP. Considera upgrade a Pro cuando:

- Necesites más Page Rules
- Necesites WAF avanzado
- Necesites Rate Limiting
- Tráfico > 100k visitors/mes

---

## Recursos Adicionales

- [Cloudflare Documentation](https://developers.cloudflare.com)
- [Cloudflare Community](https://community.cloudflare.com)
- [SSL Configuration Guide](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/)
- [Page Rules Guide](https://developers.cloudflare.com/rules/page-rules/)
