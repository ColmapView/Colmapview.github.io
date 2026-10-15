import { test, expect } from './fixtures/test-fixtures';
import { readFileSync } from 'node:fs';

test.describe('DropZone', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display empty state panel on initial load', async ({ dropZone }) => {
    await dropZone.waitForEmptyState();
    expect(await dropZone.isEmptyStateVisible()).toBe(true);
  });

  test('should show Load URL, Load manifest, and Try a Toy buttons', async ({ page }) => {
    await expect(page.locator('button:has-text("Load URL")')).toBeVisible();
    await expect(page.locator('button:has-text("Load manifest")')).toBeVisible();
    await expect(page.locator('button:has-text("Try a Toy!")')).toBeVisible();
  });

  test('should open URL modal when clicking Load URL button', async ({ dropZone, page }) => {
    await dropZone.clickLoadUrl();
    await expect(page.locator('[data-testid="url-modal"]')).toBeVisible();
  });

  test('should close URL modal when clicking Cancel', async ({ dropZone, page }) => {
    await dropZone.clickLoadUrl();
    await expect(dropZone.urlModal).toBeVisible();

    // Click Cancel button
    await page.locator('[data-testid="url-modal"] button:has-text("Cancel")').click();
    await expect(dropZone.urlModal).not.toBeVisible();
  });

  test('should close URL modal when clicking backdrop', async ({ dropZone, page }) => {
    await dropZone.clickLoadUrl();
    await expect(dropZone.urlModal).toBeVisible();

    // Click on the backdrop (the parent overlay)
    await page.locator('.fixed.inset-0').click({ position: { x: 10, y: 10 } });
    await expect(dropZone.urlModal).not.toBeVisible();
  });

  test('should have disabled Load button when URL is empty', async ({ dropZone, page }) => {
    await dropZone.clickLoadUrl();
    await expect(dropZone.urlModal).toBeVisible();
    const loadButton = page.locator('[data-testid="url-modal"] button:has-text("Load")');
    await expect(loadButton).toBeDisabled();
  });

  test('should dismiss empty state panel when clicking X', async ({ dropZone }) => {
    await dropZone.waitForEmptyState();
    await dropZone.dismissEmptyState();
    expect(await dropZone.isEmptyStateVisible()).toBe(false);
  });

  test('should have drop zone container', async ({ page }) => {
    const dropZone = page.locator('[data-testid="drop-zone"]');
    await expect(dropZone).toBeVisible();
  });

  test('should show a compact control row with info next to reset', async ({ page }) => {
    const header = page.locator('.startup-header');
    await expect(header.getByRole('heading')).toHaveCount(0);
    const reset = header.getByRole('button', { name: 'Reset all settings to defaults' });
    const info = header.getByRole('button', { name: 'Supported files and folder structure' });
    await expect(info).toBeVisible();
    const resetBounds = (await reset.boundingBox())!;
    const infoBounds = (await info.boundingBox())!;
    expect(infoBounds.x).toBeGreaterThan(resetBounds.x);
    expect(infoBounds.x - (resetBounds.x + resetBounds.width)).toBeLessThanOrEqual(8);
    expect(infoBounds.y).toBe(resetBounds.y);
  });
});

test.describe('Storage access recovery', () => {
  for (const width of [1280, 320]) {
    test(`connects and retries a private R2 shared link at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      const root = 'https://fixture.r2.cloudflarestorage.com/private-bucket/';
      const dataset = root + 'dataset/';
      const requests: boolean[] = [];
      await page.route(root + '**', async route => {
        const signed = Boolean(route.request().headers().authorization); requests.push(signed);
        if (!signed) return route.fulfill({ status: 403, body: 'Access denied' });
        const url = new URL(route.request().url());
        if (url.pathname.endsWith('/manifest.json')) return route.fulfill({ json: {
          version: 1, baseUrl: dataset, imagesPath: 'images/', files: {
            cameras: 'sparse/cameras.txt', images: 'sparse/images.txt', points3D: 'sparse/points3D.txt',
          },
        } });
        const filename = url.pathname.split('/').pop()!;
        if (['cameras.txt', 'images.txt', 'points3D.txt'].includes(filename)) return route.fulfill({
          body: readFileSync(new URL(`./fixtures/test-data/sparse/${filename}`, import.meta.url)), contentType: 'text/plain',
        });
        if (url.pathname.includes('/images/')) return route.fulfill({
          body: readFileSync(new URL('./fixtures/test-data/masks/photo.jpg.png', import.meta.url)), contentType: 'image/png',
        });
        return route.fulfill({ status: 404 });
      });
      await page.goto('/?url=' + encodeURIComponent(dataset + 'manifest.json'));
      const dialog = page.getByRole('dialog', { name: 'Bucket storage', exact: true });
      await expect(dialog).toBeVisible();
      expect(requests).toHaveLength(0);
      await expect(dialog.getByRole('textbox', { name: 'Bucket URL', exact: true })).toHaveValue(root);
      await expect(page.getByText('Error loading data', { exact: true })).toHaveCount(0);
      await dialog.locator('summary').filter({ hasText: 'CORS setup' }).click();
      await expect(dialog).toContainText('https://colmapview.opsiclear.com');
      await expect(dialog).toContainText('https://colmapview.github.io');
      const help = dialog.locator('.bucket-cors-help');
      expect(await help.evaluate(element => element.clientWidth >= element.parentElement!.clientWidth - 1)).toBe(true);
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await dialog.getByRole('textbox', { name: 'Access key ID', exact: true }).fill('fixture-access');
      await dialog.getByLabel('Secret key', { exact: true }).fill('fixture-secret');
      await dialog.getByRole('button', { name: 'Connect and retry', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByTestId('scene-3d')).toBeVisible({ timeout: 45000 });
      if (width < 768) await page.getByRole('button', { name: 'Show gallery', exact: true }).click();
      else await expect(page.getByText('Source:', { exact: false }).first()).toBeVisible();
      await expect(page.getByText('photo.jpg', { exact: true }).first()).toBeVisible();
      expect(requests.length).toBeGreaterThanOrEqual(4);
      expect(requests.every(Boolean)).toBe(true);
      expect(await page.evaluate(() => [...Object.values(localStorage), ...Object.values(sessionStorage)]
        .some(value => /fixture-access|fixture-secret/.test(value)))).toBe(false);
    });
  }
  test('offers HF sign-in for private datasets without launching OAuth automatically', async ({ page, context }) => {
    const oauthRequests: string[] = [];
    page.on('request', request => { if (request.url().includes('/oauth/authorize')) oauthRequests.push(request.url()); });
    await page.route('https://huggingface.co/**', route => route.fulfill({ status: 401, body: 'Private dataset' }));
    await page.goto('/?url=' + encodeURIComponent('https://huggingface.co/datasets/fixture/private'));
    const dialog = page.getByRole('dialog', { name: 'Hugging Face', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Sign in with Hugging Face' })).toBeVisible();
    expect(context.pages()).toHaveLength(1);
    expect(oauthRequests).toHaveLength(0);
    await expect(page.getByText('Error loading data', { exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Close account dialog' }).click();
    await page.setViewportSize({ width: 900, height: 700 });
    await expect(dialog).toHaveCount(0);
  });
  test('offers connection after a required S3 manifest denies anonymous access', async ({ page }) => {
    await page.route('https://fixture.s3.amazonaws.com/**', route => route.fulfill({ status: 403, body: 'Access denied' }));
    await page.goto('/?url=' + encodeURIComponent('https://fixture.s3.amazonaws.com/dataset/manifest.json'));
    const dialog = page.getByRole('dialog', { name: 'Bucket storage', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Bucket URL', exact: true })).toHaveValue('https://fixture.s3.amazonaws.com/');
    await expect(page.getByText('Error loading data', { exact: true })).toHaveCount(0);
  });
  test('shows the domain whitelist for genuine CORS failures without asking for credentials', async ({ page }) => {
    await page.route('https://fixture.s3.amazonaws.com/**', route => route.abort('failed'));
    await page.goto('/?url=' + encodeURIComponent('https://fixture.s3.amazonaws.com/manifest.json'));
    await expect(page.getByText('Error loading data', { exact: true })).toBeVisible();
    await expect(page.getByText(/Whitelist|whitelist/).first()).toContainText('https://colmapview.opsiclear.com');
    await expect(page.getByText(/Whitelist|whitelist/).first()).toContainText('https://colmapview.github.io');
    await expect(page.getByRole('dialog', { name: 'Bucket storage', exact: true })).toHaveCount(0);
  });
});
