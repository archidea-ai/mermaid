import { defineConfig } from 'vitest/config';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  cacheDir: '../../node_modules/.vite/packages/core',
  test: {
    name: 'core',
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    watch: false,
  },
});
