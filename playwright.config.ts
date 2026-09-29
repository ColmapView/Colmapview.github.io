import { defineConfig, devices } from '@playwright/test';

// A dedicated port keeps tests off a developer's `npm run dev` server, which lacks the test feature settings.
const testPort = process.env.COLMAP_WEBVIEW_E2E_PORT ?? '5187';
if (!/^\d{2,5}$/.test(testPort)) throw new Error('COLMAP_WEBVIEW_E2E_PORT must be a port number');
const testOrigin = `http://localhost:${testPort}`;

const webGpuSpec = /.*webgpu.*\.spec\.ts/;
const webGpuSoftwareSpec = /.*webgpu-(psnr|psnr-app|psnr-isolation|render|sog)\.spec\.ts/;
const webGpuHardwareSpec = /.*webgpu-render\.spec\.ts/;
const webGpuBicycleSpec = /.*webgpu-bicycle\.spec\.ts/;
const defaultLaunchArgs = ['--enable-webgl', '--use-gl=angle', '--ignore-gpu-blocklist'];
const webGpuLaunchArgs = [
  ...defaultLaunchArgs,
  '--enable-unsafe-webgpu',
  '--enable-webgpu-developer-features',
  '--enable-features=Vulkan',
  '--use-vulkan=swiftshader',
];
const webGpuHardwareLaunchArgs = [
  ...defaultLaunchArgs,
  '--enable-unsafe-webgpu',
  '--enable-webgpu-developer-features',
];
const webGpuHardwareBrowserChannel = process.env.COLMAP_WEBVIEW_WEBGPU_CHANNEL || undefined;
const webGpuHardwareUse = webGpuHardwareBrowserChannel
  ? { channel: webGpuHardwareBrowserChannel }
  : {};

/**
 * Playwright E2E test configuration for ColmapView
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['list']],

  use: {
    baseURL: testOrigin,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    // WebGL requires specific browser flags for headless testing
    launchOptions: {
      args: defaultLaunchArgs,
    },
  },

  projects: [
    {
      name: 'chromium',
      testIgnore: webGpuSpec,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'firefox',
      testIgnore: webGpuSpec,
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'chromium-webgpu',
      testMatch: webGpuSoftwareSpec,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        launchOptions: {
          args: webGpuLaunchArgs,
        },
      },
    },
    {
      name: 'chromium-webgpu-hardware',
      testMatch: webGpuHardwareSpec,
      use: {
        ...devices['Desktop Chrome'],
        ...webGpuHardwareUse,
        viewport: { width: 1280, height: 720 },
        launchOptions: {
          args: webGpuHardwareLaunchArgs,
        },
      },
    },
    {
      name: 'chromium-webgpu-bicycle',
      testMatch: webGpuBicycleSpec,
      use: {
        ...devices['Desktop Chrome'],
        ...webGpuHardwareUse,
        viewport: { width: 1280, height: 720 },
        launchOptions: {
          args: webGpuHardwareLaunchArgs,
        },
      },
    },
  ],

  // Auto-start dev server before running tests
  webServer: {
    command: `npm run dev -- --port ${testPort} --strictPort`,
    url: testOrigin,
    // A reused server would not receive the env below; --strictPort reports a clash instead.
    reuseExistingServer: false,
    env: {
      BROWSER: 'none',
      VITE_HF_PUBLISH_ENABLED: 'true',
      VITE_HF_OAUTH_CLIENT_ID: 'colmapview-browser-test',
      VITE_HF_OAUTH_REDIRECT_URI: `${testOrigin}/hf-callback.html`,
    },
    timeout: 120000,
  },
});
