import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const from = (relative: string) => new URL(relative, import.meta.url).pathname;

export default defineConfig({
  root,
  // The repository is archidea-ai/mermaid, so Pages serves from that subpath.
  base: '/mermaid/',
  cacheDir: '../../node_modules/.vite/apps/examples',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@archidea-ai/mermaid/react': from('../../packages/mermaid/src/react.ts'),
      '@archidea-ai/mermaid/registry': from('../../packages/mermaid/src/registry.ts'),
      '@archidea-ai/mermaid': from('../../packages/mermaid/src/index.ts'),
      '@archidea-ai/mermaid-diagram-sequence/theme.css': from(
        '../../packages/diagram-sequence/src/lib/theme.css',
      ),
      '@archidea-ai/mermaid-diagram-sequence': from('../../packages/diagram-sequence/src/index.ts'),
      '@archidea-ai/mermaid-diagram-state/state.css': from(
        '../../packages/diagram-state/src/lib/state.css',
      ),
      '@archidea-ai/mermaid-diagram-state': from('../../packages/diagram-state/src/index.ts'),
      '@archidea-ai/mermaid-scenario': from('../../packages/scenario/src/index.ts'),
      '@archidea-ai/mermaid-react': from('../../packages/react/src/index.ts'),
      '@archidea-ai/mermaid-core': from('../../packages/core/src/index.ts'),
    },
  },
  build: { outDir: './dist', emptyOutDir: true },
});
