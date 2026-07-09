import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Los tests comparten una DB real y el cleanup global corre tras cada test:
    // archivos en paralelo se pisan entre sí (races en users/orders). Secuencial.
    fileParallelism: false,
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/tests/', '**/*.d.ts', '**/*.config.*', '**/dist/**']
    },
    testTimeout: 10000
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
