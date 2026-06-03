import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/test-fixtures';
import { loadTestDataset } from './fixtures/load-test-data';

type CameraDisplayMode = 'frustum' | 'arrow' | 'imageplane';
type SceneObjectTargetName = 'camera-frustum-plane' | 'camera-arrow-cone';

interface SceneObjectTarget {
  name: SceneObjectTargetName;
  imageId: number;
  displayMode: CameraDisplayMode;
  selectedImageId: number | null;
  x: number;
  y: number;
}

interface ColmapWebViewE2EApi {
  clearSelectedImage: () => void;
  getSceneObjectTarget: (name: SceneObjectTargetName) => SceneObjectTarget | null;
  getSelectedImageId: () => number | null;
  setCameraDisplayMode: (mode: CameraDisplayMode) => void;
  setCameraScale: (scale: number) => void;
  setSelectedImageId: (imageId: number | null) => void;
  waitForRenderFrames: (count?: number) => Promise<void>;
}

declare global {
  interface Window {
    __COLMAP_WEBVIEW_E2E__?: ColmapWebViewE2EApi;
  }
}

async function waitForSceneProbe(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.__COLMAP_WEBVIEW_E2E__), null, { timeout: 10_000 });
}

const PRESELECTED_IMAGE_ID = 1;

async function setCameraModeForTarget(
  page: Page,
  mode: CameraDisplayMode,
  cameraScale: number
): Promise<void> {
  await page.evaluate(async ({ nextMode, nextCameraScale, preselectedImageId }) => {
    const api = window.__COLMAP_WEBVIEW_E2E__;
    if (!api) throw new Error('Scene E2E probe is not installed');

    api.clearSelectedImage();
    api.setCameraScale(nextCameraScale);
    api.setCameraDisplayMode(nextMode);
    api.setSelectedImageId(preselectedImageId);
    await api.waitForRenderFrames(3);
  }, { nextMode: mode, nextCameraScale: cameraScale, preselectedImageId: PRESELECTED_IMAGE_ID });
}

async function waitForSceneObjectTarget(
  page: Page,
  name: SceneObjectTargetName,
  mode: CameraDisplayMode
): Promise<SceneObjectTarget> {
  await page.waitForFunction(
    ({ targetName, expectedMode }) => {
      const target = window.__COLMAP_WEBVIEW_E2E__?.getSceneObjectTarget(targetName);
      return Boolean(
        target &&
        target.displayMode === expectedMode &&
        target.x > 0 &&
        target.y > 0
      );
    },
    { targetName: name, expectedMode: mode },
    { timeout: 10_000 }
  );

  const target = await page.evaluate((targetName) => {
    return window.__COLMAP_WEBVIEW_E2E__?.getSceneObjectTarget(targetName) ?? null;
  }, name);

  if (!target) throw new Error(`Scene object target "${name}" was not available`);
  return target;
}

test.describe('Object-targeted canvas context menus', () => {
  test.beforeEach(async ({ page, scene3d }) => {
    await page.goto('/?e2eProbe=1');

    const closeButton = page.locator('button:has-text("×")').first();
    if (await closeButton.isVisible({ timeout: 2_000 })) {
      await closeButton.click();
    }

    await loadTestDataset(page);
    await expect(page.locator('text=Source:')).toBeVisible({ timeout: 45_000 });
    await scene3d.waitForCanvasReady();
    await waitForSceneProbe(page);
  });

  const cameraTargets: Array<{
    label: string;
    cameraScale: number;
    mode: CameraDisplayMode;
    targetName: SceneObjectTargetName;
  }> = [
    { label: 'frustum plane hit target', cameraScale: 0.05, mode: 'frustum', targetName: 'camera-frustum-plane' },
    { label: 'arrow cone', cameraScale: 0.25, mode: 'arrow', targetName: 'camera-arrow-cone' },
    { label: 'image-plane hit target', cameraScale: 0.05, mode: 'imageplane', targetName: 'camera-frustum-plane' },
  ];

  for (const { label, cameraScale, mode, targetName } of cameraTargets) {
    test(`right-clicking the ${label} does not open quick access`, async ({ page, scene3d }) => {
      await setCameraModeForTarget(page, mode, cameraScale);
      const target = await waitForSceneObjectTarget(page, targetName, mode);
      expect(target.selectedImageId).toBe(PRESELECTED_IMAGE_ID);
      expect(target.imageId).not.toBe(PRESELECTED_IMAGE_ID);

      await page.mouse.click(target.x, target.y, { button: 'right' });

      await expect(scene3d.contextMenu).toBeHidden();
      await expect.poll(async () => page.evaluate(() => window.__COLMAP_WEBVIEW_E2E__?.getSelectedImageId() ?? null)).toBe(target.imageId);
    });
  }
});
