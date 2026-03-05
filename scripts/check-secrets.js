#!/usr/bin/env node

/**
 * Script para detectar posibles secrets en archivos staged
 * Se ejecuta como pre-commit hook
 */

import { execSync } from 'child_process';

const COLORS = {
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  reset: '\x1b[0m'
};

const PATTERNS = [
  // API Keys
  {
    pattern: /(api[_-]?key|apikey)[\s]*[=:][\s]*['"][a-zA-Z0-9_-]{20,}/gi,
    message: 'Posible API Key'
  },

  // Tokens
  {
    pattern: /(token|auth[_-]?token)[\s]*[=:][\s]*['"][a-zA-Z0-9_\-.]{20,}/gi,
    message: 'Posible Token'
  },

  // AWS Keys
  { pattern: /AKIA[0-9A-Z]{16}/g, message: 'AWS Access Key' },

  // Private Keys
  { pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE KEY-----/gi, message: 'Private Key' },

  // Generic secrets (más permisivo)
  {
    pattern: /(secret|password|passwd|pwd)[\s]*[=:][\s]*['"][^'"]{8,}/gi,
    message: 'Posible Secret/Password'
  },

  // JWT Tokens
  { pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, message: 'JWT Token' },

  // Mercado Pago
  { pattern: /(APP|TEST)-\d{13,16}-\d{6,8}-[a-f0-9]{32}/gi, message: 'Mercado Pago Token' },

  // Supabase
  {
    pattern: /eyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/g,
    message: 'Supabase JWT/Service Key'
  },

  // Resend API Key
  { pattern: /re_[a-zA-Z0-9]{24,}/g, message: 'Resend API Key' },

  // Stripe Keys
  {
    pattern: /(sk|pk)_(live|test)_[a-zA-Z0-9]{24,}/g,
    message: 'Stripe API Key'
  },

  // Google API Keys
  { pattern: /AIza[a-zA-Z0-9_-]{35}/g, message: 'Google API Key' },

  // Generic high-entropy strings (potential secrets)
  {
    pattern: /['"][a-zA-Z0-9+/]{32,}={0,2}['"]/g,
    message: 'Potential Base64 Secret'
  }
];

const ALLOWED_PATTERNS = [
  /process\.env\./,
  /\.env\.example/,
  /NEXT_PUBLIC_/,
  /dummy/i,
  /test/i,
  /example/i,
  /placeholder/i,
  /ci-test/i,
  /\$\{[^}]+\}/, // Variables con ${VAR}
  /DATABASE_URL.*dummy/i, // URLs de test con dummy
  /JWT_SECRET.*test/i, // Secrets de test
  /localhost:\d+/, // URLs locales
  /127\.0\.0\.1:\d+/, // IPs locales
  /mock/i, // Valores mock
  /fake[_-]/i, // Funciones fake_
  /pattern:/i, // Definiciones de patterns (este mismo archivo)
  /COLORS\./i, // Constantes de colores
  /message:/i, // Mensajes descriptivos
  /['"]xxx['"]/i, // Placeholder obvio
  /SECRET_KEY}/i, // Template variables ${SECRET_KEY}
  /API_KEY}/i, // Template variables ${API_KEY}
  /\/\*/i, // Comentarios
  /\*\//i // Comentarios
];

function getStagedFiles() {
  try {
    const output = execSync('git diff --cached --name-only --diff-filter=ACM', {
      encoding: 'utf-8'
    });
    return output
      .split('\n')
      .filter((file) => file.trim())
      .filter(
        (file) =>
          file.match(/\.(ts|tsx|js|jsx|json|env)$/) &&
          !file.includes('node_modules') &&
          !file.includes('.env.example') &&
          !file.includes('.test.') &&
          !file.includes('.spec.') &&
          !file.includes('/tests/')
      );
  } catch (error) {
    console.error(`${COLORS.red}Error obteniendo archivos staged${COLORS.reset}`);

    console.error(error);
    return [];
  }
}

function checkFileForSecrets(file) {
  try {
    const content = execSync(`git show :${file}`, { encoding: 'utf-8' });
    const issues = [];

    for (const { pattern, message } of PATTERNS) {
      const matches = content.matchAll(pattern);

      for (const match of matches) {
        const matchedText = match[0];

        // Verificar si coincide con patrones permitidos
        const isAllowed = ALLOWED_PATTERNS.some(
          (allowedPattern) =>
            allowedPattern.test(matchedText) ||
            allowedPattern.test(content.substring(Math.max(0, match.index - 50), match.index + 50))
        );

        if (!isAllowed) {
          // Obtener número de línea
          const lineNumber = content.substring(0, match.index).split('\n').length;

          issues.push({
            file,
            line: lineNumber,
            message,
            preview: matchedText.substring(0, 50) + (matchedText.length > 50 ? '...' : '')
          });
        }
      }
    }

    return issues;
  } catch (error) {
    console.error(error);
    return [];
  }
}

function checkForEnvFiles() {
  try {
    const output = execSync('git diff --cached --name-only', { encoding: 'utf-8' });
    const envFiles = output
      .split('\n')
      .filter((file) => file.match(/\.env$|\.env\.local$|\.env\.production$/));

    if (envFiles.length > 0) {
      console.error(`\n${COLORS.red}❌ ERROR: Intentando commitear archivos .env${COLORS.reset}`);
      envFiles.forEach((file) => console.error(`   ${file}`));
      console.error(`\n${COLORS.yellow}Los archivos .env NO deben commitearse.${COLORS.reset}`);
      console.error(`Usa .env.example para documentar las variables necesarias.\n`);
      return false;
    }
  } catch (error) {
    console.error(error);
  }
  return true;
}

function checkForCredentialFiles() {
  try {
    const output = execSync('git diff --cached --name-only', { encoding: 'utf-8' });

    // Archivos permitidos que contienen "secrets" en su nombre
    const allowedFiles = [
      'scripts/check-secrets.js',
      'docs/SECURITY.md',
      '.github/workflows/ci.yml',
      '.github/workflows/pr-checks.yml',
      'CLAUDE.md'
    ];

    const credentialFiles = output.split('\n').filter((file) => {
      // Filtrar archivos que coinciden con patrones de credenciales
      if (!file.match(/credentials\.json|secrets\.|\.pem$|\.key$|\.cert$|\.p12$/)) {
        return false;
      }

      // Excluir archivos permitidos
      return !allowedFiles.includes(file);
    });

    if (credentialFiles.length > 0) {
      console.error(
        `\n${COLORS.red}❌ ERROR: Intentando commitear archivos de credenciales${COLORS.reset}`
      );
      credentialFiles.forEach((file) => console.error(`   ${file}`));
      console.error(
        `\n${COLORS.yellow}Los archivos de credenciales NO deben commitearse.${COLORS.reset}\n`
      );
      return false;
    }
  } catch (error) {
    console.error(error);
  }
  return true;
}

function main() {
  console.log(`\n🔍 Verificando secrets en archivos staged...\n`);

  // Verificar archivos .env
  if (!checkForEnvFiles()) {
    process.exit(1);
  }

  // Verificar archivos de credenciales
  if (!checkForCredentialFiles()) {
    process.exit(1);
  }

  // Verificar contenido de archivos
  const stagedFiles = getStagedFiles();

  if (stagedFiles.length === 0) {
    console.log(`${COLORS.green}✅ No hay archivos relevantes para verificar${COLORS.reset}\n`);
    process.exit(0);
  }

  let allIssues = [];

  for (const file of stagedFiles) {
    const issues = checkFileForSecrets(file);
    allIssues = allIssues.concat(issues);
  }

  if (allIssues.length > 0) {
    console.error(
      `${COLORS.red}❌ ERROR: Posibles secrets detectados en el código:${COLORS.reset}\n`
    );

    allIssues.forEach(({ file, line, message, preview }) => {
      console.error(`${COLORS.yellow}${file}:${line}${COLORS.reset}`);
      console.error(`  ${message}`);
      console.error(`  ${COLORS.red}${preview}${COLORS.reset}\n`);
    });

    console.error(`${COLORS.red}❌ Commit bloqueado por seguridad.${COLORS.reset}`);
    console.error(`\nSi estos NO son secrets reales:`);
    console.error(`  1. Verifica que uses process.env.VARIABLE_NAME`);
    console.error(`  2. Usa valores placeholder como "dummy", "test", "example"`);
    console.error(`  3. Si es un false positive, puedes usar --no-verify (con precaución)\n`);

    process.exit(1);
  }

  console.log(
    `${COLORS.green}✅ No se detectaron secrets. Seguro para commitear.${COLORS.reset}\n`
  );
  process.exit(0);
}

main();
