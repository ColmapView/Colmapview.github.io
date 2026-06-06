/**
 * DatasetManager: Unified abstraction for accessing images and masks.
 *
 * Hides the complexity of different source types (local, url, manifest, zip)
 * behind a simple interface. Components no longer need to dispatch on sourceType.
 *
 * Usage:
 *   const dataset = useDataset();
 *   const file = await dataset.getImage(imageName);
 */

import type {
  DatasetSource,
  DatasetState,
  DatasetStateReader,
} from './types';
import { getDatasetSourceAdapter } from './datasetSourceAdapters';

export class DatasetManager {
  private readonly getState: DatasetStateReader;

  constructor(getState: DatasetStateReader) {
    this.getState = getState;
  }

  // ===========================================================================
  // Source Info
  // ===========================================================================

  /** Get the current source type */
  getSourceType(): DatasetSource | null {
    return this.getState().sourceType;
  }

  /** Check if a dataset is loaded */
  isLoaded(): boolean {
    return this.getState().sourceType !== null;
  }

  private getSourceAdapter(state: DatasetState) {
    return getDatasetSourceAdapter(state.sourceType);
  }

  // ===========================================================================
  // Unified Image Access
  // ===========================================================================

  /**
   * Get an image file by name (async).
   * Handles local/url/zip internally based on source type.
   *
   * @param imageName - Image name from COLMAP (e.g., "camera_123/00.png")
   * @returns The image File or null if not found/failed
   */
  async getImage(imageName: string): Promise<File | null> {
    const state = this.getState();
    return await (this.getSourceAdapter(state)?.getImage(state, imageName) ?? Promise.resolve(null));
  }

  /**
   * Get an original image file for metric computations.
   * Unlike getImage(), URL and ZIP sources bypass the resized/lossy display cache.
   *
   * @param imageName - Image name from COLMAP
   * @returns The original image File or null if not found/failed
   */
  async getMetricImage(imageName: string): Promise<File | null> {
    const state = this.getState();
    return await (this.getSourceAdapter(state)?.getMetricImage(state, imageName) ?? Promise.resolve(null));
  }

  /**
   * Get a cached image file synchronously.
   * Returns undefined if not in cache (does not trigger fetch).
   * Useful for render loops where async is not allowed.
   *
   * @param imageName - Image name from COLMAP
   * @returns The cached File or undefined
   */
  getImageSync(imageName: string): File | undefined {
    const state = this.getState();
    return this.getSourceAdapter(state)?.getImageSync(state, imageName);
  }

  // ===========================================================================
  // Unified Mask Access
  // ===========================================================================

  /**
   * Get a mask file for an image (async).
   * Handles local/url/zip internally based on source type.
   *
   * @param imageName - Image name from COLMAP (e.g., "camera_123/00.png")
   * @returns The mask File or null if not found/failed
   */
  async getMask(imageName: string): Promise<File | null> {
    const state = this.getState();
    return await (this.getSourceAdapter(state)?.getMask(state, imageName) ?? Promise.resolve(null));
  }

  /**
   * Get a cached mask file synchronously.
   * For local source, masks are always available.
   * For url/zip, returns undefined if not fetched (masks are not pre-cached).
   *
   * @param imageName - Image name from COLMAP
   * @returns The cached File or undefined
   */
  getMaskSync(imageName: string): File | undefined {
    const state = this.getState();
    return this.getSourceAdapter(state)?.getMaskSync(state, imageName);
  }

  // ===========================================================================
  // Batch Operations
  // ===========================================================================

  /**
   * Prefetch multiple images into cache.
   * Useful for preloading visible frustum images.
   *
   * @param imageNames - Array of image names to prefetch
   * @param concurrency - Number of concurrent fetches (default: 5)
   */
  async prefetchImages(imageNames: string[], concurrency: number = 5): Promise<void> {
    const state = this.getState();
    await this.getSourceAdapter(state)?.prefetchImages(state, imageNames, concurrency);
  }

  // ===========================================================================
  // State Queries
  // ===========================================================================

  /** Check if the dataset has images available */
  hasImages(): boolean {
    const state = this.getState();
    return this.getSourceAdapter(state)?.hasImages(state) ?? false;
  }

  /** Check if the dataset has masks available */
  hasMasks(): boolean {
    const state = this.getState();
    return this.getSourceAdapter(state)?.hasMasks(state) ?? false;
  }
}
