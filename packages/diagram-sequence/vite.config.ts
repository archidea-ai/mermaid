import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import dts from 'vite-plugin-dts';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  cacheDir: '../../node_modules/.vite/packages/diagram-sequence',
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  plugins: [
    react(),
    tailwindcss(),
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
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'index.js' },
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
