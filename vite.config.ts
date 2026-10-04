import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true } },
  },
  // Hidden: maps are still written for debugging, but the page no longer points
  // every visitor's devtools at a 1.2 MB download.
  build: { outDir: 'dist', sourcemap: 'hidden' },
});
