import { test, expect } from '@playwright/test';

// Fixture protocol validation only. This is not an application scheduler benchmark.
test('controlled two-origin delayed body and failure protocol', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const origin = 'http://127.0.0.1:4174';
    const first = await fetch(`${origin}/media/limited.png`);
    await first.arrayBuffer();
    const second = await fetch(`${origin}/media/limited.png`);
    await second.arrayBuffer();
    const third = await fetch(`${origin}/media/limited.png`);
    await third.arrayBuffer();
    const missing = await fetch('/media/missing.png');
    await missing.arrayBuffer();
    const broken = await fetch('/media/disconnect.png').then(() => false, () => true);
    await Promise.all([fetch('/media/shared.png?delay=150'), fetch(`${origin}/media/shared.png?delay=150`)].map(async pending => (await pending).arrayBuffer()));
    return { statuses: [first.status, second.status, third.status, missing.status], retryAfter: first.headers.get('Retry-After'), broken, metrics: await (await fetch('/__metrics')).json() };
  });
  expect(result.statuses).toEqual([429, 429, 200, 404]);
  expect(result.retryAfter).toBe('1');
  expect(result.broken).toBe(true);
  expect(result.metrics.peak).toBeGreaterThanOrEqual(2);
});
