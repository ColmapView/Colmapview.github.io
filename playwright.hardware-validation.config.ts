import { defineConfig } from '@playwright/test';

// Windows hardware validation of the existing offscreen WebGPU renderer suite.
// No software fallback: an unavailable adapter is reported by the suite, not
// counted as a hardware pass. Set BROWSER=none to suppress Vite's browser opener.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'webgpu-render.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 60000,
  reporter: [['list']],
  outputDir: '.tmp/performance/hardware-webgpu',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    channel: process.env.PERF_BROWSER_CHANNEL || 'chromium',
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      ignoreDefaultArgs: ['--enable-unsafe-swiftshader'],
      args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-software-rasterizer', '--enable-unsafe-webgpu', '--force-high-performance-gpu'],
    },
  },
  webServer: { command: 'npm run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: false },
});
