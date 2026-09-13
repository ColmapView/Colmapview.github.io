import { defineConfig } from '@playwright/test';

const hardware = process.env.PERF_GPU === 'hardware';

export default defineConfig({
  testDir: './e2e/performance',
  testMatch: '**/*.perf.ts',
  workers: 1,
  retries: 0,
  timeout: 180000,
  outputDir: '.tmp/performance/test-results',
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    browserName: 'chromium',
    channel: process.env.PERF_BROWSER_CHANNEL || (hardware ? 'chromium' : undefined),
    trace: 'off',
    launchOptions: {
      ignoreDefaultArgs: hardware ? ['--enable-unsafe-swiftshader'] : undefined,
      args: ['--enable-webgl', '--ignore-gpu-blocklist', ...(hardware
        ? ['--use-angle=d3d11', '--disable-software-rasterizer', '--enable-unsafe-webgpu', '--force-high-performance-gpu'] : [])],
    },
  },
  webServer: { command: 'node scripts/performance/server.mjs', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
});
