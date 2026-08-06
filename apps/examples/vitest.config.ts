import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const from = (relative: string) => new URL(relative, import.meta.url).pathname;

export default defineConfig({
  root,
  cacheDir: '../../node_modules/.vite/apps/examples',
  plugins: [react()],
  resolve: {
    alias: {
      '@archidea-ai/mermaid/react': from('../../packages/mermaid/src/react.ts'),
      '@archidea-ai/mermaid/registry': from('../../packages/mermaid/src/registry.ts'),
      '@archidea-ai/mermaid': from('../../packages/mermaid/src/index.ts'),
      '@archidea-ai/mermaid-diagram-sequence': from('../../packages/diagram-sequence/src/index.ts'),
      '@archidea-ai/mermaid-react': from('../../packages/react/src/index.ts'),
      '@archidea-ai/mermaid-core': from('../../packages/core/src/index.ts'),
    },
  },
  test: {
    name: 'examples',
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.{ts,tsx}'],
    watch: false,
  },
});
