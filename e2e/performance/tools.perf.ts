import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

test.describe('first optional tool open', () => {
  test.skip(process.env.PERF_TOOLS !== '1', 'Opt-in diagnostic run, separate from dataset timings');
  for (let repetition = 0; repetition < Number(process.env.PERF_REPETITIONS || 5); repetition++) {
    test(`auto-hide first open ${repetition + 1}`, async ({ page }) => {
      await page.goto('/');
      await expect(page.getByTestId('drop-zone')).toBeVisible();
      const close = page.getByRole('button', { name: 'Dismiss this panel', exact: true });
      if (await close.isVisible()) await close.click();
      await page.getByRole('button', { name: 'Settings', exact: true }).hover();
      const tool = page.getByRole('button', { name: 'Auto-hide 3D Elements', exact: true });
      await expect(tool).toBeVisible();
      const start = await tool.evaluate(element => {
        const start = performance.now();
        (element as HTMLElement).click();
        return start;
      });
      const dialog = page.getByRole('dialog', { name: 'Auto-hide Elements', exact: true });
      await expect(dialog).toBeVisible();
      const result = await page.evaluate(start => ({
        repetition: 0,
        firstOpenReadyProxyMs: performance.now() - start,
        jsRequestsAfterOpen: (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
          .filter(entry => entry.startTime >= start && /\.js(?:\?|$)/.test(entry.name))
          .map(entry => ({ url: entry.name, compressedBodyBytes: entry.encodedBodySize, transferBytes: entry.transferSize })),
      }), start);
      await expect(dialog).toContainText('Select which elements hide when idle.');
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(dialog).not.toBeVisible();
      const directory = resolve('.tmp/performance/tool-runs', process.env.PERF_RUN || 'tools');
      mkdirSync(directory, { recursive: true });
      writeFileSync(resolve(directory, `${repetition}.json`), JSON.stringify({ ...result, repetition }, null, 2));
    });
  }
});
