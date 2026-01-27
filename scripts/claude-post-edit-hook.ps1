# Hook de Claude Code - PowerShell version
# Se ejecuta después de editar archivos en Valplas E-commerce

$ErrorActionPreference = "Stop"

# Detectar el directorio raíz del proyecto (donde está este script)
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$PROJECT_ROOT = Split-Path -Parent $SCRIPT_DIR

Write-Host ""
Write-Host "🤖 Claude Post-Edit Hook - Valplas E-commerce" -ForegroundColor Blue
Write-Host "========================================" -ForegroundColor Blue
Write-Host "📁 Proyecto: $PROJECT_ROOT" -ForegroundColor Cyan
Write-Host ""

Set-Location $PROJECT_ROOT

# Verificar si hay cambios en git
$gitDiff = git diff 2>$null
$gitDiffCached = git diff --cached 2>$null

if (-not $gitDiff -and -not $gitDiffCached) {
  Write-Host "✅ No hay cambios para verificar" -ForegroundColor Green
  exit 0
}

Write-Host "📝 Cambios detectados, ejecutando verificaciones..." -ForegroundColor Yellow
Write-Host ""

# 1. Check secrets
Write-Host "🔒 Verificando secrets..." -ForegroundColor Blue
try {
  $secretsOutput = bun run check-secrets 2>&1
  if ($secretsOutput -match "ERROR") {
    Write-Host "❌ CRÍTICO: Posibles secrets detectados" -ForegroundColor Red
    Write-Host "⚠️  Claude debe revisar y eliminar secrets antes de continuar" -ForegroundColor Yellow
    exit 1
  }
  Write-Host "✅ No se detectaron secrets" -ForegroundColor Green
}
catch {
  Write-Host "❌ Error ejecutando check-secrets" -ForegroundColor Red
  exit 1
}
Write-Host ""

# 2. Type check
Write-Host "📝 Verificando tipos TypeScript..." -ForegroundColor Blue
try {
  $typecheckOutput = bun typecheck 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Errores de tipo encontrados" -ForegroundColor Red
    Write-Host "⚠️  Claude debe corregir errores de TypeScript" -ForegroundColor Yellow
    exit 1
  }
  Write-Host "✅ Type check pasó" -ForegroundColor Green
}
catch {
  Write-Host "❌ Error ejecutando typecheck" -ForegroundColor Red
  exit 1
}
Write-Host ""

# 3. Lint (con auto-fix)
Write-Host "🧹 Ejecutando lint..." -ForegroundColor Blue
$lintOutput = bun lint 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "⚠️  Errores de lint encontrados, intentando auto-fix..." -ForegroundColor Yellow

  try {
    bun run lint --fix 2>&1 | Out-Null
    Write-Host "✅ Lint auto-fix aplicado" -ForegroundColor Green

    # Verificar si quedan errores
    $lintCheckAgain = bun lint 2>&1
    if ($lintCheckAgain -match "error") {
      Write-Host "⚠️  Algunos errores no pudieron auto-fixearse" -ForegroundColor Yellow
      Write-Host "⚠️  Claude debe corregir manualmente" -ForegroundColor Yellow
      exit 1
    }
  }
  catch {
    Write-Host "❌ Auto-fix falló" -ForegroundColor Red
    exit 1
  }
}
else {
  Write-Host "✅ Lint pasó" -ForegroundColor Green
}
Write-Host ""

# 4. Format check
Write-Host "💅 Verificando formato..." -ForegroundColor Blue
$formatCheck = bun run format:check 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "⚠️  Formato incorrecto, aplicando auto-format..." -ForegroundColor Yellow

  try {
    bun run format 2>&1 | Out-Null
    Write-Host "✅ Formato aplicado" -ForegroundColor Green
  }
  catch {
    Write-Host "❌ Auto-format falló" -ForegroundColor Red
    exit 1
  }
}
else {
  Write-Host "✅ Formato correcto" -ForegroundColor Green
}
Write-Host ""

# Resumen final
Write-Host "========================================" -ForegroundColor Green
Write-Host "✅ Todas las verificaciones pasaron" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

exit 0
