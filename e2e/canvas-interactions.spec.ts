import { test, expect } from './fixtures/test-fixtures';

test.describe('Canvas Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Dismiss the empty state panel to access the canvas
    const closeButton = page.locator('button:has-text("×")').first();
    if (await closeButton.isVisible()) {
      await closeButton.click();
      await page.waitForTimeout(300);
    }
  });

  test('should render WebGL canvas', async ({ scene3d }) => {
    await scene3d.waitForCanvasReady();
    await expect(scene3d.canvas).toBeVisible();
  });

  test('should have canvas with proper dimensions', async ({ scene3d }) => {
    await scene3d.waitForCanvasReady();
    const box = await scene3d.getCanvasBoundingBox();

    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(100);
    expect(box!.height).toBeGreaterThan(100);
  });

  test('should have scene-3d container', async ({ scene3d }) => {
    await scene3d.waitForCanvasReady();
    await expect(scene3d.container).toBeVisible();
  });

  test('should handle left-click drag for rotation', async ({ scene3d }) => {
    await scene3d.waitForCanvasReady();

    const box = await scene3d.getCanvasBoundingBox();
    expect(box).not.toBeNull();

    // Perform a drag
    await scene3d.dragCanvas(
      box!.width / 2,
      box!.height / 2,
      box!.width / 2 + 100,
      box!.height / 2
    );

    // Canvas should still be visible after interaction
    await expect(scene3d.canvas).toBeVisible();
  });

  test('should handle scroll for zoom', async ({ scene3d }) => {
    await scene3d.waitForCanvasReady();

    // Scroll to zoom
    await scene3d.scrollCanvas(-100);
    await scene3d.page.waitForTimeout(100);
    await scene3d.scrollCanvas(100);

    // Canvas should still be visible
    await expect(scene3d.canvas).toBeVisible();
  });

  test('should allow clicking on canvas', async ({ scene3d }) => {
    await scene3d.waitForCanvasReady();

    // Click on canvas
    await scene3d.clickCanvas();
    await scene3d.page.waitForTimeout(100);

    // Canvas should still be visible
    await expect(scene3d.canvas).toBeVisible();
  });

  test('should handle multiple drag operations', async ({ scene3d }) => {
    await scene3d.waitForCanvasReady();

    const box = await scene3d.getCanvasBoundingBox();
    expect(box).not.toBeNull();

    // Perform multiple drags
    for (let i = 0; i < 3; i++) {
      await scene3d.dragCanvas(
        box!.width / 2,
        box!.height / 2,
        box!.width / 2 + 50,
        box!.height / 2 + 50
      );
      await scene3d.page.waitForTimeout(100);
    }

    // Canvas should still be visible
    await expect(scene3d.canvas).toBeVisible();
  });
});
