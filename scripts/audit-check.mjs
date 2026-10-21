#!/usr/bin/env node
/**
 * Gate ESTRICTO de auditoría de dependencias para CI.
 *
 * Corre `bun audit --json` y falla (exit 1) ante CUALQUIER advisory que no esté
 * en el allowlist de abajo. Bun no soporta `--ignore` ni nested overrides, así que
 * el allowlist se implementa acá a mano.
 *
 * ALLOWLIST — solo advisories de ReDoS / process-hang en librerías de glob
 * (minimatch, brace-expansion, picomatch) que llegan EXCLUSIVAMENTE por tooling de
 * build/dev (swagger-jsdoc → glob@7, micromatch, etc.). En el árbol conviven la
 * línea mayor vieja (vulnerable) y una moderna (parcheada); bun no puede pinnear
 * solo la vieja sin romper la moderna (sin nested overrides). No son alcanzables
 * por input de un atacante en producción: los patrones glob son rutas hardcodeadas.
 * Revisar y ACHICAR este allowlist cuando las herramientas actualicen sus deps
 * (Dependabot abre los PRs). Cualquier vuln NUEVA o de otro paquete frena el merge.
 */

import { execFileSync } from 'node:child_process';

/** GHSA permitidos → justificación. */
const ALLOW = new Map([
  ['GHSA-f886-m6hf-6m8v', 'brace-expansion: process hang — solo glob de build tooling'],
  ['GHSA-3ppc-4f35-3m26', 'minimatch: ReDoS — solo glob de build tooling'],
  ['GHSA-7r86-cg39-jmmj', 'minimatch: ReDoS — solo glob de build tooling'],
  ['GHSA-23c5-xmqv-rm74', 'minimatch: ReDoS — solo glob de build tooling'],
  ['GHSA-3v7f-55p6-f55p', 'picomatch: glob matching — solo build tooling'],
  ['GHSA-c2c7-rcm5-vvqj', 'picomatch: ReDoS — solo build tooling'],
  // brace-expansion 1.x/2.x/5.x conviven (minimatch 3/9/10): bun no permite
  // override por major. Llega por eslint/typescript-eslint/lint-staged y, en
  // runtime, por swagger-jsdoc → glob@7 con el patrón fijo de config/swagger.ts.
  ['GHSA-mh99-v99m-4gvg', 'brace-expansion: DoS por longitud — solo globs hardcodeados'],
  ['GHSA-rgw5-rvv9-x895', 'brace-expansion: DoS arrays intermedios — solo globs hardcodeados'],
  ['GHSA-3jxr-9vmj-r5cp', 'brace-expansion: DoS grupos {} — solo globs hardcodeados'],
  ['GHSA-qhr7-859c-m2p7', 'brace-expansion: recursión anidada — solo globs hardcodeados'],
  ['GHSA-6j4f-fj2g-mc7p', 'brace-expansion: recursión parseCommaParts — solo globs hardcodeados'],
  ['GHSA-q2hr-2g5m-vwhr', 'brace-expansion: tiempo cuadrático — solo globs hardcodeados'],
  // braces 3.0.3 es la última versión publicada (sin fix). Llega solo por
  // micromatch de tooling: tsc-alias (build), eslint-config-next, lint-staged.
  ['GHSA-vfj7-8cjw-p6xm', 'braces: stack exhaustion — sin fix publicado, solo build tooling']
]);

let raw = '';
try {
  // Comando literal sin input de usuario; execFileSync (sin shell) por las dudas.
  raw = execFileSync('bun', ['audit', '--json'], { encoding: 'utf8' });
} catch (e) {
  // bun audit sale != 0 cuando hay vulnerabilidades; el JSON igual va a stdout.
  raw = e.stdout?.toString() ?? '';
}

if (!raw.trim()) {
  console.log('✅ bun audit: sin vulnerabilidades.');
  process.exit(0);
}

let report;
try {
  report = JSON.parse(raw);
} catch {
  console.error('❌ No se pudo parsear la salida de `bun audit --json`:');
  console.error(raw.slice(0, 500));
  process.exit(1);
}

// Formato: { "<paquete>": [ { url, title, severity, ... }, ... ], ... }
const blocking = [];
const ignored = [];
for (const [pkg, advisories] of Object.entries(report)) {
  if (!Array.isArray(advisories)) continue;
  for (const a of advisories) {
    const ghsa = String(a.url ?? '').split('/').pop();
    if (ALLOW.has(ghsa)) ignored.push({ pkg, ghsa, severity: a.severity });
    else blocking.push({ pkg, ghsa, severity: a.severity, title: a.title });
  }
}

for (const a of ignored) {
  console.log(`🟡 allowlist: ${a.pkg} (${a.severity}) ${a.ghsa}`);
}

if (blocking.length > 0) {
  console.error(`\n❌ ${blocking.length} vulnerabilidad(es) bloqueante(s):`);
  for (const a of blocking) {
    console.error(`  - ${a.pkg} (${a.severity}) ${a.ghsa} — ${a.title}`);
  }
  console.error(
    '\nArreglá con `bun update` u `overrides` en package.json.\n' +
      'Si es inevitable y de tooling dev/build, sumá el GHSA al allowlist en scripts/audit-check.mjs con justificación.'
  );
  process.exit(1);
}

console.log(`\n✅ Audit OK: ${ignored.length} advisory(s) en allowlist (tooling dev/build), 0 bloqueantes.`);
process.exit(0);
