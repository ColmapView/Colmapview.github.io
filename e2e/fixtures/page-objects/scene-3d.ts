import { Page, Locator, expect } from '@playwright/test';

/**
 * Page object for 3D canvas interactions
 */
export class Scene3DPageObject {
  readonly page: Page;
  readonly container: Locator;
  readonly canvas: Locator;
  readonly contextMenu: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator('[data-testid="scene-3d"]');
    this.canvas = this.container.locator('canvas');
    this.contextMenu = page.locator('[data-testid="context-menu"]');
  }

  /**
   * Wait for the canvas to be visible and ready
   */
  async waitForCanvasReady(): Promise<void> {
    await expect(this.canvas).toBeVisible();
    // Give Three.js time to initialize
    await this.page.waitForTimeout(500);
  }

  /**
   * Get the bounding box of the canvas
   */
  async getCanvasBoundingBox() {
    return await this.canvas.boundingBox();
  }

  /**
   * Drag on the canvas to rotate the view
   */
  async dragCanvas(startX: number, startY: number, endX: number, endY: number): Promise<void> {
    const box = await this.getCanvasBoundingBox();
    if (!box) throw new Error('Canvas not found');

    const absoluteStartX = box.x + startX;
    const absoluteStartY = box.y + startY;
    const absoluteEndX = box.x + endX;
    const absoluteEndY = box.y + endY;

    await this.page.mouse.move(absoluteStartX, absoluteStartY);
    await this.page.mouse.down();
    await this.page.mouse.move(absoluteEndX, absoluteEndY, { steps: 10 });
    await this.page.mouse.up();
  }

  /**
   * Scroll on the canvas to zoom
   */
  async scrollCanvas(deltaY: number): Promise<void> {
    const box = await this.getCanvasBoundingBox();
    if (!box) throw new Error('Canvas not found');

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    await this.page.mouse.move(centerX, centerY);
    await this.page.mouse.wheel(0, deltaY);
  }

  /**
   * Right-click on the canvas to open context menu
   */
  async rightClickCanvas(): Promise<void> {
    const box = await this.getCanvasBoundingBox();
    if (!box) throw new Error('Canvas not found');

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    await this.page.mouse.click(centerX, centerY, { button: 'right' });
  }

  /**
   * Click on the canvas
   */
  async clickCanvas(): Promise<void> {
    const box = await this.getCanvasBoundingBox();
    if (!box) throw new Error('Canvas not found');

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    await this.page.mouse.click(centerX, centerY);
  }
}
