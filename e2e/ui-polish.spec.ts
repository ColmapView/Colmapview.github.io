import { test, expect } from './fixtures/test-fixtures';
import { loadTestDataset } from './fixtures/load-test-data';

test('startup profile and info popups match the panel surface', async ({ page }, testInfo) => {
  await page.goto('/?touch=false');
  const panel = page.locator('.startup-panel');
  const reference = await panel.evaluate(el => {
    const style = getComputedStyle(el);
    return { background: style.backgroundColor, border: style.borderTopColor, radius: style.borderTopLeftRadius };
  });
  const profile = page.getByRole('button', { name: 'Profile', exact: true });
  await profile.click();
  const menu = profile.locator('..').locator('[data-idle-pause="true"]');
  await expect(menu).toBeVisible();
  await expect(menu).toHaveCSS('background-color', reference.background);
  await expect(menu).toHaveCSS('border-top-left-radius', reference.radius);
  await page.screenshot({ path: testInfo.outputPath('profile.png') });
  await profile.click();
  await page.getByRole('button', { name: 'Supported files and folder structure' }).hover();
  const info = page.getByRole('tooltip');
  await expect(info).toHaveCSS('background-color', reference.background);
  await expect(info).toHaveCSS('border-top-color', reference.border);
  await expect(info).toHaveCSS('box-shadow', 'none');
  await page.screenshot({ path: testInfo.outputPath('info.png') });
});

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 640, height: 360 }]) {
  test(`URL panel fits expanded help at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/?touch=false');
    await page.getByRole('button', { name: 'Load URL', exact: true }).click();
    await page.getByRole('button', { name: 'Supported URL formats' }).click();
    const panel = page.getByTestId('url-modal');
    const bounds = await panel.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    const close = page.getByRole('button', { name: 'Close URL dialog' });
    await expect(close).toBeInViewport();
    await page.getByRole('button', { name: 'Cancel', exact: true }).scrollIntoViewIfNeeded();
    await expect(close).toBeInViewport();
    const body = panel.locator('.overflow-y-auto');
    expect(await body.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('url-panel.png') });
    await close.click();
    await expect(panel).toBeHidden();
  });
}

test('status bar version opens About directly', async ({ page }) => {
  await page.goto('/?touch=false');
  await page.getByRole('button', { name: 'Dismiss this panel' }).click();
  const version = page.getByRole('button', { name: /About ColmapView, version/ });
  await version.click();
  await expect(page.getByRole('tab', { name: 'About', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(version).toBeFocused();
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
]) {
  test(`startup fits ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/?touch=false');
    const browse = page.getByRole('button', { name: 'Browse for a COLMAP dataset folder' });
    await expect(browse).toBeVisible();
    const panel = page.locator('.startup-panel');
    const bounds = await panel.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    await expect(page.getByRole('button', { name: 'Dismiss this panel' })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath('startup.png') });
    await browse.focus();
    await expect(browse).toBeFocused();
    await expect(browse).toHaveCSS('outline-style', 'solid');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Load URL', exact: true })).toBeFocused();
  });
}

test('short desktop viewport keeps the panel top reachable', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto('/');
  const dismiss = page.getByRole('button', { name: 'Dismiss this panel' });
  await expect(dismiss).toBeInViewport();
  const lastLink = page.getByRole('button', { name: 'Try a Toy!' });
  await lastLink.scrollIntoViewIfNeeded();
  await expect(lastLink).toBeInViewport();
  await dismiss.scrollIntoViewIfNeeded();
  await expect(dismiss).toBeInViewport();
});

test('short touch viewport keeps dismissal reachable', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 640, height: 240 }, hasTouch: true });
  const page = await context.newPage();
  try {
    // Firefox touch emulation does not consistently set coarse/no-hover media.
    await page.goto('http://localhost:5173/?touch=true');
    const dismiss = page.getByRole('button', { name: 'Dismiss', exact: true });
    await expect(dismiss).toBeInViewport();
    const toy = page.getByRole('button', { name: 'Try a Toy!' });
    await toy.scrollIntoViewIfNeeded();
    await expect(toy).toBeInViewport();
    await dismiss.scrollIntoViewIfNeeded();
    await dismiss.click();
    await expect(dismiss).toBeHidden();
  } finally {
    await context.close();
  }
});

test('phone startup has usable touch actions', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const dismiss = page.getByRole('button', { name: 'Dismiss', exact: true });
  await expect(dismiss).toBeInViewport();
  const bounds = await dismiss.boundingBox();
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole('button', { name: 'Load from URL' })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('phone.png') });
  await page.getByRole('button', { name: 'Load from URL' }).click();
  await expect(page.getByTestId('url-modal')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByTestId('url-modal')).toBeHidden();
  await dismiss.click();
  await expect(dismiss).toBeHidden();
});

test('startup reflows at a 200-percent equivalent viewport', async ({ browser }, testInfo) => {
  // A 1280×900 physical viewport at 200% exposes 640×450 CSS pixels.
  const context = await browser.newContext({ viewport: { width: 640, height: 450 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  try {
    await page.goto('http://localhost:5173/?touch=false');
    const dismiss = page.getByRole('button', { name: 'Dismiss this panel' });
    await expect(dismiss).toBeInViewport();
    const panel = page.locator('.startup-panel');
    const bounds = await panel.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(640);
    await page.screenshot({ path: testInfo.outputPath('startup-200-percent.png') });
    await page.getByRole('button', { name: 'Try a Toy!' }).scrollIntoViewIfNeeded();
    await dismiss.scrollIntoViewIfNeeded();
    await expect(dismiss).toBeInViewport();
  } finally {
    await context.close();
  }
});

test('selected viewer controls remain distinct and preserve geometry', async ({ page }, testInfo) => {
  await page.goto('/');
  await loadTestDataset(page);
  const controls = page.getByTestId('viewer-controls');
  await expect(controls).toBeVisible();
  const grid = page.getByRole('button', { name: 'Axes & Grid (G)', exact: true });
  const initialBox = await grid.boundingBox();
  const initialBackground = await grid.evaluate(el => getComputedStyle(el).backgroundColor);
  await page.keyboard.press('g');
  await expect.poll(() => grid.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(initialBackground);
  expect(await grid.boundingBox()).toEqual(initialBox);
  await grid.focus();
  await expect(grid).toHaveCSS('outline-style', 'solid');
  await page.screenshot({ path: testInfo.outputPath('viewer.png') });
  await page.getByRole('button', { name: 'Settings', exact: true }).hover();
  await expect(page.getByText('Settings', { exact: true }).last()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('settings.png') });
  await page.getByRole('button', { name: 'Export', exact: true }).hover();
  await expect(page.getByText('Export', { exact: true }).last()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('export.png') });
  await page.mouse.move(300, 300);
  const camera = page.getByRole('button', { name: 'Frustum mode (F)', exact: true });
  for (let index = 0; index < 3; index++) {
    await page.keyboard.press('b');
    await expect(camera).toHaveCSS('background-color', 'rgb(48, 48, 48)');
    await expect(camera).toHaveCSS('color', 'rgb(232, 232, 232)');
  }
  await page.screenshot({ path: testInfo.outputPath('alternate-background.png') });
});
