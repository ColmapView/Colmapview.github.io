import { test, expect } from './fixtures/test-fixtures';
import { loadTestDataset } from './fixtures/load-test-data';
import { createMockHuggingFace } from './fixtures/mock-hugging-face';
import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import type { Page } from '@playwright/test';
import type { PublicationAssetSummary } from '../src/features/datasetPublishing/types';

const shorteningEndpoint = 'https://hub.invalid/hub/api/links';
const shortUrl = 'https://hub.invalid/hub/HappyTree';
const longId = 'HappyTree-AAAAAAAAAAAAAAAA';
const longUrl = `https://hub.invalid/hub/${longId}`;
interface ShorteningRequest {
  viewerUrl: string; title: string; thumbnailBase64: string; access: 'public' | 'private'; managementSecret: string;
  license?: { name: string; url?: string };
  assets?: PublicationAssetSummary;
}
const shorteningRequests = new Map<Page, ShorteningRequest[]>();

test.beforeEach(async ({ page }) => {
  const requests: ShorteningRequest[] = [];
  shorteningRequests.set(page, requests);
  await page.route(shorteningEndpoint, async route => {
    const request = route.request().postDataJSON() as ShorteningRequest;
    requests.push(request);
    const id = request.access === 'private' ? longId : 'HappyTree';
    await route.fulfill({ json: { id, url: `https://hub.invalid/hub/${id}`, managementPath: `/hub/manage/${id}` } });
  });
});

async function openPublisher(page: Page) {
  const toolbar = (await page.getByTestId('viewer-controls').boundingBox())!;
  await page.mouse.move(toolbar.x + toolbar.width / 2, toolbar.y + 16);
  await page.getByRole('button', { name: 'Share', exact: true }).hover();
  await page.getByRole('region', { name: 'Share', exact: true }).getByRole('button', { name: 'Publish to Hugging Face', exact: true }).click();
}

const mocks = new Set<ReturnType<typeof createMockHuggingFace>>();
const mockHub = (options: { lfs?: boolean } = {}) => {
  const hub = createMockHuggingFace(options); mocks.add(hub); return hub;
};
test.afterEach(async ({ page }) => { await Promise.all([...mocks].map(hub => hub.close())); mocks.clear(); shorteningRequests.delete(page); });

test.describe('Hugging Face dataset publication', () => {
  test('publishes settings and originals and reopens the shared link and pinned manifest anonymously', async ({ page, context, browser, baseURL }) => {
    test.setTimeout(120_000);
    const publisherErrors: string[] = [];
    page.on('pageerror', error => publisherErrors.push(error.message));
    const hub = mockHub({ lfs: true });
    await hub.attach(context, baseURL!);
    await page.goto('/');
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 3;
      return canvas.toDataURL('image/png').split(',')[1];
    });
    // A valid PNG with a large trailing payload exercises the SDK's hashing/upload path.
    const original = Buffer.concat([Buffer.from(png, 'base64'), Buffer.alloc(11 * 1024 * 1024)]).toString('base64');
    await loadTestDataset(page, ['photo.jpg', 'photo-2.jpg'].map(name => ({ relativePath: `images/${name}`, name, base64: original })));
    await expect(page.getByText('Source:', { exact: false }).first()).toBeVisible({ timeout: 45000 });
    const scene = page.getByTestId('scene-3d');
    const originalBackground = await scene.evaluate(element => getComputedStyle(element).backgroundColor);
    await page.keyboard.press('b');
    await expect(scene).not.toHaveCSS('background-color', originalBackground);
    const publishedBackground = await scene.evaluate(element => getComputedStyle(element).backgroundColor);
    // Large fixture decoding can outlast the idle timeout; Tab wakes the controls.
    await page.keyboard.press('Tab');
    await openPublisher(page);
    const dialog = page.getByRole('dialog', { name: 'Publish to Hugging Face' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible({ timeout: 30000 });
    await dialog.getByLabel('Repository name', { exact: true }).fill('scene');
    await dialog.getByLabel('Dataset title', { exact: true }).fill('Browser test scene');
    await dialog.getByLabel('Dataset license', { exact: true }).selectOption('cc-by-4.0');
    await expect(dialog.getByRole('combobox', { name: 'Access' })).toHaveValue('public');
    await expect(dialog.getByRole('checkbox', { name: 'Shorten URL', exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('checkbox', { name: 'List on Hub', exact: true })).toHaveCount(0);
    await expect(dialog.getByText(/Public uploads receive|Includes .*images/)).toHaveCount(0);
    await expect(dialog.getByText(/public, discoverable dataset/)).toBeVisible();
    await dialog.screenshot({ path: test.info().outputPath('publication-form.png') });
    expect(hub.writes).toHaveLength(0);
    await expect(dialog.getByText('Also creates a short ColmapView Hub link. Anyone with it sees the title, description and preview. Original images keep their metadata, such as location.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Publish public dataset', exact: true }).click();
    await expect(dialog.getByRole('region', { name: 'Published dataset' })).toBeVisible({ timeout: 45000 });
    await expect(dialog.getByRole('button', { name: 'Upload another dataset' })).toHaveCount(0);
    await dialog.screenshot({ path: test.info().outputPath('publication-result.png') });
    expect(publisherErrors).toEqual([]);
    expect(hub.files.get('images/photo.jpg')).toEqual(Buffer.from(original, 'base64'));
    expect(hub.files.has('masks/photo.jpg.png')).toBe(true);
    expect(hub.writes.some(path => path.endsWith('/info/lfs/objects/batch'))).toBe(true);
    expect(hub.writes.some(path => path.startsWith('/mock-complete/'))).toBe(true);
    await expect(dialog.getByLabel('Share link', { exact: true })).toHaveValue(shortUrl);
    const completedWrites = [...hub.writes];
    await dialog.getByRole('button', { name: 'Close publish dataset' }).click();
    await openPublisher(page);
    await expect(dialog.getByLabel('Share link', { exact: true })).toHaveValue(shortUrl);
    await expect(dialog.getByLabel('Repository name', { exact: true })).toHaveCount(0);
    expect(hub.writes).toEqual(completedWrites);
    const requests = shorteningRequests.get(page)!;
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ title: 'Browser test scene', access: 'public',
      license: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' } });
    expect(requests[0]).not.toHaveProperty('listed');
    expect(requests[0].managementSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(requests[0])).not.toContain('hf_browser_test_only');
    const paths = [...hub.files.keys()];
    expect(requests[0].assets).toEqual({ format: 'folder', imageFormat: 'original',
      colmap: { files: paths.filter(path => path.startsWith('sparse/0/')).length,
        cameras: Number(hub.files.get('sparse/0/cameras.bin')!.readBigUInt64LE(0)),
        points: Number(hub.files.get('sparse/0/points3D.bin')!.readBigUInt64LE(0)) },
      images: paths.filter(path => path.startsWith('images/')).length, masks: paths.filter(path => path.startsWith('masks/')).length,
      splats: paths.filter(path => path.startsWith('splats/')).length, viewerSettings: true, preview: true });
    const thumbnail = Buffer.from(requests[0].thumbnailBase64, 'base64');
    expect(thumbnail.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(thumbnail.byteLength).toBeLessThanOrEqual(64 * 1024);
    const dimensions = await page.evaluate(async base64 => {
      const blob = await (await fetch(`data:image/jpeg;base64,${base64}`)).blob();
      const bitmap = await createImageBitmap(blob);
      try { return [bitmap.width, bitmap.height]; } finally { bitmap.close(); }
    }, requests[0].thumbnailBase64);
    expect(dimensions).toEqual([600, 315]);
    await expect(dialog.getByRole('region', { name: 'Published dataset' })).toContainText('Published publisher/scene');
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseURL!).origin });
    await dialog.getByRole('button', { name: 'Close publish dataset' }).click();
    const toolbar = (await page.getByTestId('viewer-controls').boundingBox())!;
    await page.mouse.move(toolbar.x + toolbar.width / 2, toolbar.y + 16);
    await page.getByRole('button', { name: 'Share', exact: true }).hover();
    // Local data has no source link, so Copy link exists here only because of the Hub link.
    await page.getByRole('region', { name: 'Share', exact: true }).getByRole('button', { name: 'Copy link', exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(shortUrl);
    const manifest = JSON.parse(hub.files.get('colmapview.json')!.toString());
    expect(manifest.baseUrl).not.toContain('/main/');
    expect(manifest.viewerStatePath).toBe('colmapview.yaml');
    expect(hub.files.has('colmapview-state.json')).toBe(false);
    expect(hub.files.get('colmapview.yaml')!.toString()).toContain('background_color:');
    const readme = hub.files.get('README.md')!.toString();
    const preview = hub.files.get('colmapview-preview.png')!;
    expect(preview.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(readme).toContain(`![Dataset preview](${manifest.baseUrl}colmapview-preview.png)`);
    expect(hub.reads.some(read => read.path.endsWith('/colmapview-preview.png') && !read.authorization)).toBe(true);
    const readmeViewerUrl = /\[Open in ColmapView\]\(([^)]+)\)/.exec(readme)![1];
    // The storage card keeps the direct viewer link; the upload result shares the Hub card.
    const viewerUrl = `${new URL('/', baseURL).href}?url=https://huggingface.co/datasets/publisher/scene`;
    expect(readmeViewerUrl).toBe(viewerUrl);
    expect(readme).toContain(`Viewer link: <${viewerUrl}>`);
    expect(requests[0].viewerUrl).toBe(viewerUrl);
    expect(hub.visibility).toBe('public');
    expect(hub.reads.filter(read => /\/(resolve|tree)\//.test(read.path)).every(read => !read.authorization)).toBe(true);
    for (const mode of ['shared', 'manual'] as const) {
      const recipient = await browser.newContext();
      try {
        await hub.attach(recipient, baseURL!);
        const recipientPage = await recipient.newPage();
        const errors: string[] = []; recipientPage.on('pageerror', error => errors.push(error.message));
        const readStart = hub.reads.length;
        if (mode === 'manual') {
          await recipientPage.goto('/');
          await recipientPage.evaluate(() => window.history.replaceState(null, '', '/#camera=99,0,0,0,0,0,0,0,0,1'));
          await recipientPage.getByRole('button', { name: 'Load URL', exact: true }).click();
          const inputDialog = recipientPage.getByRole('dialog', { name: 'Load from URL' });
          await inputDialog.locator('input[type="url"]').fill(manifest.baseUrl);
          await inputDialog.getByRole('button', { name: 'Load', exact: true }).click();
        } else {
          await recipientPage.goto(viewerUrl);
        }
        await expect(recipientPage.getByText('Source:', { exact: false }).first()).toBeVisible({ timeout: 45000 });
        await expect(recipientPage.locator('canvas').first()).toBeVisible();
        await expect(recipientPage.getByTestId('scene-3d')).toHaveCSS('background-color', publishedBackground);
        expect(hub.reads.slice(readStart).some(read => read.path.endsWith('/colmapview.yaml'))).toBe(true);
        expect(hub.reads.slice(readStart).some(read => read.path.endsWith('/colmapview-state.json'))).toBe(false);
        expect(errors).toEqual([]);
        const reads = hub.reads.slice(readStart);
        expect(reads.every(read => !read.authorization)).toBe(true);
        expect(reads.some(read => read.path.includes('/resolve/main/'))).toBe(mode === 'shared');
      } finally { await recipient.close(); }
    }
  });

  test('recovers a private upload and opens its link only after a recipient signs in', async ({ page, context, browser, baseURL }) => {
    test.setTimeout(120_000);
    const hub = mockHub(); hub.failMetadata();
    await hub.attach(context, baseURL!); await page.goto('/');
    const image = readFileSync(new URL('./fixtures/test-data/masks/photo.jpg.png', import.meta.url)).toString('base64');
    await loadTestDataset(page, ['photo.jpg', 'photo-2.jpg'].map(name => ({ relativePath: `images/${name}`, name, base64: image })));
    await expect(page.getByText('Source:', { exact: false }).first()).toBeVisible({ timeout: 45000 });
    await openPublisher(page);
    const dialog = page.getByRole('dialog', { name: 'Publish to Hugging Face' });
    await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await dialog.getByLabel('Repository name', { exact: true }).fill('scene');
    await dialog.getByLabel('Dataset title', { exact: true }).fill('Complete dataset');
    await dialog.getByLabel('Dataset license', { exact: true }).selectOption('cc0-1.0');
    await expect(dialog.getByRole('checkbox', { name: 'List on Hub', exact: true })).toHaveCount(0);
    await dialog.getByRole('combobox', { name: 'Access' }).selectOption('private');
    await expect(dialog.getByText('Also creates an unguessable ColmapView Hub link. Anyone with it sees the title, description and preview; the data still needs access.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Save private dataset', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Check previous upload and retry' })).toBeVisible({ timeout: 45000 });
    const dataCommit = hub.commits[0].id;
    await dialog.getByRole('button', { name: 'Close publish dataset' }).click();
    await openPublisher(page);
    await dialog.getByRole('button', { name: 'Check previous upload and retry' }).click();
    await expect(dialog.getByRole('region', { name: 'Published dataset' })).toBeVisible({ timeout: 45000 });
    expect(hub.commits).toHaveLength(3);
    expect(hub.commits[1].id).toBe(dataCommit);
    expect(JSON.parse(hub.files.get('colmapview.json')!.toString()).skipImages).toBe(false);
    expect(hub.files.has('images/photo.jpg')).toBe(true);
    expect(hub.files.has('masks/photo.jpg.png')).toBe(true);
    expect(hub.visibility).toBe('private');
    const requests = shorteningRequests.get(page)!;
    expect(requests).toHaveLength(1);
    expect(requests[0].access).toBe('private');
    expect(hub.reads.every(read => read.authorization === 'Bearer hf_browser_test_only')).toBe(true);
    await expect(dialog.getByText('Private. Viewers must sign in to Hugging Face with an account that has access.')).toBeVisible();
    await expect(dialog.getByLabel('Share link', { exact: true })).toHaveValue(longUrl);
    await expect(dialog.getByRole('region', { name: 'Published dataset' })).toContainText('Saved publisher/scene privately');
    const viewerUrl = `${new URL('/', baseURL).href}?url=https://huggingface.co/datasets/publisher/scene`;
    expect(viewerUrl).toBe(`${new URL('/', baseURL).href}?url=https://huggingface.co/datasets/publisher/scene`);
    for (const mode of ['shared', 'manual'] as const) {
      const recipient = await browser.newContext();
      try {
        await hub.attach(recipient, baseURL!);
        const recipientPage = await recipient.newPage();
        const readStart = hub.reads.length;
        if (mode === 'manual') {
          await recipientPage.goto('/');
          await recipientPage.getByRole('button', { name: 'Load URL', exact: true }).click();
          const inputDialog = recipientPage.getByRole('dialog', { name: 'Load from URL' });
          await inputDialog.locator('input[type="url"]').fill(new URL(viewerUrl).searchParams.get('url')!);
          await inputDialog.getByRole('button', { name: 'Load', exact: true }).click();
        } else {
          await recipientPage.goto(viewerUrl);
        }
        const account = recipientPage.getByRole('dialog', { name: 'Hugging Face', exact: true });
        await expect(account).toBeVisible();
        expect(hub.reads.slice(readStart).some(read => !read.authorization)).toBe(true);
        await expect(recipientPage.getByText('Source:', { exact: false }).first()).not.toBeVisible();
        await account.getByRole('button', { name: 'Sign in with Hugging Face', exact: true }).click();
        await account.getByRole('button', { name: 'Retry loading', exact: true }).click();
        await expect(recipientPage.getByText('Source:', { exact: false }).first()).toBeVisible({ timeout: 45000 });
        const fileReads = hub.reads.slice(readStart).filter(read => /\/resolve\//.test(read.path));
        expect(fileReads.some(read => read.path.endsWith('/colmapview.yaml') && read.authorization)).toBe(true);
        expect(fileReads.filter(read => read.authorization).every(read => read.authorization === 'Bearer hf_browser_test_only')).toBe(true);
      } finally { await recipient.close(); }
    }
  });

  test('retries automatic shortening without repeating a public upload or listing it', async ({ page, context, baseURL }) => {
    const hub = mockHub();
    await hub.attach(context, baseURL!);
    let attempts = 0;
    await page.unroute(shorteningEndpoint);
    await page.route(shorteningEndpoint, async route => {
      shorteningRequests.get(page)!.push(route.request().postDataJSON() as ShorteningRequest);
      attempts++;
      await route.fulfill(attempts === 1 ? { status: 503, contentType: 'text/plain', body: 'Temporary failure' }
        : { json: { url: shortUrl, managementPath: '/hub/manage/HappyTree' } });
    });
    await page.goto('/');
    const image = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 3;
      const context = canvas.getContext('2d')!; context.fillStyle = '#d04030'; context.fillRect(0, 0, 4, 3);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await loadTestDataset(page, ['photo.jpg', 'photo-2.jpg'].map(name => ({ relativePath: `images/${name}`, name, base64: image })));
    await expect(page.getByText('Source:', { exact: false }).first()).toBeVisible({ timeout: 45000 });
    await openPublisher(page);
    const dialog = page.getByRole('dialog', { name: 'Publish to Hugging Face' });
    await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await dialog.getByLabel('Repository name', { exact: true }).fill('scene');
    await dialog.getByLabel('Dataset title', { exact: true }).fill('Public scene');
    await dialog.getByLabel('Dataset license', { exact: true }).selectOption('cc0-1.0');
    await dialog.getByRole('combobox', { name: 'Access' }).selectOption('public');
    await expect(dialog.getByRole('checkbox', { name: 'List on Hub', exact: true })).toHaveCount(0);
    await dialog.getByRole('combobox', { name: 'Format' }).selectOption('zip');
    await dialog.getByRole('combobox', { name: 'Images' }).selectOption('jpeg');
    await dialog.getByRole('button', { name: 'Publish public dataset', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Retry Hub link', exact: true })).toBeVisible({ timeout: 45000 });
    await expect(dialog.getByRole('alert')).toHaveText('Hub link not created: ColmapView Hub is unavailable. The link above still works.');
    // Archive and repository sidecars can use separate data batches before the final metadata commit.
    const dataCommit = hub.commits.at(-2)!.id;
    await expect(dialog.getByLabel('Share link', { exact: true })).toHaveValue(`${new URL('/', baseURL).href}?url=https://huggingface.co/datasets/publisher/scene/resolve/${dataCommit}/dataset.zip`);
    const writes = [...hub.writes];
    await dialog.getByRole('button', { name: 'Retry Hub link', exact: true }).click();
    await expect(dialog.getByLabel('Share link', { exact: true })).toHaveValue(shortUrl);
    expect(shorteningRequests.get(page)).toHaveLength(2);
    const requests = shorteningRequests.get(page)!;
    expect(requests[0].access).toBe('public');
    const archive = unzipSync(hub.files.get('dataset.zip')!);
    const paths = Object.keys(archive);
    for (const path of paths.filter(path => path.startsWith('images/'))) expect([...archive[path].subarray(0, 2)]).toEqual([0xff, 0xd8]);
    expect(requests[0].assets).toEqual({ format: 'zip', imageFormat: 'jpeg',
      colmap: { files: paths.filter(path => path.startsWith('sparse/0/')).length,
        cameras: Number(Buffer.from(archive['sparse/0/cameras.bin']).readBigUInt64LE(0)),
        points: Number(Buffer.from(archive['sparse/0/points3D.bin']).readBigUInt64LE(0)) },
      images: paths.filter(path => path.startsWith('images/')).length, masks: paths.filter(path => path.startsWith('masks/')).length,
      splats: paths.filter(path => path.startsWith('splats/')).length,
      viewerSettings: 'colmapview.yaml' in archive, preview: hub.files.has('colmapview-preview.png') });
    expect(requests[1]).toEqual(requests[0]);
    expect(hub.writes).toEqual(writes);
    const deleteLink = `https://hub.invalid/hub/manage/HappyTree#${requests[0].managementSecret}`;
    await expect(dialog.getByLabel('Private delete link', { exact: true })).toHaveValue(deleteLink);
    await expect(dialog.getByRole('link', { name: 'Delete Hub link' })).toHaveAttribute('href', deleteLink);
  });

  test('returns to the editable form when the repository name is taken', async ({ page, context, baseURL }) => {
    const hub = mockHub(); hub.occupy();
    await hub.attach(context, baseURL!); await page.goto('/');
    // Publishing requires the original images, which the default fixture omits.
    const image = readFileSync(new URL('./fixtures/test-data/masks/photo.jpg.png', import.meta.url)).toString('base64');
    await loadTestDataset(page, ['photo.jpg', 'photo-2.jpg'].map(name => ({ relativePath: `images/${name}`, name, base64: image })));
    await expect(page.getByText('Source:', { exact: false }).first()).toBeVisible({ timeout: 45000 });
    await openPublisher(page);
    const dialog = page.getByRole('dialog', { name: 'Publish to Hugging Face' });
    await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await dialog.getByLabel('Repository name', { exact: true }).fill('scene');
    await dialog.getByLabel('Dataset title', { exact: true }).fill('Taken name');
    await dialog.getByLabel('Dataset license', { exact: true }).selectOption('cc0-1.0');
    await dialog.getByRole('combobox', { name: 'Access' }).selectOption('public');
    await dialog.getByRole('button', { name: 'Publish public dataset', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('already exists', { timeout: 45000 });
    await expect(dialog.getByLabel('Repository name', { exact: true })).toBeEditable();
    await expect(dialog.getByRole('button', { name: 'Start a new publication' })).toHaveCount(0);
    expect(hub.commits).toHaveLength(1);
  });

  test('lays the preview beside the fields on desktop and above them on a phone', async ({ page, context, baseURL }) => {
    const hub = mockHub();
    await hub.attach(context, baseURL!); await page.goto('/'); await loadTestDataset(page);
    await expect(page.getByText('Source:', { exact: false }).first()).toBeVisible({ timeout: 45000 });
    await openPublisher(page);
    const dialog = page.getByRole('dialog', { name: 'Publish to Hugging Face' });
    const preview = dialog.getByRole('region', { name: 'Dataset preview' });
    const fields = dialog.getByRole('region', { name: 'Dataset details' });
    await expect(fields).toBeVisible();
    let previewBox = (await preview.boundingBox())!;
    let fieldsBox = (await fields.boundingBox())!;
    expect(previewBox.x + previewBox.width).toBeLessThanOrEqual(fieldsBox.x);
    await dialog.screenshot({ path: test.info().outputPath('publication-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    // Preview capture can resize both rows; sample both bounds on every retry.
    await expect.poll(async () => {
      const [previewBounds, fieldsBounds] = await Promise.all([preview.boundingBox(), fields.boundingBox()]);
      return previewBounds!.y + previewBounds!.height - fieldsBounds!.y;
    }).toBeLessThanOrEqual(1);
    previewBox = (await preview.boundingBox())!;
    fieldsBox = (await fields.boundingBox())!;
    expect(previewBox.y + previewBox.height).toBeLessThanOrEqual(fieldsBox.y + 1);
    await dialog.screenshot({ path: test.info().outputPath('publication-phone.png') });
    await page.setViewportSize({ width: 320, height: 568 });
    const heading = dialog.getByRole('heading', { name: 'Publish to Hugging Face' });
    const expectReadableHeader = async () => {
      await expect.poll(() => heading.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      await expect(dialog.getByRole('button', { name: 'Close publish dataset', exact: true })).toBeInViewport();
    };
    await expectReadableHeader();
    await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible({ timeout: 30000 });
    await expectReadableHeader();
  });

  test('keeps the loaded dataset when sign-in consent is declined', async ({ page, context, baseURL }) => {
    const hub = mockHub(); hub.denyConsent();
    await hub.attach(context, baseURL!); await page.goto('/'); await loadTestDataset(page);
    await expect(page.getByText('Source:', { exact: false }).first()).toBeVisible({ timeout: 45000 });
    await openPublisher(page);
    const dialog = page.getByRole('dialog', { name: 'Publish to Hugging Face' });
    await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Hugging Face sign-in was declined.');
    expect(hub.writes).toHaveLength(0);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText('Source:', { exact: false }).first()).toBeVisible();
  });
});
