import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import pankowPlugin from '@cloudron/pankow/vite-plugin';
import { resolve } from 'path';
import { existsSync } from 'fs';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    pankowPlugin(),
    vue(),
    {
      name: 'resolve-monaco-worker-imports',
      resolveId(source) {
        if (source.includes('?worker') && source.startsWith('monaco-editor/')) {
          const cleanId = source.replace(/\?worker$/, '');
          const filePath = resolve('node_modules/', cleanId + '.js');
          if (existsSync(filePath)) return filePath + '?worker';
        }
      },
    },
  ],
  server: {
    fs: {
      // Allow serving files from one level up to the project root for monaco editor assets
      allow: ['..','../..','../../..']
    },
    // Same-origin API in dev (no VITE_API_ORIGIN). Backend default port matches server.js.
    proxy: {
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '^/filedrop/[^/]+$': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        bypass: (req, _res, _options) => {
          const accept = req.headers.accept || '';
          if (accept.includes('text/html')) {
            return '/filedrop.html';
          }
        },
      },
      // y-websocket uses ws://host/<docId>; prefix so we do not steal Vite's own WS (e.g. HMR).
      '/__cubby_ws': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/__cubby_ws/, '') || '/',
      },
    },
  },
  // https://vitejs.dev/guide/build.html#multi-page-app
  build: {
    sourcemap: true,
    rollupOptions: {
      input: {
        index: resolve('index.html'),
        office: resolve('office.html'),
        filedrop: resolve('filedrop.html'),
      },
    },
    outDir: '../frontend-dist',
    emptyOutDir: true, // by default false for outDir outside current folder
    chunkSizeWarningLimit: 5000,  // really don't care so avoid warning
  },
});
