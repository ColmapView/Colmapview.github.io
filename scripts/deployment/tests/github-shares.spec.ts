import { existsSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { startArtifactServer } from '../static-server.mjs';

const directory = path.resolve(process.env.DEPLOYMENT_SMOKE_ROOT || '.tmp/deployment-smoke', 'root');
test.skip(!existsSync(path.join(directory, '404.html')), 'The root artifact is published on release tags.');
let server: Awaited<ReturnType<typeof startArtifactServer>>;
test.beforeAll(async () => { server = await startArtifactServer(directory, '/', { githubPages404: true }); });
test.afterAll(async () => { await server?.close(); });

test('retains an encoded dataset query and view fragment when opening the Pages root', async ({ page }) => {
  const query = '?url=' + encodeURIComponent('https://datasets.example/scene.manifest.json?a=1&b=two words') + '&layer=rgb#frame=7';
  await page.route(`${server.origin}/latest/**`, route => route.fulfill({
    contentType: 'text/html', body: '<h1>Latest viewer</h1>',
  }));
  await page.goto(`${server.origin}/${query}`);
  await expect(page).toHaveURL(`${server.origin}/latest/${query}`);
  await expect(page.getByRole('heading', { name: 'Latest viewer' })).toBeVisible();
});

for (const id of ['RoughhewnBiplane', 'roughhewnbiplane', 'CalmRiver-AAAAAAAAAAAAAAAA']) {
  test(`opens a GitHub Pages share address for ${id}`, async ({ page }) => {
    const target = `https://colmapview.opsiclear.com/s/${id}`;
    await page.route(target, route => route.fulfill({ contentType: 'text/html', body: '<h1>Shared dataset destination</h1>' }));
    await page.goto(`${server.origin}/s/${id}?url=https://unrelated.example/#discarded`);
    await expect(page).toHaveURL(target);
    await expect(page.getByRole('heading', { name: 'Shared dataset destination' })).toBeVisible();
  });
}

test('leaves unrelated paths as 404s and never treats a query as a redirect destination', async ({ page }) => {
  const initial = `${server.origin}/s/not-a-share?url=https://unrelated.example/`;
  expect((await page.goto(initial))?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page).toHaveURL(initial);
});
