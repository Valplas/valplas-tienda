import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
  // Ignorar directorios comunes
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/bun.lock',
      '*.config.js',
      '*.config.mjs'
    ]
  },

  // Configuración base para todos los archivos JS/TS
  js.configs.recommended,

  // Configuración para archivos TypeScript
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      globals: {
        ...globals.node,
        ...globals.es2021,
        ...globals.browser
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      // TypeScript recommended rules
      ...tsPlugin.configs.recommended.rules,

      // Reglas generales del monorepo
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ],

      // Buenas prácticas
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'warn',
      'no-console': 'off'
    }
  },

  // Configuración para archivos JavaScript (config files, scripts)
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    },
    rules: {
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error'
    }
  }
];
