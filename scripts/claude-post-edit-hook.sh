#!/usr/bin/env bash

# Hook de Claude Code - Se ejecuta después de editar archivos en Valplas E-commerce
# Verifica calidad de código automáticamente

set -e

COLORS_RED='\033[0;31m'
COLORS_YELLOW='\033[1;33m'
COLORS_GREEN='\033[0;32m'
COLORS_BLUE='\033[0;34m'
COLORS_CYAN='\033[0;36m'
COLORS_RESET='\033[0m'

# Detectar el directorio raíz del proyecto (donde está este script)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo ""
echo -e "${COLORS_BLUE}🤖 Claude Post-Edit Hook - Valplas E-commerce${COLORS_RESET}"
echo -e "${COLORS_BLUE}════════════════════════════════════════${COLORS_RESET}"
echo -e "${COLORS_CYAN}📁 Proyecto: $PROJECT_ROOT${COLORS_RESET}"
echo ""

cd "$PROJECT_ROOT" || exit 0

# Verificar si hay cambios en git
if ! git diff --quiet 2>/dev/null && ! git diff --cached --quiet 2>/dev/null; then
  echo -e "${COLORS_YELLOW}📝 Cambios detectados, ejecutando verificaciones...${COLORS_RESET}"
  echo ""
else
  echo -e "${COLORS_GREEN}✅ No hay cambios para verificar${COLORS_RESET}"
  exit 0
fi

# 1. Check secrets
echo -e "${COLORS_BLUE}🔒 Verificando secrets...${COLORS_RESET}"
if bun run check-secrets 2>&1 | grep -q "ERROR"; then
  echo -e "${COLORS_RED}❌ CRÍTICO: Posibles secrets detectados${COLORS_RESET}"
  echo -e "${COLORS_YELLOW}⚠️  Claude debe revisar y eliminar secrets antes de continuar${COLORS_RESET}"
  exit 1
else
  echo -e "${COLORS_GREEN}✅ No se detectaron secrets${COLORS_RESET}"
fi
echo ""

# 2. Type check
echo -e "${COLORS_BLUE}📝 Verificando tipos TypeScript...${COLORS_RESET}"
if ! bun typecheck 2>&1 | tail -5; then
  echo -e "${COLORS_RED}❌ Errores de tipo encontrados${COLORS_RESET}"
  echo -e "${COLORS_YELLOW}⚠️  Claude debe corregir errores de TypeScript${COLORS_RESET}"
  exit 1
else
  echo -e "${COLORS_GREEN}✅ Type check pasó${COLORS_RESET}"
fi
echo ""

# 3. Lint (con auto-fix)
echo -e "${COLORS_BLUE}🧹 Ejecutando lint...${COLORS_RESET}"
LINT_OUTPUT=$(bun lint 2>&1 || true)
LINT_EXIT_CODE=$?

if [ $LINT_EXIT_CODE -ne 0 ]; then
  echo -e "${COLORS_YELLOW}⚠️  Errores de lint encontrados, intentando auto-fix...${COLORS_RESET}"

  # Intentar auto-fix
  if bun run lint --fix 2>&1 | tail -5; then
    echo -e "${COLORS_GREEN}✅ Lint auto-fix aplicado${COLORS_RESET}"

    # Verificar si quedan errores
    if bun lint 2>&1 | grep -q "error"; then
      echo -e "${COLORS_YELLOW}⚠️  Algunos errores no pudieron auto-fixearse${COLORS_RESET}"
      echo -e "${COLORS_YELLOW}⚠️  Claude debe corregir manualmente${COLORS_RESET}"
      exit 1
    fi
  else
    echo -e "${COLORS_RED}❌ Auto-fix falló${COLORS_RESET}"
    exit 1
  fi
else
  echo -e "${COLORS_GREEN}✅ Lint pasó${COLORS_RESET}"
fi
echo ""

# 4. Format check
echo -e "${COLORS_BLUE}💅 Verificando formato...${COLORS_RESET}"
if ! bun run format:check 2>&1 | tail -5; then
  echo -e "${COLORS_YELLOW}⚠️  Formato incorrecto, aplicando auto-format...${COLORS_RESET}"

  if bun run format; then
    echo -e "${COLORS_GREEN}✅ Formato aplicado${COLORS_RESET}"
  else
    echo -e "${COLORS_RED}❌ Auto-format falló${COLORS_RESET}"
    exit 1
  fi
else
  echo -e "${COLORS_GREEN}✅ Formato correcto${COLORS_RESET}"
fi
echo ""

# Resumen final
echo -e "${COLORS_GREEN}════════════════════════════════════════${COLORS_RESET}"
echo -e "${COLORS_GREEN}✅ Todas las verificaciones pasaron${COLORS_RESET}"
echo -e "${COLORS_GREEN}════════════════════════════════════════${COLORS_RESET}"
echo ""

# Si llegamos aquí, todo está OK
exit 0
