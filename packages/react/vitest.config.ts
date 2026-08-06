import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  cacheDir: '../../node_modules/.vite/packages/react',
  plugins: [react()],
  resolve: {
    alias: {
      '@archidea-ai/mermaid-core': new URL('../core/src/index.ts', import.meta.url).pathname,
    },
  },
  test: {
    name: 'react',
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest-setup.ts'],
    include: ['src/**/*.spec.{ts,tsx}'],
    watch: false,
  },
});
