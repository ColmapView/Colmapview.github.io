import { test, expect } from './fixtures/test-fixtures';

test.describe('ViewerControls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // Dismiss the empty state panel to access controls
    const closeButton = page.locator('button:has-text("×")').first();
    if (await closeButton.isVisible({ timeout: 2000 })) {
      await closeButton.click();
    }
  });

  test('should display viewer controls panel', async ({ viewerControls }) => {
    await viewerControls.waitForControlsReady();
    await expect(viewerControls.container).toBeVisible();
  });

  test('should have multiple control buttons', async ({ viewerControls }) => {
    await viewerControls.waitForControlsReady();

    // Count control buttons
    const buttons = viewerControls.container.locator('button');
    const count = await buttons.count();

    // Should have multiple control buttons
    expect(count).toBeGreaterThan(5);
  });

  test('should respond to button clicks', async ({ viewerControls, page }) => {
    await viewerControls.waitForControlsReady();

    const viewButton = viewerControls.getButtonByTooltip('View options');
    await expect(viewButton).toBeVisible();
    await viewButton.click();

    await expect(page.locator('button:has-text("Reset View")')).toBeVisible();
    await expect(viewerControls.container).toBeVisible();
  });

  test('control buttons should be clickable', async ({ viewerControls }) => {
    await viewerControls.waitForControlsReady();

    for (const tooltip of ['View options', 'Axes & Grid', 'Settings']) {
      const button = viewerControls.getButtonByTooltip(tooltip);
      await expect(button).toBeVisible();
      await button.click();
      await expect(viewerControls.container).toBeVisible();
    }
  });

  test('View button should show view options when clicked', async ({ viewerControls, page }) => {
    await viewerControls.waitForControlsReady();

    // Hover first button (View) to reveal the desktop flyout.
    await viewerControls.getButtonByTooltip('View options').hover();

    const resetViewButton = page.locator('button:has-text("Reset View")');
    await expect(resetViewButton).toBeVisible();
  });

  test('Settings button should show settings actions when hovered', async ({ viewerControls, page }) => {
    await viewerControls.waitForControlsReady();

    await viewerControls.getButtonByTooltip('Settings').hover();

    await expect(page.locator('button:has-text("Export Config")')).toBeVisible();
    await expect(page.locator('button:has-text("Clear Settings")')).toBeVisible();
    await expect(page.locator('button:has-text("Example manifest.json")')).toBeVisible();
  });

  test('Axes & Grid button should show axes and grid controls when hovered', async ({ viewerControls, page }) => {
    await viewerControls.waitForControlsReady();

    await viewerControls.getButtonByTooltip('Axes & Grid').hover();

    await expect(page.locator('text="Show Axes"')).toBeVisible();
    await expect(page.locator('text="Show Grid"')).toBeVisible();
    await expect(page.locator('text="System"')).toBeVisible();
    await expect(page.locator('text="Axes Scale"')).toBeVisible();
  });

  test('Point Cloud button should show point controls when hovered', async ({ viewerControls, page }) => {
    await viewerControls.waitForControlsReady();

    await viewerControls.getButtonByTooltip('Point Cloud').hover();

    await expect(page.locator('text="Show Points"')).toBeVisible();
    await expect(page.locator('text="Min Track"')).toBeVisible();
    await expect(page.locator('text="Max Error"')).toBeVisible();
  });

  test('Camera Display button should show camera controls when hovered', async ({ viewerControls, page }) => {
    await viewerControls.waitForControlsReady();

    const cameraDisplayButton = viewerControls.container.locator(
      'button[aria-label*="Frustum mode" i], button[aria-label*="Arrow mode" i], button[aria-label*="Image plane mode" i], button[aria-label*="Cameras hidden" i]'
    ).first();
    await expect(cameraDisplayButton).toBeVisible();
    await cameraDisplayButton.hover();

    await expect(page.locator('text="Show Cameras"')).toBeVisible();
    await expect(page.locator('text="Scale ×"')).toBeVisible();
    await expect(page.locator('text="Standby α"')).toBeVisible();
  });

  test('should have icons in control buttons', async ({ viewerControls }) => {
    await viewerControls.waitForControlsReady();

    // Control buttons should have SVG icons
    const svgIcons = viewerControls.container.locator('button svg');
    const count = await svgIcons.count();

    // Should have icons in buttons
    expect(count).toBeGreaterThan(0);
  });

  test('Save screenshot button should download an image', async ({ viewerControls, page }) => {
    await viewerControls.waitForControlsReady();

    const downloadPromise = page.waitForEvent('download');
    await viewerControls.getButtonByTooltip('Save screenshot').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^colmap-view-\d{8}T\d{6}\.jpg$/);
  });
});
