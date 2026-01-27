import { test as base, expect } from '@playwright/test';
import { Scene3DPageObject } from './page-objects/scene-3d';
import { ViewerControlsPageObject } from './page-objects/viewer-controls';
import { DropZonePageObject } from './page-objects/drop-zone';

/**
 * Custom fixtures for ColmapView E2E tests
 */
export interface ColmapFixtures {
  scene3d: Scene3DPageObject;
  viewerControls: ViewerControlsPageObject;
  dropZone: DropZonePageObject;
}

/**
 * Extended test with ColmapView page objects
 */
export const test = base.extend<ColmapFixtures>({
  scene3d: async ({ page }, use) => {
    const scene3d = new Scene3DPageObject(page);
    await use(scene3d);
  },
  viewerControls: async ({ page }, use) => {
    const viewerControls = new ViewerControlsPageObject(page);
    await use(viewerControls);
  },
  dropZone: async ({ page }, use) => {
    const dropZone = new DropZonePageObject(page);
    await use(dropZone);
  },
});

export { expect };
