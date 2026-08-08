import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const from = (relative: string) => new URL(relative, import.meta.url).pathname;

export default defineConfig({
  root,
  cacheDir: '../../node_modules/.vite/packages/scenario',
  plugins: [react()],
  resolve: {
    alias: {
      '@': from('./src'),
      '@archidea-ai/mermaid-core': from('../core/src/index.ts'),
      '@archidea-ai/mermaid-react': from('../react/src/index.ts'),
    },
  },
  test: {
    name: 'scenario',
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest-setup.ts'],
    include: ['src/**/*.spec.{ts,tsx}'],
    watch: false,
  },
});
