import { expect, test } from '@playwright/test';

// Opt-in network qualification against a running, dedicated test API. No dataset
// submission, permission-disabling launch flags, CORS mocks or production token.
const apiUrl = process.env.COLMAP_TRAIN_TEST_API_URL;
const hostedUrl = 'https://colmapview.github.io/latest/';

test.describe('Hosted COLMAPView to local training API', () => {
  test.skip(!apiUrl, 'Set COLMAP_TRAIN_TEST_API_URL to a dedicated running test API.');

  test('allowed local access reaches health and authenticated error responses', async ({ browser, browserName }, info) => {
    test.skip(browserName !== 'chromium', 'This permission gate qualifies Chromium; other browsers need separate evidence.');
    const context = await browser.newContext();
    try {
      await context.grantPermissions(['local-network-access'], { origin: hostedUrl });
      const page = await context.newPage();
      await page.goto(hostedUrl, { waitUntil: 'domcontentloaded' });
      expect(new URL(page.url()).origin).toBe(new URL(hostedUrl).origin);
      const result = await page.evaluate(async (url) => {
        const health = await fetch(`${url}/api/v1/health`, { signal: AbortSignal.timeout(10_000) });
        const body = await health.json();
        // The invalid bearer causes a real Authorization preflight and a readable
        // 401 Problem Details response, without sharing an operator credential.
        const denied = await fetch(`${url}/api/v1/config`, {
          headers: { Authorization: 'Bearer intentionally-invalid-test-credential' },
          signal: AbortSignal.timeout(10_000),
        });
        return { health: health.status, version: body.api_version, denied: denied.status, problem: await denied.json() };
      }, apiUrl!.replace(/\/$/, ''));
      expect(result.health).toBe(200);
      expect(result.version).toBe('1.0');
      expect(result.denied).toBe(401);
      expect(result.problem.status).toBe(401);
      await info.attach('local-access-browser', {
        body: JSON.stringify({ browser: browser.version(), origin: new URL(hostedUrl).origin, allowed: true }),
        contentType: 'application/json',
      });
    } finally {
      await context.close();
    }
  });

  test('denied local access blocks page fetch without weakening browser security', async ({ browser, browserName }, info) => {
    test.skip(browserName !== 'chromium', 'Chromium permission gate.');
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      // Chromium grants the listed permissions and denies the others. An empty
      // set therefore exercises actual denial, not an intercepted network error.
      await context.grantPermissions([], { origin: new URL(hostedUrl).origin });
      await page.goto(hostedUrl, { waitUntil: 'domcontentloaded' });
      const result = await page.evaluate(async (url) => {
        try {
          await fetch(`${url}/api/v1/health`, { signal: AbortSignal.timeout(10_000) });
          return 'unexpectedly-reachable';
        } catch (error) {
          return error instanceof TypeError ? 'blocked' : 'timeout-or-other-error';
        }
      }, apiUrl!.replace(/\/$/, ''));
      expect(result).toBe('blocked');
      await info.attach('local-access-browser', {
        body: JSON.stringify({ browser: browser.version(), origin: new URL(hostedUrl).origin, allowed: false }),
        contentType: 'application/json',
      });
    } finally {
      await context.close();
    }
  });
});
