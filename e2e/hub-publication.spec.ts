import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures/test-fixtures';
import type { Page } from '@playwright/test';
import { mockHubPublication, publicationId as id } from './fixtures/mock-hub-publication';

const sourceBase = 'https://datasets.example.test/project/';
const sourceUrl = `${sourceBase}manifest.json`;

async function prepare(page: Page, pending = false) {
  const posts = await mockHubPublication(page, pending);
  const files = Object.fromEntries(['cameras', 'images', 'points3D'].map(name => [`${name}.txt`, readFileSync(new URL(`./fixtures/test-data/sparse/${name}.txt`, import.meta.url))]));
  await page.route(sourceBase + '**', route => {
    const path = new URL(route.request().url()).pathname.replace('/project/', '');
    const manifest = { version: 1, name: 'Public test scene', baseUrl: sourceBase, skipImages: true,
      files: { cameras: 'cameras.txt', images: 'images.txt', points3D: 'points3D.txt' } };
    const body = path === 'manifest.json' ? JSON.stringify(manifest) : files[path];
    return route.fulfill({ status: body ? 200 : 404, body: body ?? '', headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto('/?url=' + encodeURIComponent(sourceUrl));
  await expect(page.getByText('Source:', { exact: false }).first()).toBeVisible({ timeout: 45000 });
  const toolbar = (await page.getByTestId('viewer-controls').boundingBox())!;
  await page.mouse.move(toolbar.x + toolbar.width / 2, toolbar.y + 16);
  await page.getByRole('button', { name: 'Share', exact: true }).hover();
  await page.getByRole('region', { name: 'Share', exact: true }).getByRole('button', { name: 'Share on Hub', exact: true }).click();
  return { posts, dialog: page.getByRole('dialog', { name: 'Share on Hub', exact: true }) };
}

for (const width of [1280, 390, 320]) {
  test(`shares an existing URL with a compact responsive dialog at ${width}px`, async ({ page }) => {
    // Open through the desktop toolbar, then exercise the dialog at each viewport.
    // The scene's source footer is intentionally hidden on small screens.
    await page.setViewportSize({ width: 1280, height: 844 });
    const { posts, dialog } = await prepare(page);
    await page.setViewportSize({ width, height: 844 });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('img', { name: 'Preview to share on Hub' })).toBeVisible();
    const image = (await dialog.getByRole('img', { name: 'Preview to share on Hub' }).boundingBox())!;
    expect(image.width / image.height).toBeCloseTo(600 / 315, 1);
    await expect(dialog.getByLabel('Dataset title')).toHaveValue('Public test scene');
    const submit = dialog.getByRole('button', { name: 'Share on Hub', exact: true });
    await expect(submit).toBeDisabled();
    await dialog.getByRole('checkbox', { name: /Make the dataset link/ }).check();
    await dialog.getByRole('button', { name: 'Test bot check' }).click();
    await expect(submit).toBeEnabled();
    await submit.scrollIntoViewIfNeeded();
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await dialog.locator('.publication-body').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const bounds = (await dialog.boundingBox())!;
    const action = (await submit.boundingBox())!;
    expect(action.x).toBeGreaterThanOrEqual(bounds.x + 12);
    expect(action.x + action.width).toBeLessThanOrEqual(bounds.x + bounds.width - 12);
    expect(action.y + action.height).toBeLessThanOrEqual(bounds.y + bounds.height - 8);
    const preview = (await dialog.getByRole('region', { name: 'Hub preview' }).boundingBox())!;
    const fields = (await dialog.locator('.publication-main').boundingBox())!;
    if (width > 700) expect(preview.x + preview.width).toBeLessThanOrEqual(fields.x);
    else expect(preview.y + preview.height).toBeLessThanOrEqual(fields.y + 1);
    await dialog.screenshot({ path: test.info().outputPath(`share-on-hub-${width}.png`) });
    await submit.click(); await expect(dialog.getByRole('status')).toHaveText('Shared on Hub.');
    expect(posts).toHaveLength(1); expect(posts[0].listingAcknowledged).toBe(true);
    expect(new URL(String(posts[0].viewerUrl)).searchParams.get('url')).toBe(sourceUrl);
    await expect(dialog.getByLabel('Hub dataset link')).toHaveValue(`https://hub.invalid/s/${id}`);
  });
}

test('keeps a review-required source out of the published result state', async ({ page }) => {
  const { dialog } = await prepare(page, true);
  await dialog.getByRole('checkbox', { name: /Make the dataset link/ }).check();
  await dialog.getByRole('button', { name: 'Test bot check' }).click();
  await dialog.getByRole('button', { name: 'Share on Hub', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('Submitted for review. It will appear on Hub after its source is verified.');
  await expect(dialog.getByLabel('Hub dataset link')).toHaveCount(0);
});
