import { test, expect } from './fixtures/test-fixtures';
import { loadTestDataset } from './fixtures/load-test-data';
import { readFileSync } from 'node:fs';

test.describe('Mask Export', () => {
  test.setTimeout(60000);

  test('should show Masks section in Export panel when dataset has masks', async ({ page }) => {
    await page.goto('/');

    // Dismiss the empty state panel
    const closeButton = page.locator('button:has-text("×")').first();
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
    await expect(page.locator('text=Reconstruction:')).toBeVisible({ timeout: 5000 });

    // Verify mask export is available when loaded files include masks.
    await expect(page.locator('button:has-text("Download Masks")')).toBeVisible({ timeout: 5000 });

    // Verify there are separate reconstruction and image/mask download actions.
    const downloadButtons = page.locator('button:has-text("Download")');
    const downloadCount = await downloadButtons.count();
    expect(downloadCount).toBeGreaterThanOrEqual(3);

    await page.locator('select').first().selectOption('zip');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('reconstruction.zip');
  });

  test('should download binary reconstruction files from the Export panel', async ({ page }) => {
    await page.goto('/');

    const closeButton = page.locator('button:has-text("×")').first();
    if (await closeButton.isVisible({ timeout: 2000 })) {
      await closeButton.click();
    }

    await loadTestDataset(page);
    await expect(page.locator('text=Source:')).toBeVisible({ timeout: 45000 });

    const exportButton = page.locator('button[aria-label*="Export" i], button[data-tooltip*="Export" i]').first();
    await expect(exportButton).toBeVisible({ timeout: 10000 });
    await expect(exportButton).toBeEnabled({ timeout: 15000 });
    await exportButton.hover();
    await expect(page.locator('text=Reconstruction:')).toBeVisible({ timeout: 5000 });

    const binaryDownloads: string[] = [];
    page.on('download', (download) => {
      binaryDownloads.push(download.suggestedFilename());
    });
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    await expect.poll(() => binaryDownloads.length, { timeout: 5000 }).toBeGreaterThanOrEqual(3);
    expect(binaryDownloads.slice(0, 3)).toEqual([
      'cameras.bin',
      'images.bin',
      'points3D.bin',
    ]);
  });

  test('should download PLY point cloud from the Export panel', async ({ page }) => {
    await page.goto('/');

    const closeButton = page.locator('button:has-text("×")').first();
    if (await closeButton.isVisible({ timeout: 2000 })) {
      await closeButton.click();
    }

    await loadTestDataset(page);
    await expect(page.locator('text=Source:')).toBeVisible({ timeout: 45000 });

    const exportButton = page.locator('button[aria-label*="Export" i], button[data-tooltip*="Export" i]').first();
    await expect(exportButton).toBeVisible({ timeout: 10000 });
    await expect(exportButton).toBeEnabled({ timeout: 15000 });
    await exportButton.hover();
    await expect(page.locator('text=Reconstruction:')).toBeVisible({ timeout: 5000 });

    await page.locator('select').first().selectOption('ply');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download', exact: true }).click();
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

    const closeButton = page.locator('button:has-text("×")').first();
    if (await closeButton.isVisible({ timeout: 2000 })) {
      await closeButton.click();
    }

    await loadTestDataset(page);
    await expect(page.locator('text=Source:')).toBeVisible({ timeout: 45000 });

    const exportButton = page.locator('button[aria-label*="Export" i], button[data-tooltip*="Export" i]').first();
    await expect(exportButton).toBeVisible({ timeout: 10000 });
    await expect(exportButton).toBeEnabled({ timeout: 15000 });
    await exportButton.hover();
    await expect(page.locator('text=Reconstruction:')).toBeVisible({ timeout: 5000 });

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
