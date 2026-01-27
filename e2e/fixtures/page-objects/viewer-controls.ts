import { Page, Locator, expect } from '@playwright/test';

/**
 * Page object for viewer control panel interactions
 */
export class ViewerControlsPageObject {
  readonly page: Page;
  readonly container: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator('[data-testid="viewer-controls"]');
  }

  /**
   * Wait for controls to be visible
   */
  async waitForControlsReady(): Promise<void> {
    await expect(this.container).toBeVisible();
  }

  /**
   * Get a control button by its tooltip text (partial match)
   */
  getButtonByTooltip(tooltip: string): Locator {
    // Match any element with data-tooltip containing the text (case-insensitive)
    return this.container.locator(`button`).filter({ has: this.page.locator(`[data-tooltip]`) }).first();
  }

  /**
   * Get the first control button
   */
  getFirstButton(): Locator {
    return this.container.locator('button').first();
  }

  /**
   * Click a control button by its tooltip
   */
  async clickButton(tooltip: string): Promise<void> {
    await this.getButtonByTooltip(tooltip).click();
  }

  /**
   * Check if a panel is open
   */
  async isPanelOpen(): Promise<boolean> {
    const panel = this.container.locator('[class*="panelContent"]');
    return await panel.isVisible();
  }

  /**
   * Get the panel content locator
   */
  getPanelContent(): Locator {
    return this.container.locator('[class*="panelContent"]');
  }

  /**
   * Drag a slider to a specific value (0-1 range)
   */
  async dragSlider(sliderLabel: string, targetPercent: number): Promise<void> {
    const row = this.container.locator(`text="${sliderLabel}"`).locator('..');
    const slider = row.locator('input[type="range"]');

    await expect(slider).toBeVisible();

    const box = await slider.boundingBox();
    if (!box) throw new Error(`Slider "${sliderLabel}" not found`);

    const targetX = box.x + box.width * targetPercent;
    const centerY = box.y + box.height / 2;

    await this.page.mouse.click(targetX, centerY);
  }

  /**
   * Toggle a switch by its label
   */
  async toggleSwitch(label: string): Promise<void> {
    const row = this.container.locator(`text="${label}"`).locator('..');
    const toggle = row.locator('[role="switch"], button').first();
    await toggle.click();
  }

  /**
   * Select an option from a dropdown by label
   */
  async selectOption(dropdownLabel: string, optionValue: string): Promise<void> {
    const row = this.container.locator(`text="${dropdownLabel}"`).locator('..');
    const select = row.locator('select');
    await select.selectOption(optionValue);
  }
}
