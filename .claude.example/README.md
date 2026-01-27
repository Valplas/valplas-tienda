# Configuración de Claude Code para Valplas E-commerce

Esta carpeta contiene la configuración de ejemplo para Claude Code. Los hooks automatizan verificaciones de calidad cada vez que Claude modifica archivos.

## 🚀 Setup Rápido

### Paso 1: Copiar configuración

```bash
# Crear directorio .claude
mkdir -p .claude

# Copiar configuración de ejemplo
cp .claude.example/settings.json .claude/settings.json
```

### Paso 2: ¡Listo!

Los hooks se ejecutarán automáticamente cuando Claude use los tools `Edit` o `Write`.

## 🪝 Qué hacen los hooks

Después de cada edición/creación de archivo, Claude ejecutará automáticamente:

1. **🔒 Check Secrets** - Detecta credenciales hardcodeadas
2. **📝 Type Check** - Verifica tipos TypeScript
3. **🧹 Lint** - ESLint con auto-fix
4. **💅 Format** - Prettier con auto-format

Si alguna verificación falla, Claude lo verá y podrá corregir el problema.

## 📋 Ejemplo de salida

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
✅ Lint pasó

💅 Verificando formato...
✅ Formato correcto

========================================
✅ Todas las verificaciones pasaron
========================================
```

## 🎯 Beneficios

- **Calidad automática:** Cada cambio de Claude pasa por verificaciones
- **Auto-fix:** Lint y format se corrigen automáticamente cuando es posible
- **Seguridad:** Detecta secrets antes de commitear
- **Type safety:** Garantiza que el código compila

## 🔧 Personalizar

Edita `.claude/settings.json` para personalizar:

### Deshabilitar hook temporalmente

```json
{
  "hooks": {
    "afterToolUse": {}
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

### Solo en Edit (no en Write)

```json
{
  "hooks": {
    "afterToolUse": {
      "Edit": "powershell.exe -ExecutionPolicy Bypass -File ./scripts/claude-post-edit-hook.ps1"
    }
  }
}
```

## 📝 Nota Importante

El directorio `.claude/` está en `.gitignore` porque puede contener configuraciones personales. Cada desarrollador debe copiar la configuración de ejemplo manualmente.

## 🐛 Troubleshooting

### Hook no se ejecuta

1. Verificar que `.claude/settings.json` existe
2. Verificar que los scripts en `scripts/` tienen permisos de ejecución
3. Reiniciar Claude Code

### Hook falla con errores

Ver la salida en la terminal de Claude. Los errores comunes:

- **Secrets:** Usar `process.env.VARIABLE` en lugar de hardcodear
- **Type errors:** Corregir tipos en el código
- **Lint errors:** Algunos se auto-fixean, otros requieren corrección manual

### Ejecutar verificaciones manualmente

```bash
bun run check-secrets
bun typecheck
bun lint
bun lint --fix
bun format
```

## 📚 Más Información

- `docs/HOOKS_AND_CI.md` - Guía completa de hooks de Git y workflows CI/CD
- `.claude/README.md` - Documentación detallada (después de copiar)

---

**Setup:** Copia `.claude.example/settings.json` a `.claude/settings.json`
