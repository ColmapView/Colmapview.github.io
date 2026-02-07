import { test, expect } from './fixtures/test-fixtures';
import { loadTestDataset } from './fixtures/load-test-data';

test.describe('Mask Export', () => {
  test('should show Masks section in Export panel when dataset has masks', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);

    // Dismiss the empty state panel
    const closeButton = page.locator('button:has-text("×")').first();
    if (await closeButton.isVisible()) {
      await closeButton.click();
      await page.waitForTimeout(300);
    }

    // Load test dataset with masks
    await loadTestDataset(page);

    // Wait for loading to complete (loading overlay should disappear)
    await page.waitForFunction(() => {
      const overlays = document.querySelectorAll('[class*="loading"]');
      return overlays.length === 0 || Array.from(overlays).every(el => !el.textContent?.includes('%'));
    }, { timeout: 15000 });
    await page.waitForTimeout(1000);

    // Open the Export panel — it's the button with the Export tooltip
    const exportButton = page.locator('[data-tooltip="Export"]');
    if (await exportButton.isVisible()) {
      await exportButton.click();
    } else {
      // Fallback: click buttons until we find Export panel content
      const controlButtons = page.locator('[data-testid="viewer-controls"] button');
      const count = await controlButtons.count();
      for (let i = 0; i < count; i++) {
        await controlButtons.nth(i).click();
        await page.waitForTimeout(200);
        const masksLabel = page.locator('text=Masks:');
        if (await masksLabel.isVisible()) break;
        const reconLabel = page.locator('text=Reconstruction:');
        if (await reconLabel.isVisible()) break;
      }
    }

    await page.waitForTimeout(300);

    // Verify the Masks section is visible
    const masksLabel = page.locator('text=Masks:');
    await expect(masksLabel).toBeVisible({ timeout: 5000 });

    // Verify there's a Download button inside the Masks section
    // The Masks section has its own Download button
    const downloadButtons = page.locator('button:has-text("Download")');
    const downloadCount = await downloadButtons.count();
    // Should have at least 2 Download buttons (Reconstruction + Masks)
    expect(downloadCount).toBeGreaterThanOrEqual(2);
  });

  test('should NOT show Masks section when no dataset is loaded', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);

    // Without loading data, check that the page doesn't show Masks anywhere
    // The Export button is disabled when no reconstruction is loaded,
    // so the panel can't be opened — just verify no "Masks:" label exists on page
    const masksLabel = page.locator('text=Masks:');
    await expect(masksLabel).not.toBeVisible();
  });
});
