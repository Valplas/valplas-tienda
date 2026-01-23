#!/bin/bash

# Script para configurar Husky y git hooks
# Se ejecuta automáticamente después de `bun install` (via prepare script)

echo "🪝 Configurando Git hooks con Husky..."

# Verificar que estamos en un repo git
if [ ! -d .git ]; then
  echo "⚠️ No es un repositorio Git. Saltando configuración de hooks."
  exit 0
fi

# Inicializar Husky
echo "📦 Inicializando Husky..."
bunx husky init

# Dar permisos de ejecución a los hooks (Linux/Mac)
if [ "$(uname)" != "MINGW64_NT" ]; then
  echo "🔧 Configurando permisos de hooks..."
  chmod +x .husky/pre-commit
  chmod +x .husky/pre-push
  chmod +x .husky/commit-msg
fi

# Verificar instalación
if [ -d .husky/_/husky.sh ]; then
  echo "✅ Husky configurado correctamente"
else
  echo "⚠️ Husky podría no estar configurado correctamente"
fi

echo ""
echo "Git hooks configurados:"
echo "  ✓ pre-commit: Verifica secrets y ejecuta lint"
echo "  ✓ commit-msg: Valida formato Conventional Commits"
echo "  ✓ pre-push: Type check, lint y build"
echo ""
echo "Para más información: cat .husky/README.md"
