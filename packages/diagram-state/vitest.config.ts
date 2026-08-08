import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const from = (relative: string) => new URL(relative, import.meta.url).pathname;

export default defineConfig({
  root,
  cacheDir: '../../node_modules/.vite/packages/diagram-state',
  plugins: [react()],
  resolve: {
    alias: {
      '@': from('./src'),
      '@archidea-ai/mermaid-core': from('../core/src/index.ts'),
      '@archidea-ai/mermaid-scenario': from('../scenario/src/index.ts'),
      '@archidea-ai/mermaid-diagram-sequence': from('../diagram-sequence/src/index.ts'),
      '@archidea-ai/mermaid-react': from('../react/src/index.ts'),
    },
  },
  test: {
    name: 'state',
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest-setup.ts'],
    include: ['src/**/*.spec.{ts,tsx}'],
    watch: false,
  },
});
