import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  cacheDir: '../../node_modules/.vite/packages/mermaid',
  plugins: [
    react(),
    dts({
      entryRoot: 'src',
      tsconfigPath: join(root, 'tsconfig.lib.json'),
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
    }),
  ],
  build: {
    outDir: './dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
    lib: {
      entry: { index: 'src/index.ts', react: 'src/react.ts', registry: 'src/registry.ts' },
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react-dom/client',
        'mermaid',
        '@archidea-ai/mermaid-core',
        '@archidea-ai/mermaid-react',
      ],
    },
  },
});
