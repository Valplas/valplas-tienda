import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
  // Ignorar archivos compilados y dependencies
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '*.config.js']
  },

  // Configuración base para todos los archivos
  js.configs.recommended,

  // Configuración para archivos TypeScript
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
        // project: './tsconfig.json' - Removido para mejorar performance
        // Solo habilitar si usas reglas que requieren type information
      },
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      // TypeScript recommended rules
      ...tsPlugin.configs.recommended.rules,

      // Reglas personalizadas para el proyecto
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ],
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // Node.js / Express best practices
      'no-console': 'off', // Permitir console.log en backend
      'no-process-env': 'off', // process.env es necesario
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'quote-props': ['error', 'as-needed'],

      // Seguridad
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',

      // Estilo de código
      semi: ['error', 'always'],
      quotes: ['error', 'single', { avoidEscape: true }],
      'comma-dangle': ['error', 'never'],
      'arrow-parens': ['error', 'always']
    }
  }
];
