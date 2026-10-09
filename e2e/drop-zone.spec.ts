import { test, expect } from './fixtures/test-fixtures';

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
