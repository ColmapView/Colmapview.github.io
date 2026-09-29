import { test, expect } from './fixtures/test-fixtures';
import { loadTestDataset } from './fixtures/load-test-data';
import { createMockHuggingFace } from './fixtures/mock-hugging-face';
import { readFileSync } from 'node:fs';

const mocks = new Set<ReturnType<typeof createMockHuggingFace>>();
const mockHub = (options: { lfs?: boolean } = {}) => {
  const hub = createMockHuggingFace(options); mocks.add(hub); return hub;
};
test.afterEach(async () => { await Promise.all([...mocks].map(hub => hub.close())); mocks.clear(); });

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
    await page.getByRole('button', { name: 'Publish to Hugging Face', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Publish to Hugging Face' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible({ timeout: 30000 });
    await dialog.getByLabel('Repository name', { exact: true }).fill('scene');
    await dialog.getByLabel('Dataset title', { exact: true }).fill('Browser test scene');
    await dialog.getByLabel('Dataset license', { exact: true }).selectOption('cc-by-4.0');
    await expect(dialog.getByRole('checkbox')).toHaveCount(0);
    await expect(dialog.getByText(/public, discoverable dataset/)).toBeVisible();
    await dialog.screenshot({ path: test.info().outputPath('publication-form.png') });
    expect(hub.writes).toHaveLength(0);
    await dialog.getByRole('button', { name: 'Publish public dataset', exact: true }).click();
    await expect(dialog.getByRole('region', { name: 'Published dataset' })).toBeVisible({ timeout: 45000 });
    await dialog.screenshot({ path: test.info().outputPath('publication-result.png') });
    expect(publisherErrors).toEqual([]);
    expect(hub.files.get('images/photo.jpg')).toEqual(Buffer.from(original, 'base64'));
    expect(hub.files.has('masks/photo.jpg.png')).toBe(true);
    expect(hub.writes.some(path => path.endsWith('/info/lfs/objects/batch'))).toBe(true);
    expect(hub.writes.some(path => path.startsWith('/mock-complete/'))).toBe(true);
    const viewerUrl = await dialog.getByLabel('Viewer link', { exact: true }).inputValue();
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
    // The dialog and the dataset card share one clean link: the viewer followed by the dataset page.
    expect(viewerUrl).toBe(`${new URL('/', baseURL).href}?url=https://huggingface.co/datasets/publisher/scene`);
    expect(readmeViewerUrl).toBe(viewerUrl);
    expect(readme).toContain(`Viewer link: <${viewerUrl}>`);
    expect(hub.reads.every(read => !read.authorization)).toBe(true);
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

  test('recovers a rejected metadata commit without uploading data again', async ({ page, context, baseURL }) => {
    const hub = mockHub(); hub.failMetadata();
    await hub.attach(context, baseURL!); await page.goto('/');
    const image = readFileSync(new URL('./fixtures/test-data/masks/photo.jpg.png', import.meta.url)).toString('base64');
    await loadTestDataset(page, ['photo.jpg', 'photo-2.jpg'].map(name => ({ relativePath: `images/${name}`, name, base64: image })));
    await expect(page.getByText('Source:', { exact: false }).first()).toBeVisible({ timeout: 45000 });
    await page.getByRole('button', { name: 'Publish to Hugging Face', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Publish to Hugging Face' });
    await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await dialog.getByLabel('Repository name', { exact: true }).fill('scene');
    await dialog.getByLabel('Dataset title', { exact: true }).fill('Complete dataset');
    await dialog.getByLabel('Dataset license', { exact: true }).selectOption('cc0-1.0');
    await dialog.getByRole('button', { name: 'Publish public dataset', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Check previous upload and retry' })).toBeVisible({ timeout: 45000 });
    const dataCommit = hub.commits[0].id;
    await dialog.getByRole('button', { name: 'Close publish dataset' }).click();
    await page.getByRole('button', { name: 'Publish to Hugging Face', exact: true }).click();
    await dialog.getByRole('button', { name: 'Check previous upload and retry' }).click();
    await expect(dialog.getByRole('region', { name: 'Published dataset' })).toBeVisible({ timeout: 45000 });
    expect(hub.commits).toHaveLength(3);
    expect(hub.commits[1].id).toBe(dataCommit);
    expect(JSON.parse(hub.files.get('colmapview.json')!.toString()).skipImages).toBe(false);
    expect(hub.files.has('images/photo.jpg')).toBe(true);
    expect(hub.files.has('masks/photo.jpg.png')).toBe(true);
  });

  test('returns to the editable form when the repository name is taken', async ({ page, context, baseURL }) => {
    const hub = mockHub(); hub.occupy();
    await hub.attach(context, baseURL!); await page.goto('/');
    // Publishing requires the original images, which the default fixture omits.
    const image = readFileSync(new URL('./fixtures/test-data/masks/photo.jpg.png', import.meta.url)).toString('base64');
    await loadTestDataset(page, ['photo.jpg', 'photo-2.jpg'].map(name => ({ relativePath: `images/${name}`, name, base64: image })));
    await expect(page.getByText('Source:', { exact: false }).first()).toBeVisible({ timeout: 45000 });
    await page.getByRole('button', { name: 'Publish to Hugging Face', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Publish to Hugging Face' });
    await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await dialog.getByLabel('Repository name', { exact: true }).fill('scene');
    await dialog.getByLabel('Dataset title', { exact: true }).fill('Taken name');
    await dialog.getByLabel('Dataset license', { exact: true }).selectOption('cc0-1.0');
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
    await page.getByRole('button', { name: 'Publish to Hugging Face', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Publish to Hugging Face' });
    const preview = dialog.getByRole('region', { name: 'Dataset preview' });
    const fields = dialog.getByRole('region', { name: 'Dataset details' });
    await expect(fields).toBeVisible();
    let previewBox = (await preview.boundingBox())!;
    let fieldsBox = (await fields.boundingBox())!;
    expect(previewBox.x + previewBox.width).toBeLessThanOrEqual(fieldsBox.x);
    await dialog.screenshot({ path: test.info().outputPath('publication-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => (await preview.boundingBox())!.y + (await preview.boundingBox())!.height)
      .toBeLessThanOrEqual((await fields.boundingBox())!.y + 1);
    previewBox = (await preview.boundingBox())!;
    fieldsBox = (await fields.boundingBox())!;
    expect(previewBox.y + previewBox.height).toBeLessThanOrEqual(fieldsBox.y + 1);
    await dialog.screenshot({ path: test.info().outputPath('publication-phone.png') });
  });

  test('keeps the loaded dataset when sign-in consent is declined', async ({ page, context, baseURL }) => {
    const hub = mockHub(); hub.denyConsent();
    await hub.attach(context, baseURL!); await page.goto('/'); await loadTestDataset(page);
    await expect(page.getByText('Source:', { exact: false }).first()).toBeVisible({ timeout: 45000 });
    await page.getByRole('button', { name: 'Publish to Hugging Face', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Publish to Hugging Face' });
    await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Hugging Face sign-in was declined.');
    expect(hub.writes).toHaveLength(0);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText('Source:', { exact: false }).first()).toBeVisible();
  });
});
