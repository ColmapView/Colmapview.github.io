import { test, expect } from './fixtures/test-fixtures';

test.describe('Modal Dialogs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test.describe('URL Input Modal', () => {
    test('should have input field with placeholder', async ({ dropZone, page }) => {
      await dropZone.clickLoadUrl();
      await page.waitForTimeout(200);

      const input = page.locator('[data-testid="url-modal"] input[type="url"]');
      await expect(input).toBeVisible();
      await expect(input).toHaveAttribute('placeholder', /https/);
    });

    test('should focus input when modal opens', async ({ dropZone, page }) => {
      await dropZone.clickLoadUrl();
      await page.waitForTimeout(200);

      const input = page.locator('[data-testid="url-modal"] input[type="url"]');
      await expect(input).toBeFocused();
    });

    test('should have Cancel and Load buttons', async ({ dropZone, page }) => {
      await dropZone.clickLoadUrl();
      await page.waitForTimeout(200);

      await expect(page.locator('[data-testid="url-modal"] button:has-text("Cancel")')).toBeVisible();
      await expect(page.locator('[data-testid="url-modal"] button:has-text("Load")')).toBeVisible();
    });

    test('should close when clicking Cancel', async ({ dropZone, page }) => {
      await dropZone.clickLoadUrl();
      await page.waitForTimeout(200);
      expect(await dropZone.isUrlModalOpen()).toBe(true);

      await page.locator('[data-testid="url-modal"] button:has-text("Cancel")').click();
      await page.waitForTimeout(200);
      expect(await dropZone.isUrlModalOpen()).toBe(false);
    });

    test('should validate URL before enabling Load button', async ({ dropZone, page }) => {
      await dropZone.clickLoadUrl();
      await page.waitForTimeout(200);

      const loadButton = page.locator('[data-testid="url-modal"] button:has-text("Load")');
      const input = page.locator('[data-testid="url-modal"] input[type="url"]');

      // Initially disabled
      await expect(loadButton).toBeDisabled();

      // Enter whitespace only - should still be disabled
      await input.fill('   ');
      await expect(loadButton).toBeDisabled();

      // Enter valid URL - should be enabled
      await input.fill('https://example.com');
      await page.waitForTimeout(100);
      await expect(loadButton).toBeEnabled();
    });

    test('should have expandable help section', async ({ dropZone, page }) => {
      await dropZone.clickLoadUrl();
      await page.waitForTimeout(200);

      // Click to expand help
      const helpToggle = page.locator('[data-testid="url-modal"] button:has-text("Supported URL formats")');
      await expect(helpToggle).toBeVisible({ timeout: 5000 });
      await helpToggle.click();
      await page.waitForTimeout(300);

      // Help content should be visible - look for text within modal
      const modal = page.locator('[data-testid="url-modal"]');
      await expect(modal.locator('text=ZIP Files')).toBeVisible({ timeout: 5000 });
    });

    test('should submit with Enter key', async ({ dropZone, page }) => {
      await dropZone.clickLoadUrl();
      await page.waitForTimeout(200);

      const input = page.locator('[data-testid="url-modal"] input[type="url"]');
      await input.fill('https://example.com/reconstruction');

      // Press Enter
      await page.keyboard.press('Enter');

      // Modal should close and loading should start
      await page.waitForTimeout(500);
      expect(await dropZone.isUrlModalOpen()).toBe(false);
    });

    test('should show modal title', async ({ dropZone, page }) => {
      await dropZone.clickLoadUrl();
      await page.waitForTimeout(200);

      // Modal should have title
      await expect(page.locator('[data-testid="url-modal"]').locator('text=Load from URL')).toBeVisible();
    });
  });
});
