# Claude Code - Configuración del Proyecto

Este directorio contiene la configuración específica de Claude Code para el proyecto Valplas E-commerce.

## 🪝 Hook Post-Edit

El hook `afterToolUse` se ejecuta automáticamente después de que Claude edita o crea archivos.

### Qué hace el hook:

1. **🔒 Check Secrets** - Detecta API keys, tokens, passwords hardcodeados
2. **📝 Type Check** - Verifica tipos TypeScript en todo el monorepo
3. **🧹 Lint** - Ejecuta ESLint (con auto-fix si es posible)
4. **💅 Format** - Verifica y aplica formato con Prettier

### Flujo:

```
Claude usa Edit/Write tool
         ↓
Hook se ejecuta automáticamente
         ↓
┌─ ✅ Check secrets
├─ ✅ Type check
├─ ✅ Lint (auto-fix si es posible)
└─ ✅ Format (auto-format si es necesario)
         ↓
Claude ve el resultado y puede corregir si falla
```

### Configuración:

**Archivo:** `.claude/settings.json`

```json
{
  "hooks": {
    "afterToolUse": {
      "Edit": "powershell.exe -ExecutionPolicy Bypass -File ./scripts/claude-post-edit-hook.ps1",
      "Write": "powershell.exe -ExecutionPolicy Bypass -File ./scripts/claude-post-edit-hook.ps1"
    }
  }
}
```

### Scripts:

- **PowerShell:** `scripts/claude-post-edit-hook.ps1` (Windows)
- **Bash:** `scripts/claude-post-edit-hook.sh` (Linux/macOS)

### Deshabilitar temporalmente:

Si necesitás deshabilitar el hook temporalmente:

```json
{
  "hooks": {
    "afterToolUse": {}
  }
}
```

O renombrar el archivo:

```bash
mv .claude/settings.json .claude/settings.json.disabled
```

### Testear manualmente:

```bash
# PowerShell
powershell.exe -ExecutionPolicy Bypass -File ./scripts/claude-post-edit-hook.ps1

# Bash
./scripts/claude-post-edit-hook.sh
```

## 📁 Contenido del directorio

- `settings.json` - Configuración de Claude Code (hooks, preferencias)
- `README.md` - Esta documentación

## 🚫 .gitignore

Este directorio está en `.gitignore` porque puede contener configuraciones personales del usuario que no deben commitearse.

Para compartir la configuración con el equipo, crear un `.claude.example/` con la configuración base.

## 📚 Documentación

Para más detalles sobre hooks y CI/CD, ver:

- `docs/HOOKS_AND_CI.md` - Guía completa de hooks de Git y workflows

## 🔧 Troubleshooting

### El hook no se ejecuta

1. Verificar que el archivo `settings.json` existe
2. Verificar que los scripts tienen permisos de ejecución
3. Reiniciar Claude Code

### El hook falla

Ver la salida del hook en la terminal de Claude Code. Los errores más comunes:

- **Secrets detectados:** Revisar y usar `process.env.VARIABLE`
- **Type errors:** Corregir tipos TypeScript
- **Lint errors:** Algunos pueden auto-fixearse, otros requieren corrección manual

### Ejecutar verificaciones manualmente

```bash
bun run check-secrets
bun typecheck
bun lint
bun lint --fix
bun format
```

---

**Última actualización:** 26 de enero de 2026
