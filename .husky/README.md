# Git Hooks con Husky

Este directorio contiene los hooks de Git configurados con Husky para mantener la calidad del código y prevenir errores antes de commits y pushes.

## Hooks Configurados

### pre-commit

Se ejecuta **antes de cada commit**:

- ✅ Verifica que no haya secrets (API keys, tokens, passwords)
- ✅ Verifica que no se commiteen archivos .env o credenciales
- ✅ Ejecuta lint-staged (prettier + eslint en archivos modificados)

### commit-msg

Se ejecuta **al crear el mensaje de commit**:

- ✅ Verifica formato de Conventional Commits
- ✅ Asegura que el mensaje tenga mínimo 10 caracteres

### pre-push

Se ejecuta **antes de cada push**:

- ✅ Type check completo (TypeScript)
- ✅ Lint completo
- ✅ Build completo (asegura que compila)

## Formato de Commits (Conventional Commits)

```
tipo(scope): descripción

[cuerpo opcional]

[footer opcional]
```

### Tipos permitidos:

- `feat`: Nueva funcionalidad
- `fix`: Corrección de bug
- `docs`: Cambios en documentación
- `style`: Formato (no afecta lógica)
- `refactor`: Refactorización
- `test`: Tests
- `chore`: Mantenimiento (deps, config)
- `perf`: Mejoras de performance
- `ci`: Cambios en CI/CD
- `build`: Build system
- `revert`: Revertir commit

### Ejemplos:

```bash
git commit -m "feat(products): add filter by category"
git commit -m "fix(auth): resolve token expiration issue"
git commit -m "docs: update README with setup instructions"
git commit -m "chore(deps): update dependencies"
```

## Saltarse Hooks (solo en emergencias)

```bash
# Saltar pre-commit (NO RECOMENDADO)
git commit --no-verify -m "mensaje"

# Saltar pre-push (NO RECOMENDADO)
git push --no-verify
```

⚠️ **IMPORTANTE:** Solo usar `--no-verify` en casos de emergencia y con extrema precaución. Los hooks existen para prevenir errores críticos.

## Troubleshooting

### Hook falla pero creo que es un falso positivo

1. **Pre-commit (secrets)**: Verifica que uses `process.env.VARIABLE` o valores placeholder como "dummy", "test"
2. **Lint**: Ejecuta `bun lint:fix` para auto-corregir
3. **Type check**: Ejecuta `bun typecheck` y corrige los errores

### Hook no se ejecuta

```bash
# Reinstalar hooks
rm -rf .husky
bun install
```

### Permisos en Linux/Mac

```bash
chmod +x .husky/pre-commit
chmod +x .husky/pre-push
chmod +x .husky/commit-msg
```
