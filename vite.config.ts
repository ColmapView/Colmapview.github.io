import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],

  base: '/',

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    port: 5173,
    open: true,
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
    include: ['react', 'react-dom', 'three']
  },
});
