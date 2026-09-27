import { test, expect } from './fixtures/test-fixtures';
import { loadTestDataset } from './fixtures/load-test-data';
import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';

test.describe('Mask Export', () => {
  test.setTimeout(60000);

  for (const media of ['Images', 'Masks'] as const) {
    test(`should download available ${media.toLowerCase()} and report a partial export`, async ({ page }) => {
      await page.goto('/');
      const closeButton = page.getByRole('button', { name: 'Dismiss this panel', exact: true });
      if (await closeButton.isVisible()) await closeButton.click();

      const pngBytes = readFileSync(new URL('./fixtures/test-data/masks/photo.jpg.png', import.meta.url));
      await loadTestDataset(page, media === 'Images' ? [{
        relativePath: 'images/photo.jpg',
        name: 'photo.jpg',
        base64: await page.evaluate(() => {
          const canvas = document.createElement('canvas');
          canvas.width = 4;
          canvas.height = 3;
          return canvas.toDataURL('image/png').split(',')[1];
        }),
      }] : []);
      await expect(page.locator('text=Source:')).toBeVisible({ timeout: 45000 });

      const exportButton = page.locator('button[aria-label*="Export" i], button[data-tooltip*="Export" i]').first();
      await expect(exportButton).toBeEnabled();
      await exportButton.hover();
      const downloadButton = page.getByRole('button', { name: `Download ${media}`, exact: true });
      await expect(downloadButton).toBeVisible();

      const downloadPromise = page.waitForEvent('download');
      await downloadButton.click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe(`${media.toLowerCase()}.zip`);
      await expect(page.getByText(`Exported 1 of 2 ${media.toLowerCase()}; 1 could not be exported.`, { exact: true }))
        .toBeVisible();

      const entries = unzipSync(readFileSync((await download.path())!));
      if (media === 'Images') {
        expect(Object.keys(entries)).toEqual(['images/photo.jpg']);
        expect(Array.from(entries['images/photo.jpg'].slice(0, 2))).toEqual([0xff, 0xd8]);
      } else {
        expect(Object.keys(entries)).toEqual(['masks/photo.jpg.png']);
        expect(Buffer.from(entries['masks/photo.jpg.png'])).toEqual(pngBytes);
      }
    });
  }

  test('should show Masks section in Export panel when dataset has masks', async ({ page }) => {
    await page.goto('/');

    // Dismiss the empty state panel
    const closeButton = page.getByRole('button', { name: 'Dismiss this panel', exact: true });
    if (await closeButton.isVisible({ timeout: 2000 })) {
      await closeButton.click();
    }

    // Load test dataset with masks
    await loadTestDataset(page);

    await expect(page.locator('text=Source:')).toBeVisible({ timeout: 45000 });

    // Open the Export panel — it's the button with the Export tooltip
    const exportButton = page.locator('button[aria-label*="Export" i], button[data-tooltip*="Export" i]').first();
    await expect(exportButton).toBeVisible({ timeout: 10000 });
    await expect(exportButton).toBeEnabled({ timeout: 15000 });
    await exportButton.hover();
    await expect(page.getByText('Reconstruction', { exact: true })).toBeVisible({ timeout: 5000 });

    // Verify mask export is available when loaded files include masks.
    await expect(page.locator('button:has-text("Download Masks")')).toBeVisible({ timeout: 5000 });

    // Verify there are separate reconstruction and image/mask download actions.
    const downloadButtons = page.locator('button:has-text("Download")');
    const downloadCount = await downloadButtons.count();
    expect(downloadCount).toBeGreaterThanOrEqual(3);

    await page.locator('select').first().selectOption('zip');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download COLMAP', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('reconstruction.zip');
  });

  test('should download binary reconstruction files from the Export panel', async ({ page }) => {
    await page.goto('/');

    const closeButton = page.getByRole('button', { name: 'Dismiss this panel', exact: true });
    if (await closeButton.isVisible({ timeout: 2000 })) {
      await closeButton.click();
    }

    await loadTestDataset(page);
    await expect(page.locator('text=Source:')).toBeVisible({ timeout: 45000 });

    const exportButton = page.locator('button[aria-label*="Export" i], button[data-tooltip*="Export" i]').first();
    await expect(exportButton).toBeVisible({ timeout: 10000 });
    await expect(exportButton).toBeEnabled({ timeout: 15000 });
    await exportButton.hover();
    await expect(page.getByText('Reconstruction', { exact: true })).toBeVisible({ timeout: 5000 });

    const binaryDownloads: string[] = [];
    page.on('download', (download) => {
      binaryDownloads.push(download.suggestedFilename());
    });
    await page.getByRole('button', { name: 'Download COLMAP', exact: true }).click();
    await expect.poll(() => binaryDownloads.length, { timeout: 5000 }).toBeGreaterThanOrEqual(3);
    expect(binaryDownloads.slice(0, 3)).toEqual([
      'cameras.bin',
      'images.bin',
      'points3D.bin',
    ]);
  });

  test('should download PLY point cloud from the Export panel', async ({ page }) => {
    await page.goto('/');

    const closeButton = page.getByRole('button', { name: 'Dismiss this panel', exact: true });
    if (await closeButton.isVisible({ timeout: 2000 })) {
      await closeButton.click();
    }

    await loadTestDataset(page);
    await expect(page.locator('text=Source:')).toBeVisible({ timeout: 45000 });

    const exportButton = page.locator('button[aria-label*="Export" i], button[data-tooltip*="Export" i]').first();
    await expect(exportButton).toBeVisible({ timeout: 10000 });
    await expect(exportButton).toBeEnabled({ timeout: 15000 });
    await exportButton.hover();
    await expect(page.getByText('Reconstruction', { exact: true })).toBeVisible({ timeout: 5000 });

    await page.locator('select').first().selectOption('ply');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download COLMAP', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('points.ply');

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const plyText = readFileSync(downloadPath!, 'utf8');
    expect(plyText).toContain('ply\nformat ascii 1.0');
    expect(plyText).toContain('element vertex ');
    expect(plyText).toContain('property uchar blue');
  });

  test('should open the camera conversion modal from the Export panel', async ({ page }) => {
    await page.goto('/');

    const closeButton = page.getByRole('button', { name: 'Dismiss this panel', exact: true });
    if (await closeButton.isVisible({ timeout: 2000 })) {
      await closeButton.click();
    }

    await loadTestDataset(page);
    await expect(page.locator('text=Source:')).toBeVisible({ timeout: 45000 });

    const exportButton = page.locator('button[aria-label*="Export" i], button[data-tooltip*="Export" i]').first();
    await expect(exportButton).toBeVisible({ timeout: 10000 });
    await expect(exportButton).toBeEnabled({ timeout: 15000 });
    await exportButton.hover();
    await expect(page.getByText('Reconstruction', { exact: true })).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: 'Convert Camera Model' }).click();

    const modal = page.getByTestId('camera-conversion-modal');
    await expect(modal).toBeVisible();
    await expect(modal.getByText('Convert Camera Model')).toBeVisible();
    await expect(modal.locator('select').first()).toBeVisible();
    await expect(modal.locator('select').nth(1)).toBeVisible();

    const convertButton = modal.getByRole('button', { name: /^Convert/ });
    await expect(convertButton).toBeDisabled();
    await modal.locator('select').nth(1).selectOption({ index: 1 });
    await expect(convertButton).toBeEnabled();
  });

  test('should NOT show Masks section when no dataset is loaded', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="drop-zone"]')).toBeVisible();

    // Without loading data, check that the page doesn't show Masks anywhere
    // The Export button is disabled when no reconstruction is loaded,
    // so the panel can't be opened — just verify no "Masks:" label exists on page
    const masksLabel = page.locator('text=Masks:');
    await expect(masksLabel).not.toBeVisible();
  });
});
