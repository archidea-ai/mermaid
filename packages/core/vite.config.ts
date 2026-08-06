import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  cacheDir: '../../node_modules/.vite/packages/core',
  plugins: [
    dts({
      entryRoot: 'src',
      tsconfigPath: join(root, 'tsconfig.lib.json'),
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts'],
    }),
  ],
  build: {
    outDir: './dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'index.js' },
    rollupOptions: { external: ['mermaid', 'react', 'react-dom', 'react/jsx-runtime'] },
  },
});
