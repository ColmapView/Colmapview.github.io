import { test, expect } from './fixtures/test-fixtures';
import { loadTestDataset } from './fixtures/load-test-data';

test.describe('ImageGallery', () => {
  test('renders grid and list image items after loading a dataset', async ({ page }) => {
    await page.goto('/');

    const closeButton = page.locator('button:has-text("×")').first();
    if (await closeButton.isVisible({ timeout: 2000 })) {
      await closeButton.click();
    }

    await loadTestDataset(page);
    await expect(page.locator('text=Source:')).toBeVisible({ timeout: 45000 });

    const galleryImage = page.getByText('photo.jpg').first();
    await expect(galleryImage).toBeVisible({ timeout: 10000 });

    await galleryImage.hover();
    await expect(page.getByText('1 3D points')).toBeVisible({ timeout: 5000 });

    await page.locator('button[data-tooltip="List view with stats"]').click();

    const listItems = page.locator('.list-stats-container');
    await expect(listItems).toHaveCount(2);

    await expect(listItems.filter({ hasText: 'photo.jpg' })).toBeVisible();
    await expect(listItems.filter({ hasText: 'photo-2.jpg' })).toBeVisible();
    await expect(listItems.filter({ hasText: 'photo.jpg' }).getByText('pts · covis · err')).toBeVisible();
    await expect(listItems.filter({ hasText: 'photo-2.jpg' }).getByText('pts · covis · err')).toBeVisible();
  });
});
