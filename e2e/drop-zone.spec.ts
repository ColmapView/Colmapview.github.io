import { test, expect } from './fixtures/test-fixtures';

test.describe('DropZone', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500); // Wait for app to fully initialize
  });

  test('should display empty state panel on initial load', async ({ dropZone }) => {
    await dropZone.waitForEmptyState();
    expect(await dropZone.isEmptyStateVisible()).toBe(true);
  });

  test('should show Load URL, Load JSON, and Try a Toy buttons', async ({ page }) => {
    await expect(page.locator('button:has-text("Load URL")')).toBeVisible();
    await expect(page.locator('button:has-text("Load JSON")')).toBeVisible();
    await expect(page.locator('button:has-text("Try a Toy!")')).toBeVisible();
  });

  test('should open URL modal when clicking Load URL button', async ({ dropZone, page }) => {
    await dropZone.clickLoadUrl();
    await page.waitForTimeout(200);
    expect(await dropZone.isUrlModalOpen()).toBe(true);
  });

  test('should close URL modal when clicking Cancel', async ({ dropZone, page }) => {
    await dropZone.clickLoadUrl();
    await page.waitForTimeout(200);
    expect(await dropZone.isUrlModalOpen()).toBe(true);

    // Click Cancel button
    await page.locator('[data-testid="url-modal"] button:has-text("Cancel")').click();
    await page.waitForTimeout(200);
    expect(await dropZone.isUrlModalOpen()).toBe(false);
  });

  test('should close URL modal when clicking backdrop', async ({ dropZone, page }) => {
    await dropZone.clickLoadUrl();
    await page.waitForTimeout(200);
    expect(await dropZone.isUrlModalOpen()).toBe(true);

    // Click on the backdrop (the parent overlay)
    await page.locator('.fixed.inset-0').click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(200);
    expect(await dropZone.isUrlModalOpen()).toBe(false);
  });

  test('should have disabled Load button when URL is empty', async ({ dropZone, page }) => {
    await dropZone.clickLoadUrl();
    await page.waitForTimeout(200);
    const loadButton = page.locator('[data-testid="url-modal"] button:has-text("Load")');
    await expect(loadButton).toBeDisabled();
  });

  test('should dismiss empty state panel when clicking X', async ({ dropZone, page }) => {
    await dropZone.waitForEmptyState();
    await dropZone.dismissEmptyState();
    await page.waitForTimeout(200);
    expect(await dropZone.isEmptyStateVisible()).toBe(false);
  });

  test('should have drop zone container', async ({ page }) => {
    const dropZone = page.locator('[data-testid="drop-zone"]');
    await expect(dropZone).toBeVisible();
  });

  test('should show Load COLMAP Data title', async ({ page }) => {
    // The empty state should show the title
    await expect(page.locator('h2:has-text("Load COLMAP Data")')).toBeVisible();
  });
});
