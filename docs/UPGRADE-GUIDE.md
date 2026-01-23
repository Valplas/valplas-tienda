# Guía de Actualización de Dependencias - Valplas

**Última revisión:** 23 de Enero, 2026

## ✅ Actualizaciones Aplicadas (Sin Breaking Changes)

Las siguientes dependencias fueron actualizadas a sus últimas versiones estables:

### API (apps/api)

- ✅ **vitest**: `^2.1.8` → `^4.0.17`
- ✅ **eslint**: `^9.18.0` → `^9.39.2`

### Web (apps/web)

- ✅ **zustand**: `^5.0.2` → `^5.0.10`
- ✅ **lucide-react**: `^0.469.0` → `^0.562.0`
- ✅ **eslint**: `^9.18.0` → `^9.39.2`

### Instalación

```bash
cd valplas-tienda
bun install
```

---

## ⚠️ Actualizaciones Pendientes (Con Breaking Changes)

Las siguientes actualizaciones mayores están disponibles pero requieren cambios en el código:

### 1. Next.js 15 → 16 🔴 BREAKING CHANGES

**Versión actual:** `^15.1.4`
**Última disponible:** `^16.1.2`

#### Breaking Changes Principales:

- Cambios en el router y navegación
- Nuevas APIs de cache y revalidación
- Modificaciones en Server Actions
- Cambios en Middleware

#### Cómo Actualizar:

```bash
# Usar el CLI de actualización automática (recomendado)
npx @next/codemod@canary upgrade latest

# O manual
bun add next@latest react@latest react-dom@latest
```

#### Recursos:

- [Next.js 16 Release Notes](https://nextjs.org/blog/next-16)
- [Next.js 16 Migration Guide](https://nextjs.org/docs/app/guides/upgrading/version-16)

---

### 2. React 19.0 → 19.2 🟡 MINOR UPDATES

**Versión actual:** `^19.0.0`
**Última disponible:** `^19.2.0`

#### Nuevas Features en 19.2:

- ✨ `Activity` component (hide/restore UI state)
- ✨ `useEffectEvent` hook
- 🚀 Mejoras de performance en Suspense
- 🔧 Mejoras en Chrome DevTools

#### Cómo Actualizar:

```bash
bun add react@^19.2.0 react-dom@^19.2.0
```

Luego actualizar `@types/react` y `@types/react-dom`:

```bash
bun add -D @types/react@^19.2.0 @types/react-dom@^19.2.0
```

#### Compatibilidad:

- ✅ Compatible con Next.js 16
- ✅ Sin breaking changes desde 19.0

#### Recursos:

- [React 19.2 Release Notes](https://react.dev/blog/2025/10/01/react-19-2)

---

### 3. Tailwind CSS 3 → 4 🔴 MAJOR BREAKING CHANGES

**Versión actual:** `^3.4.17`
**Última disponible:** `^4.1.18`

#### Breaking Changes Principales:

- 🚨 **Requiere navegadores modernos**: Safari 16.4+, Chrome 111+, Firefox 128+
- 🚨 Cambios en configuración (elimina `tailwind.config.js`)
- 🚨 Nuevas opciones de importación CSS
- 🚨 Plugins actualizados

#### Beneficios:

- 🚀 Builds hasta 5x más rápidos
- 🚀 Incremental builds 100x más rápidos
- ✨ Cero configuración requerida
- ✨ Auto-detección de contenido
- ✨ Plugin de Vite first-party

#### Cómo Actualizar:

```bash
# Instalar Tailwind v4
bun add tailwindcss@next @tailwindcss/postcss@next

# Actualizar postcss.config
# Cambiar a nuevo formato
```

**⚠️ IMPORTANTE:** Esta actualización requiere testing extensivo debido a cambios en la configuración.

#### Recursos:

- [Tailwind CSS v4 Release Notes](https://tailwindcss.com/blog/tailwindcss-v4)
- [Tailwind CSS v4 Upgrade Guide](https://tailwindcss.com/docs/upgrade-guide)

---

### 4. Zod 3 → 4 🟡 MINOR BREAKING CHANGES

**Versión actual:** `^3.24.1`
**Última disponible:** `^4.3.5`

#### Breaking Changes:

- Algunos cambios en comportamiento de validación
- Mejoras en inferencia de tipos TypeScript
- Nuevas utilidades y métodos

#### Cómo Actualizar:

```bash
# API
cd apps/api
bun add zod@^4.3.5

# Web
cd apps/web
bun add zod@^4.3.5

# Shared
cd packages/shared
bun add zod@^4.3.5
```

#### Testing:

Ejecutar tests después de actualizar para verificar que las validaciones funcionan correctamente:

```bash
bun test
```

#### Recursos:

- [Zod v4 Release Notes](https://zod.dev/v4)

---

### 5. TypeScript 5.7 → 5.9 🟢 SAFE UPDATE

**Versión actual:** `^5.7.2`
**Última disponible:** `^5.9.3`

#### Cómo Actualizar:

```bash
# En la raíz del proyecto
bun add -D typescript@^5.9.3

# O en cada workspace
bun add -D typescript@^5.9.3 --filter @valplas/api
bun add -D typescript@^5.9.3 --filter @valplas/web
bun add -D typescript@^5.9.3 --filter @valplas/shared
```

#### Nota sobre TypeScript 7:

TypeScript 7 está en desarrollo (preview disponible como `@typescript/native-preview`) pero aún no es estable para producción.

---

## 📋 Plan de Actualización Recomendado

### Fase 1: Actualizaciones Seguras (Ya aplicadas ✅)

- ✅ Vitest 2 → 4
- ✅ ESLint minor updates
- ✅ Zustand 5.0.2 → 5.0.10
- ✅ Lucide-react

### Fase 2: Actualizaciones Menores (Recomendado hacer próximamente)

1. **TypeScript**: 5.7 → 5.9 (bajo riesgo)
2. **React**: 19.0 → 19.2 (nuevas features, sin breaking changes)
3. **Zod**: 3.24 → 4.3 (testing requerido)

### Fase 3: Actualizaciones Mayores (Planificar cuidadosamente)

1. **Next.js**: 15 → 16 (requiere migration, usar codemod)
2. **Tailwind CSS**: 3 → 4 (requiere reconfiguración y testing extensivo)

---

## 🧪 Testing Después de Actualizar

### 1. Type Check

```bash
bun typecheck
```

### 2. Lint

```bash
bun lint
```

### 3. Tests

```bash
bun test
```

### 4. Build

```bash
bun build
```

### 5. Pruebas Manuales

- Verificar que el frontend carga correctamente
- Probar flujos críticos (auth, checkout, admin)
- Verificar estilos (especialmente si actualizas Tailwind)

---

## 🔄 Proceso de Actualización

1. **Crear branch de actualización:**

   ```bash
   git checkout -b chore/update-dependencies
   ```

2. **Actualizar dependencias:**

   ```bash
   bun add <package>@latest
   ```

3. **Ejecutar tests:**

   ```bash
   bun test
   bun typecheck
   bun lint
   bun build
   ```

4. **Commit cambios:**

   ```bash
   git add .
   git commit -m "chore(deps): update dependencies to latest versions"
   ```

5. **Crear PR y esperar CI:**
   - GitHub Actions ejecutará todos los checks
   - Revisar logs de CI cuidadosamente

6. **Deploy a staging:**
   - Probar exhaustivamente en staging
   - Verificar que no haya regresiones

7. **Merge y deploy a producción**

---

## 📚 Recursos Adicionales

- [Next.js](https://www.npmjs.com/package/next)
- [React Releases](https://github.com/facebook/react/releases)
- [TypeScript Releases](https://github.com/microsoft/typescript/releases)
- [Tailwind CSS](https://tailwindcss.com/blog)
- [Zod](https://zod.dev/)
- [Vitest](https://github.com/vitest-dev/vitest/releases)
- [ESLint](https://github.com/eslint/eslint/releases)

---

## ⚠️ Notas Importantes

1. **Siempre hacer backup** antes de actualizaciones mayores
2. **Leer release notes** de cada paquete antes de actualizar
3. **Actualizar en staging primero**, nunca directo a producción
4. **Monitorear errores** después del deploy (Sentry)
5. **Tener plan de rollback** listo

---

**Última actualización de versiones:** 23 de Enero, 2026
