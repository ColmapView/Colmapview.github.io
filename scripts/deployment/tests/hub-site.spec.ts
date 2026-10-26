import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { verifyHub } from '../hub-site.mjs';

const github = 'https://colmapview.github.io';
const directory = path.resolve(process.env.HUB_SITE_DIRECTORY || '.tmp/deployment/hub');
test.skip(process.env.HUB_SITE_SMOKE !== '1', 'Run explicitly after preparing the public Hub export.');

test.beforeEach(async ({ page }) => {
  await verifyHub(directory);
  await page.route(github + '/hub/**', async route => {
    const url = new URL(route.request().url());
    const file = url.pathname === '/hub/datasets/entry/' ? 'datasets/entry/index.html'
      : ['/hub/', '/hub/datasets/'].includes(url.pathname) ? 'index.html' : undefined;
    if (!file) { await route.fulfill({ status: 404 }); return; }
    await route.fulfill({ contentType: 'text/html', body: await readFile(path.join(directory, file)) });
  });
});

test('GitHub gallery stays on GitHub with live search, metadata, images and GitHub viewer links', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const google: string[] = [];
  page.on('request', request => { if (/google-analytics|googletagmanager/.test(request.url())) google.push(request.url()); });
  await page.goto(github + '/hub/datasets/');
  const cards = page.locator('#catalog-results [data-entry-id]');
  await expect(cards.first()).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(github + '/hub/datasets/');
  await expect(page.getByRole('link', { name: 'Open viewer', exact: true })).toHaveAttribute('href', github + '/latest/');
  expect(google).toEqual([]);
  await page.getByRole('button', { name: 'No thanks', exact: true }).click();
  await expect(cards.locator('img').first()).toBeVisible();
  await expect.poll(() => cards.locator('img').first().evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  const open = cards.first().locator('.dataset-open');
  await expect(open).toHaveAttribute('href', /^https:\/\/colmapview.opsiclear.com\/s\/.+viewerHost=github$/);
  await cards.first().locator('.dataset-info').click();
  await page.getByRole('dialog').getByRole('link', { name: 'Full metadata', exact: true }).click();
  await expect(page).toHaveURL(/^https:\/\/colmapview.github.io\/hub\/datasets\/entry\/\?id=data-/);
  await expect(page.locator('.dataset-overview')).toBeVisible();
  await page.goBack();
  await expect(cards.first()).toBeVisible();
  const search = page.getByRole('searchbox', { name: 'Search datasets' });
  await search.fill('colmapview_nonexistent_scene_qzx');
  await search.press('Enter');
  await expect(page.locator('#catalog-count')).toHaveText('No matching datasets');
  expect(new URL(page.url()).origin).toBe(github);
  await page.getByRole('link', { name: 'Reset', exact: true }).click();
  await expect(cards.first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('GitHub Hub root is a real gallery and has a server-rendered fallback without redirecting', async ({ page }) => {
  await page.goto(github + '/hub/');
  await expect(page.locator('#catalog-results [data-entry-id]').first()).toBeVisible({ timeout: 30_000 });
  expect(new URL(page.url()).origin).toBe(github);
  const html = await readFile(path.join(directory, 'index.html'), 'utf8');
  expect(html).not.toMatch(/http-equiv="refresh"|share-redirect\.js/);
  expect(html).toContain('Browse the server-rendered catalog');
});
