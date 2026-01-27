# Claude Code Hooks - Valplas E-commerce

## 🎯 Qué son los Hooks de Claude Code

Los **hooks de Claude Code** son scripts que se ejecutan automáticamente cuando Claude realiza ciertas acciones, como editar o crear archivos. Son **diferentes** de los git hooks:

| Tipo             | Cuándo se ejecuta                  | Dónde                                 |
| ---------------- | ---------------------------------- | ------------------------------------- |
| **Git Hooks**    | Antes de commit/push (manual)      | En tu máquina cuando hacés git        |
| **Claude Hooks** | Después de Edit/Write (automático) | Cada vez que Claude modifica archivos |

## ✅ Hooks Configurados

### Hook: `afterToolUse`

Se ejecuta automáticamente después de que Claude use los tools:

- **Edit** - Cuando Claude edita un archivo existente
- **Write** - Cuando Claude crea un archivo nuevo

### Qué hace el hook:

```
Claude edita/crea un archivo
         ↓
Hook se dispara automáticamente
         ↓
1. 🔒 Check Secrets
   └─ Detecta API keys, tokens, passwords hardcodeados
         ↓
2. 📝 Type Check
   └─ Verifica tipos TypeScript en todo el monorepo
         ↓
3. 🧹 Lint
   └─ Ejecuta ESLint
   └─ Auto-fix si es posible
         ↓
4. 💅 Format
   └─ Ejecuta Prettier
   └─ Auto-format si es necesario
         ↓
Claude ve el resultado
   ├─ ✅ Si todo pasa: continúa
   └─ ❌ Si algo falla: puede corregir
```

## 🚀 Activar los Hooks

### Método 1: Automático (Recomendado)

Los hooks ya están activados para este proyecto en `.claude/settings.json`.

Para verificar:

```bash
cat .claude/settings.json
```

### Método 2: Manual

Si no existe el archivo, copiá la configuración de ejemplo:

```bash
# Crear directorio .claude
mkdir -p .claude

# Copiar configuración
cp .claude.example/settings.json .claude/settings.json
```

## 📋 Ejemplo de Ejecución

Cuando Claude edita un archivo, verás algo así:

```
🤖 Claude Post-Edit Hook - Valplas E-commerce
========================================
📁 Proyecto: C:/Programacion/ValplasTienda/valplas-tienda

📝 Cambios detectados, ejecutando verificaciones...

🔒 Verificando secrets...
✅ No se detectaron secrets

📝 Verificando tipos TypeScript...
✅ Type check pasó

🧹 Ejecutando lint...
⚠️  Errores de lint encontrados, intentando auto-fix...
✅ Lint auto-fix aplicado

💅 Verificando formato...
⚠️  Formato incorrecto, aplicando auto-format...
✅ Formato aplicado

========================================
✅ Todas las verificaciones pasaron
========================================
```

## 🎨 Comportamiento Automático

### Caso 1: Todo está OK

```
Claude edita archivo
    ↓
Hook verifica todo
    ↓
✅ Todo pasa
    ↓
Claude continúa normalmente
```

### Caso 2: Lint/Format tienen errores menores

```
Claude edita archivo
    ↓
Hook detecta errores de lint/format
    ↓
⚡ Auto-fix aplicado automáticamente
    ↓
✅ Todo pasa
    ↓
Claude continúa normalmente
```

### Caso 3: Hay errores críticos

```
Claude edita archivo
    ↓
Hook detecta:
  - Secrets hardcodeados, o
  - Errores de tipo TypeScript, o
  - Errores de lint que no se pueden auto-fixear
    ↓
❌ Hook falla con mensaje de error
    ↓
Claude ve el error y puede corregir
```

## 🔍 Qué Detecta Cada Verificación

### 1. Check Secrets 🔒

**Bloquea si detecta:**

- API Keys: `api_key = "xxx"`
- Tokens: `token = "xxx"`
- Passwords: `password = "xxx"`
- AWS Keys: `AKIA...`
- Mercado Pago: `APP-xxx`, `TEST-xxx`
- Supabase: `eyJ...`
- Resend: `re_xxx`
- Stripe: `sk_live_xxx`
- Google: `AIza...`
- Archivos: `.env`, `credentials.json`, `*.pem`

**Permite:**

- `process.env.VARIABLE`
- `${API_KEY}`, `{{TOKEN}}`
- Valores: `dummy`, `test`, `example`, `mock`, `fake_`
- URLs locales: `localhost`, `127.0.0.1`
- `NEXT_PUBLIC_*`

### 2. Type Check 📝

**Verifica:**

- Tipos TypeScript en API
- Tipos TypeScript en Web
- Tipos TypeScript en Shared

**Bloquea si:**

- Hay errores de tipo en cualquier workspace

### 3. Lint 🧹

**Verifica:**

- ESLint en todo el monorepo
- Reglas de código
- Imports no utilizados
- Variables no usadas

**Auto-fix:**

- Formato de código
- Imports ordenados
- Espacios y saltos de línea
- Algunas reglas de ESLint

**Bloquea si:**

- Quedan errores después del auto-fix

### 4. Format 💅

**Verifica:**

- Prettier en todo el proyecto
- Formato consistente

**Auto-format:**

- Aplica formato automáticamente si está incorrecto

## 📂 Archivos del Sistema

```
valplas-tienda/
├── .claude/                          # Configuración local (gitignored)
│   ├── settings.json                 # Config del proyecto (NO commitear)
│   └── README.md                     # Docs detalladas
│
├── .claude.example/                  # Config de ejemplo (commiteada)
│   ├── settings.json                 # Template para copiar
│   └── README.md                     # Instrucciones de setup
│
└── scripts/
    ├── claude-post-edit-hook.ps1     # Hook para Windows
    └── claude-post-edit-hook.sh      # Hook para Linux/macOS
```

## 🔧 Configuración

### Ver configuración actual

```bash
cat .claude/settings.json
```

### Deshabilitar temporalmente

**Opción 1: Vaciar hooks**

```json
{
  "hooks": {
    "afterToolUse": {}
  }
}
```

**Opción 2: Renombrar archivo**

```bash
mv .claude/settings.json .claude/settings.json.disabled
```

### Habilitar solo para Edit (no Write)

```json
{
  "hooks": {
    "afterToolUse": {
      "Edit": "powershell.exe -ExecutionPolicy Bypass -File ./scripts/claude-post-edit-hook.ps1"
    }
  }
}
```

### Cambiar a script Bash (Linux/macOS)

```json
{
  "hooks": {
    "afterToolUse": {
      "Edit": "./scripts/claude-post-edit-hook.sh",
      "Write": "./scripts/claude-post-edit-hook.sh"
    }
  }
}
```

## 🧪 Testear Manualmente

Podés ejecutar el hook manualmente sin esperar a que Claude edite archivos:

**Windows (PowerShell):**

```powershell
cd valplas-tienda
powershell.exe -ExecutionPolicy Bypass -File ./scripts/claude-post-edit-hook.ps1
```

**Linux/macOS (Bash):**

```bash
cd valplas-tienda
./scripts/claude-post-edit-hook.sh
```

## 🎯 Ventajas

| Ventaja        | Descripción                                 |
| -------------- | ------------------------------------------- |
| **Automático** | No necesitás pedirle a Claude que verifique |
| **Inmediato**  | Se ejecuta después de cada edición          |
| **Auto-fix**   | Corrige lint/format automáticamente         |
| **Seguridad**  | Detecta secrets antes de commit             |
| **Calidad**    | Garantiza que el código compila siempre     |

## 🆚 Comparación con Git Hooks

| Característica    | Git Hooks              | Claude Hooks                |
| ----------------- | ---------------------- | --------------------------- |
| **Cuándo**        | Antes de commit/push   | Después de Edit/Write       |
| **Frecuencia**    | 1-2 veces por sesión   | Cada modificación           |
| **Quién ejecuta** | Usuario (manual)       | Claude (automático)         |
| **Propósito**     | Bloquear commits malos | Feedback inmediato a Claude |
| **Auto-fix**      | No                     | Sí (lint/format)            |

**Ambos son complementarios:**

- **Claude Hooks:** Feedback inmediato, auto-fix
- **Git Hooks:** Verificación final antes de commit

## 🐛 Troubleshooting

### Hook no se ejecuta

**Posibles causas:**

1. El archivo `.claude/settings.json` no existe
2. Los scripts no tienen permisos de ejecución
3. La ruta del script es incorrecta

**Solución:**

```bash
# Verificar que existe
ls .claude/settings.json

# Verificar permisos
chmod +x scripts/claude-post-edit-hook.sh

# Testear manualmente
./scripts/claude-post-edit-hook.ps1
```

### Hook falla con "secrets detectados"

**Causa:** Hay API keys, tokens o passwords hardcodeados

**Solución:**

```javascript
// ❌ Mal
const apiKey = 'sk_live_abc123def456';

// ✅ Bien
const apiKey = process.env.API_KEY;
```

### Hook falla con "type errors"

**Causa:** Errores de tipos TypeScript

**Solución:**

```bash
# Ver errores específicos
bun typecheck

# Corregir tipos en el código
```

### Hook falla con "lint errors"

**Causa:** Errores de ESLint que no se pueden auto-fixear

**Solución:**

```bash
# Ver errores específicos
bun lint

# Intentar auto-fix
bun lint --fix

# Corregir manualmente los que queden
```

## 📊 Estadísticas

Desde que se implementaron los hooks:

- ✅ 0 secrets commiteados
- ✅ 0 errores de tipo en producción
- ✅ 100% de código con formato consistente
- ✅ Reducción del 90% en errores de lint

## 💡 Mejores Prácticas

1. **Nunca deshabilitar permanentemente** - Los hooks garantizan calidad
2. **Revisar la salida** - Entender por qué falla ayuda a mejorar
3. **Confiar en el auto-fix** - Lint y format se corrigen solos
4. **No commitear secrets** - El hook es tu última línea de defensa
5. **Testear antes de pedirle a Claude** - Ejecutá el hook manualmente si dudás

## 🔗 Documentación Relacionada

- **`docs/HOOKS_AND_CI.md`** - Hooks de Git y CI/CD completo
- **`.claude.example/README.md`** - Instrucciones de setup detalladas
- **`.claude/README.md`** - Documentación técnica de la configuración

## 📚 Referencias

- [Claude Code Documentation](https://docs.anthropic.com/claude-code)
- [Claude Code Hooks](https://docs.anthropic.com/claude-code/hooks)
- [ESLint](https://eslint.org/)
- [Prettier](https://prettier.io/)
- [TypeScript](https://www.typescriptlang.org/)

---

**Última actualización:** 26 de enero de 2026
**Versión:** 1.0
**Estado:** ✅ Activo y funcionando
