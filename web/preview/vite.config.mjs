import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

// Static team preview: relative paths, data from the recorded snapshot.
export default defineConfig({
  root: here('.'),
  base: './',
  publicDir: here('../.preview-snapshot'),
  resolve: {
    alias: {
      '@/': here('../src/'),
      '@scc/shared': here('../../shared/src/index.ts'),
    },
  },
  define: {
    'process.env.NEXT_PUBLIC_STATIC_PREVIEW': JSON.stringify('1'),
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  esbuild: { jsx: 'automatic' },
  build: {
    outDir: here('../preview-dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
  },
});
