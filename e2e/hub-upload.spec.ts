import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/test-fixtures';
import { loadTestDataset } from './fixtures/load-test-data';
import { startMockBucket } from './fixtures/mock-bucket';

const hubEndpoint = 'https://hub.invalid/hub/api/links';
const longId = 'CalmRiver-AAAAAAAAAAAAAAAA';
const longUrl = `https://hub.invalid/s/${longId}`;
const image = readFileSync(new URL('./fixtures/test-data/masks/photo.jpg.png', import.meta.url)).toString('base64');
const dataset = ['photo.jpg', 'photo-2.jpg'].map(name => ({ relativePath: `images/${name}`, name, base64: image }));

async function openBucketPublisher(page: Page) {
  const toolbar = (await page.getByTestId('viewer-controls').boundingBox())!;
  await page.mouse.move(toolbar.x + toolbar.width / 2, toolbar.y + 16);
  await page.getByRole('button', { name: 'Share', exact: true }).hover();
  await page.getByRole('region', { name: 'Share', exact: true }).getByRole('button', { name: 'Bucket storage', exact: true }).click();
  return page.getByRole('dialog', { name: 'Publish to bucket' });
}

test('gives a private bucket upload an unguessable Hub link and keeps it after the result resets', async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const bucket = await startMockBucket(new URL(baseURL!).origin);
  const requests: Array<Record<string, unknown>> = [];
  await page.route(hubEndpoint, async route => {
    requests.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ json: { id: longId, url: `https://hub.invalid/hub/${longId}`, shareUrl: longUrl,
      managementPath: `/hub/manage/${longId}` } });
  });
  try {
    await page.goto('/');
    await loadTestDataset(page, dataset);
    await expect(page.getByText('Source:', { exact: false }).first()).toBeVisible({ timeout: 45000 });
    const dialog = await openBucketPublisher(page);
    await dialog.getByLabel('Bucket URL', { exact: true }).fill(bucket.baseUrl);
    await dialog.getByLabel('Access key ID', { exact: true }).fill('e2e-access');
    await dialog.getByLabel('Secret key', { exact: true }).fill('e2e-secret');
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(dialog.getByRole('combobox', { name: 'Format' })).toBeFocused();
    await expect(dialog.getByLabel('Access', { exact: true })).toHaveCount(0);
    await expect(dialog.getByText('Also creates a ColmapView Hub link (short if the bucket is public). Anyone with it sees the title, description, preview and dataset link. Original images keep their metadata, such as location.', { exact: true })).toBeVisible();
    await expect(dialog.getByLabel('Upload folder', { exact: true })).toHaveValue('colmap-dataset');
    await dialog.getByRole('button', { name: 'Upload dataset', exact: true }).click();
    const result = dialog.getByRole('region', { name: 'Published bucket dataset' });
    await expect(result).toBeVisible({ timeout: 45000 });
    await expect(result.getByText('Private. Viewers need bucket access.')).toBeVisible();
    await expect(result.getByLabel('Share link', { exact: true })).toHaveValue(longUrl);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ access: 'private', title: 'colmap-dataset', publicAcknowledged: true });
    const viewerUrl = String(requests[0].viewerUrl);
    expect(viewerUrl.startsWith(new URL('/', baseURL).href)).toBe(true);
    expect(viewerUrl).toContain('127.0.0.1');
    expect(bucket.objects.size).toBeGreaterThan(0);
    expect([...bucket.objects.keys()].some(key => key.startsWith('/bucket/colmap-dataset/') && key.endsWith('/manifest.json'))).toBe(true);
    expect(bucket.anonymousReads).toEqual([]);
    const deleteLink = await result.getByLabel('Private delete link', { exact: true }).inputValue();
    expect(requests[0].managementSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(deleteLink).toBe(`https://hub.invalid/hub/manage/${longId}#${String(requests[0].managementSecret)}`);
    // Marking an image for deletion is an edit: it resets the upload result, and the Hub link moves to Previous upload.
    await page.evaluate(async () => {
      const storePath = '/src/store/reconstructionStore.ts';
      const deletionStorePath = '/src/store/stores/deletionStore.ts';
      const { useReconstructionStore } = await import(/* @vite-ignore */ storePath);
      const { useDeletionStore } = await import(/* @vite-ignore */ deletionStorePath);
      const [firstImage] = useReconstructionStore.getState().reconstruction.images.keys();
      useDeletionStore.getState().markForDeletion(firstImage);
    });
    const previous = dialog.getByRole('region', { name: 'Previous upload' });
    await expect(previous.getByLabel('Share link', { exact: true })).toHaveValue(longUrl);
    await expect(previous.getByLabel('Private delete link', { exact: true })).toHaveValue(deleteLink);
    await expect(dialog.getByRole('button', { name: 'Apply deletions and continue' })).toBeVisible();
  } finally { await bucket.close(); }
});
