import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import * as path from 'node:path';
import pkg from './package.json';
import { resolveViteLocalAliasPolicy } from './viteLocalAliasPolicy';

export default defineConfig(({ command, mode }) => {
  const localAliasPolicy = resolveViteLocalAliasPolicy({
    command,
    mode,
    env: process.env,
    rootDir: __dirname,
    pathExists: fs.existsSync,
  });
  const topLevelThreePath = path.resolve(__dirname, 'node_modules/three').replace(/\\/g, '/');

  return {
    plugins: [react()],

    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        include: [
          'src/utils/**',
          'src/parsers/**',
          'src/splat/**',
          'src/components/viewer3d/SplatPsnrEvaluator*',
          'src/components/viewer3d/splatPsnrMetric.ts',
        ],
      },
    },

    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __LOCAL_GSPLAT_WEBGPU_ENABLED__: JSON.stringify(localAliasPolicy.localGsplatWebGpuEnabled),
    },

    base: process.env.VITE_BASE || '/',

    resolve: {
      alias: [
        ...Object.entries(localAliasPolicy.aliases).map(([find, replacement]) => ({ find, replacement })),
        { find: /^three$/, replacement: `${topLevelThreePath}/build/three.module.js` },
        { find: /^three\/addons$/, replacement: `${topLevelThreePath}/examples/jsm/Addons.js` },
        { find: /^three\/addons\/(.*)$/, replacement: `${topLevelThreePath}/examples/jsm/$1` },
        { find: /^three\/examples\/fonts\/(.*)$/, replacement: `${topLevelThreePath}/examples/fonts/$1` },
        { find: /^three\/examples\/jsm\/(.*)$/, replacement: `${topLevelThreePath}/examples/jsm/$1` },
        { find: /^three\/src\/(.*)$/, replacement: `${topLevelThreePath}/src/$1` },
        { find: /^three\/tsl$/, replacement: `${topLevelThreePath}/build/three.tsl.js` },
        { find: /^three\/webgpu$/, replacement: `${topLevelThreePath}/build/three.webgpu.js` },
      ],
      dedupe: ['three'],
    },

    server: {
      port: 5173,
      open: true,
      // Fast Refresh can preserve stale R3F hook state after deep renderer edits.
      // Use full reloads in dev so hook-order changes cannot survive in the browser.
      hmr: false,
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
      // Spark's splat renderer is an optional lazy chunk of roughly 5.1 MB minified.
      // Keep warnings for chunks that exceed that known feature bundle.
      chunkSizeWarningLimit: 5500,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom'],
            'three-vendor': ['three', '@react-three/fiber', '@react-three/drei'],
            'spark-vendor': ['@sparkjsdev/spark'],
            'ui-vendor': ['react-resizable-panels', '@tanstack/react-virtual'],
          },
        },
      },
    },

    optimizeDeps: {
      exclude: ['sql.js'],
      include: ['react', 'react-dom', 'three'],
    },

    // Include WASM files as assets
    assetsInclude: ['**/*.wasm'],
  };
});
