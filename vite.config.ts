import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import pkg from './package.json';

export default defineConfig({
  plugins: [react()],

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/utils/**', 'src/parsers/**'],
    },
  },

  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },

  base: process.env.VITE_BASE || '/',

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    port: 5173,
    open: true,
    // Required for SharedArrayBuffer (optional but better WASM performance)
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },

  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'three-vendor': ['three', '@react-three/fiber', '@react-three/drei'],
          'ui-vendor': ['react-resizable-panels', '@tanstack/react-virtual'],
        }
      }
    }
  },

  optimizeDeps: {
    exclude: ['sql.js'],
    include: ['react', 'react-dom', 'three'],
  },

  // Include WASM files as assets
  assetsInclude: ['**/*.wasm'],
});
