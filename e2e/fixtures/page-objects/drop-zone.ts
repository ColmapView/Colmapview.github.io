import { Page, Locator, expect } from '@playwright/test';

/**
 * Page object for DropZone interactions
 */
export class DropZonePageObject {
  readonly page: Page;
  readonly container: Locator;
  readonly emptyStatePanel: Locator;
  readonly loadUrlButton: Locator;
  readonly loadJsonButton: Locator;
  readonly tryToyButton: Locator;
  readonly urlModal: Locator;
  readonly loadingOverlay: Locator;
  readonly errorToast: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator('[data-testid="drop-zone"]');
    this.emptyStatePanel = page.locator('text="Load COLMAP Data"').locator('..').locator('..');
    this.loadUrlButton = page.locator('button:has-text("Load URL")');
    this.loadJsonButton = page.locator('button:has-text("Load JSON")');
    this.tryToyButton = page.locator('button:has-text("Try a Toy!")');
    this.urlModal = page.locator('[data-testid="url-modal"]');
    this.loadingOverlay = page.locator('[class*="loadingStyles"]');
    this.errorToast = page.locator('[class*="toastStyles"]');
  }

  /**
   * Wait for the empty state panel to be visible
   */
  async waitForEmptyState(): Promise<void> {
    await expect(this.emptyStatePanel).toBeVisible();
  }

  /**
   * Check if the empty state panel is visible
   */
  async isEmptyStateVisible(): Promise<boolean> {
    return await this.emptyStatePanel.isVisible();
  }

  /**
   * Click the "Load URL" button
   */
  async clickLoadUrl(): Promise<void> {
    await this.loadUrlButton.click();
  }

  /**
   * Click the "Load JSON" button
   */
  async clickLoadJson(): Promise<void> {
    await this.loadJsonButton.click();
  }

  /**
   * Click the "Try a Toy!" button
   */
  async clickTryToy(): Promise<void> {
    await this.tryToyButton.click();
  }

  /**
   * Check if the URL modal is open
   */
  async isUrlModalOpen(): Promise<boolean> {
    return await this.urlModal.isVisible();
  }

  /**
   * Close the URL modal
   */
  async closeUrlModal(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await expect(this.urlModal).not.toBeVisible();
  }

  /**
   * Wait for loading to complete
   */
  async waitForLoadingComplete(timeout = 30000): Promise<void> {
    await expect(this.loadingOverlay).not.toBeVisible({ timeout });
  }

  /**
   * Check if loading overlay is visible
   */
  async isLoading(): Promise<boolean> {
    return await this.loadingOverlay.isVisible();
  }

  /**
   * Check if error toast is visible
   */
  async isErrorVisible(): Promise<boolean> {
    return await this.errorToast.isVisible();
  }

  /**
   * Dismiss the empty state panel by clicking the X button
   */
  async dismissEmptyState(): Promise<void> {
    const closeButton = this.emptyStatePanel.locator('button:has-text("×")');
    await closeButton.click();
    await expect(this.emptyStatePanel).not.toBeVisible();
  }

  /**
   * Enter a URL in the URL modal
   */
  async enterUrl(url: string): Promise<void> {
    const input = this.urlModal.locator('input[type="text"]');
    await input.fill(url);
  }

  /**
   * Submit the URL modal
   */
  async submitUrlModal(): Promise<void> {
    const loadButton = this.urlModal.locator('button:has-text("Load")');
    await loadButton.click();
  }
}
