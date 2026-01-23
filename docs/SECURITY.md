# Guía de Seguridad - Valplas

## 🔒 Principios de Seguridad

1. **Nunca commitear secrets**
2. **Validar todas las entradas**
3. **Usar HTTPS siempre**
4. **Principio de mínimo privilegio**
5. **Auditar cambios críticos**

---

## Secrets y Credenciales

### ❌ NUNCA Commitear

```bash
# Archivos prohibidos
.env
.env.local
.env.production
*.pem
*.key
credentials.json
secrets.*
```

### ✅ Usar Variables de Entorno

```typescript
// ❌ MAL
const apiKey = 'sk_live_51abc123...';

// ✅ BIEN
const apiKey = process.env.MERCADOPAGO_TOKEN;
```

### Verificación Pre-Commit

El proyecto tiene múltiples capas de protección:

1. **Husky pre-commit hook** - Ejecuta `scripts/check-secrets.js`
2. **GitHub Actions** - Workflow de seguridad
3. **.gitignore** - Previene add de archivos sensibles

```bash
# Verificar manualmente antes de commit
git diff --staged | grep -i "api_key\|secret\|password\|token"
```

### Qué Hacer Si Commiteas un Secret

1. **Rotar inmediatamente** la credencial comprometida
2. **Eliminar del historial:**

   ```bash
   # Opción 1: BFG Repo-Cleaner (recomendado)
   bfg --replace-text passwords.txt repo.git

   # Opción 2: git filter-branch
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch path/to/file" \
     --prune-empty --tag-name-filter cat -- --all
   ```

3. **Force push:**
   ```bash
   git push origin --force --all
   git push origin --force --tags
   ```
4. **Notificar al equipo**

---

## Gestión de Secrets por Ambiente

### Desarrollo Local

```bash
# .env (git-ignored)
DATABASE_URL=postgresql://localhost:5432/valplas_dev
JWT_SECRET=dev-secret-min-32-chars
MP_ACCESS_TOKEN=TEST-xxx
```

### Staging

Variables en Railway/Vercel dashboard:

- `DATABASE_URL`
- `JWT_SECRET` (generado seguro)
- `MP_ACCESS_TOKEN` (TEST keys)

### Producción

Variables en Railway/Vercel dashboard:

- `DATABASE_URL`
- `JWT_SECRET` (rotado regularmente)
- `MP_ACCESS_TOKEN` (PRODUCTION keys)
- Habilitar logging y monitoring

---

## Validación de Inputs

### Backend (Express)

```typescript
// Siempre usar Zod para validación
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  name: z.string().min(1).max(200)
});

// Middleware de validación
app.post('/users', validateBody(createUserSchema), async (req, res) => {
  // req.body ya está validado
});
```

### Frontend (Next.js)

```typescript
// React Hook Form + Zod
const formSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres')
});

const form = useForm({
  resolver: zodResolver(formSchema)
});
```

---

## SQL Injection Prevention

### ❌ NUNCA Concatenar Strings

```typescript
// ❌ VULNERABLE
const query = `SELECT * FROM users WHERE email = '${email}'`;
```

### ✅ SIEMPRE Usar Parámetros

```typescript
// ✅ SEGURO
const query = 'SELECT * FROM users WHERE email = $1';
const result = await db.query(query, [email]);
```

---

## XSS Prevention

### React (Automático)

React escapa automáticamente strings:

```tsx
// Seguro por defecto
<div>{userInput}</div>
```

### ⚠️ Cuidado con dangerouslySetInnerHTML

```tsx
// ❌ VULNERABLE
<div dangerouslySetInnerHTML={{ __html: userInput }} />;

// ✅ Sanitizar primero
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userInput) }} />;
```

---

## CSRF Protection

### Cookies HttpOnly

```typescript
// Backend - Set cookie
res.cookie('session', token, {
  httpOnly: true, // No accesible desde JavaScript
  secure: true, // Solo HTTPS
  sameSite: 'strict', // Protección CSRF
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 días
});
```

### CORS Configurado

```typescript
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true // Permitir cookies
  })
);
```

---

## Autenticación JWT

### Implementación Segura

```typescript
// Generar token
const token = jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: '15m' });

// Verificar token
const decoded = jwt.verify(token, process.env.JWT_SECRET);

// Refresh token (7 días)
const refreshToken = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
```

### Rotación de Tokens

- Access token: 15 minutos
- Refresh token: 7 días
- Invalidar refresh tokens en logout
- Almacenar refresh tokens en DB para revocación

---

## Rate Limiting

### Express Rate Limit

```typescript
import rateLimit from 'express-rate-limit';

// Rate limit global
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 requests
  message: 'Demasiados requests, intenta de nuevo más tarde'
});

app.use('/api/', limiter);

// Rate limit estricto para login
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // Solo 5 intentos de login
  skipSuccessfulRequests: true
});

app.post('/api/auth/login', authLimiter, loginHandler);
```

---

## Seguridad en Headers (Helmet)

```typescript
import helmet from 'helmet';

app.use(helmet());

// Configuración personalizada
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:']
      }
    }
  })
);
```

---

## Logging y Monitoring

### Qué Loggear

✅ **SÍ:**

- Eventos de autenticación (login, logout)
- Cambios en datos críticos (productos, precios, pedidos)
- Errores y excepciones
- Requests fallidos (401, 403, 500)

❌ **NO:**

- Passwords
- Tokens completos
- Datos personales sensibles (tarjetas, DNI)
- Secretos o API keys

### Formato de Logs

```typescript
logger.info('User login', {
  userId: user.id,
  email: user.email, // OK
  ip: req.ip,
  userAgent: req.get('user-agent')
  // NO incluir: password, token
});
```

---

## Auditoría de Dependencias

```bash
# Auditar con npm
npm audit

# Fix vulnerabilidades automáticas
npm audit fix

# Actualizar dependencias
bun update
```

### Dependabot

GitHub Dependabot está habilitado y creará PRs automáticos para vulnerabilidades.

---

## Backup y Disaster Recovery

### Base de Datos (Supabase)

- Backups automáticos diarios (Supabase Pro)
- Antes de migraciones críticas: backup manual
- Point-in-time recovery disponible

### Código

- Git como source of truth
- Branches protegidas (`main`, `develop`)
- Tags para releases: `v1.0.0`

---

## Checklist Pre-Deploy

Antes de deployar a producción:

- [ ] Todas las credenciales rotadas a producción
- [ ] Secrets configurados en Railway/Vercel
- [ ] HTTPS habilitado
- [ ] Rate limiting configurado
- [ ] Helmet habilitado
- [ ] Logs de errores monitoreados (Sentry)
- [ ] Backup reciente de base de datos
- [ ] Tests pasando
- [ ] CI/CD green

---

## Reportar Vulnerabilidades

Si encuentras una vulnerabilidad de seguridad:

1. **NO** abrir un issue público
2. Contactar al equipo por email privado
3. Describir la vulnerabilidad y los pasos para reproducirla
4. Esperar confirmación antes de divulgar

---

## Recursos

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Next.js Security Headers](https://nextjs.org/docs/advanced-features/security-headers)
- [Supabase Security](https://supabase.com/docs/guides/platform/security)
