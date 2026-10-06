import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: '../../.tmp/deployment-smoke/results',
  reporter: [['list'], ['html', { outputFolder: '.tmp/deployment-smoke/report', open: 'never' }]],
  use: {
    browserName: 'chromium',
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--enable-webgl', '--use-gl=angle', '--ignore-gpu-blocklist'] },
  },
});
