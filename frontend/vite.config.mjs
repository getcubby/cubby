import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue()
  ],
  server: {
    fs: {
      // Allow serving files from one level up to the project root for monaco editor assets
      allow: ['..','../..','../../..']
    },
  },
  // https://vitejs.dev/guide/build.html#multi-page-app
  build: {
    sourcemap: true,
    rollupOptions: {
      input: {
        index: resolve('index.html'),
        office: resolve('office.html'),
      },
    },
    outDir: '../frontend-dist',
    emptyOutDir: true, // by default false for outDir outside current folder
    chunkSizeWarningLimit: 5000,  // really don't care so avoid warning
  },
});
