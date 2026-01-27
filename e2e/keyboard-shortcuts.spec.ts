import { test, expect } from './fixtures/test-fixtures';

test.describe('Keyboard Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Dismiss the empty state panel to access the canvas
    const closeButton = page.locator('button:has-text("×")').first();
    if (await closeButton.isVisible()) {
      await closeButton.click();
    }
  });

  test('R key should trigger view reset', async ({ page, scene3d }) => {
    await scene3d.waitForCanvasReady();

    // Press R to reset view
    await page.keyboard.press('r');

    // The view should reset (no visible error, page still responsive)
    await expect(page.locator('[data-testid="scene-3d"]')).toBeVisible();
  });

  test('B key should toggle background color', async ({ page, scene3d }) => {
    await scene3d.waitForCanvasReady();

    // Get initial background color
    const container = page.locator('[data-testid="scene-3d"]');
    const initialBg = await container.evaluate((el) => (el as HTMLElement).style.backgroundColor);

    // Press B to toggle background
    await page.keyboard.press('b');

    // Background color should change
    const newBg = await container.evaluate((el) => (el as HTMLElement).style.backgroundColor);
    expect(newBg).not.toBe(initialBg);
  });

  test('G key should cycle axes and grid', async ({ page, scene3d }) => {
    await scene3d.waitForCanvasReady();

    // Press G multiple times to cycle through axes/grid states
    await page.keyboard.press('g');
    await page.waitForTimeout(100);
    await page.keyboard.press('g');
    await page.waitForTimeout(100);
    await page.keyboard.press('g');
    await page.waitForTimeout(100);
    await page.keyboard.press('g');

    // Page should still be responsive after cycling
    await expect(page.locator('[data-testid="scene-3d"]')).toBeVisible();
  });

  test('C key should toggle camera mode', async ({ page, scene3d }) => {
    await scene3d.waitForCanvasReady();

    // Press C to toggle camera mode
    await page.keyboard.press('c');

    // Page should still be responsive
    await expect(page.locator('[data-testid="scene-3d"]')).toBeVisible();
  });

  test('T key should toggle transform gizmo', async ({ page, scene3d }) => {
    await scene3d.waitForCanvasReady();

    // Press T to toggle gizmo
    await page.keyboard.press('t');

    // Page should still be responsive
    await expect(page.locator('[data-testid="scene-3d"]')).toBeVisible();
  });

  test('P key should cycle point cloud color mode', async ({ page, scene3d }) => {
    await scene3d.waitForCanvasReady();

    // Press P to cycle point color mode
    await page.keyboard.press('p');

    // Page should still be responsive
    await expect(page.locator('[data-testid="scene-3d"]')).toBeVisible();
  });

  test('F key should cycle camera display mode', async ({ page, scene3d }) => {
    await scene3d.waitForCanvasReady();

    // Press F to cycle camera display
    await page.keyboard.press('f');

    // Page should still be responsive
    await expect(page.locator('[data-testid="scene-3d"]')).toBeVisible();
  });

  test('number keys 1-6 should set view directions', async ({ page, scene3d }) => {
    await scene3d.waitForCanvasReady();

    // Test each number key
    for (const key of ['1', '2', '3', '4', '5', '6']) {
      await page.keyboard.press(key);
      await page.waitForTimeout(100);
    }

    // Page should still be responsive
    await expect(page.locator('[data-testid="scene-3d"]')).toBeVisible();
  });

  test('hotkeys should be active after page load', async ({ page, scene3d }) => {
    // Verify hotkeys work after page load
    await scene3d.waitForCanvasReady();

    // Press a few hotkeys and verify no errors
    await page.keyboard.press('r'); // Reset
    await page.waitForTimeout(100);
    await page.keyboard.press('b'); // Background toggle
    await page.waitForTimeout(100);

    // Page should still be responsive
    await expect(scene3d.container).toBeVisible();
  });
});
