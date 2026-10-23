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
  DatasetAccessOptions,
  DatasetSource,
  DatasetState,
  DatasetStateReader,
} from './types';
import { getDatasetSourceAdapter } from './datasetSourceAdapters';
import { importedSourceAdapter } from './importers/importedMedia';
import type { CameraVideoSource } from './video/types';

export class DatasetManager {
  private readonly getState: DatasetStateReader;
  private readonly getCurrentState: DatasetStateReader;

  constructor(getState: DatasetStateReader, getCurrentState: DatasetStateReader = getState) {
    this.getState = getState;
    this.getCurrentState = getCurrentState;
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
    if (state.loadedFiles?.cameraImport || state.loadedFiles?.nativeMedia) return importedSourceAdapter;
    return getDatasetSourceAdapter(state.sourceType);
  }

  private isCurrent(state: DatasetState): boolean {
    const current = this.getCurrentState();
    return state.sourceType === current.sourceType && state.imageUrlBase === current.imageUrlBase
      && state.maskUrlBase === current.maskUrlBase && state.imageNameToUrl === current.imageNameToUrl
      && state.loadedFiles === current.loadedFiles;
  }

  /** All sources honor File|null settlement and suppress failures from obsolete scenes. */
  private async readMedia(method: 'getImage' | 'getOriginalImage' | 'getMask', name: string, options?: DatasetAccessOptions): Promise<File | null> {
    const state = this.getState();
    if (options?.signal?.aborted || !this.isCurrent(state)) return null;
    const onError: NonNullable<DatasetAccessOptions['onError']> = error => {
      if (this.isCurrent(state)) {
        try { options?.onError?.(error); } catch { /* A notification must not reject the media read. */ }
      }
    };
    try {
      const access = options?.onError ? { ...options, onError } : options;
      const video = state.loadedFiles?.videoFrames;
      const file = method !== 'getMask' && video?.has(name) ? await video.getImage(name, access)
        : await this.getSourceAdapter(state)?.[method](state, name, access);
      return !options?.signal?.aborted && this.isCurrent(state) ? file ?? null : null;
    } catch (error) {
      onError({ kind: options?.signal?.aborted ? 'aborted' : 'network', message: error instanceof Error ? error.message : 'Media read failed.' });
      return null;
    }
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
  async getImage(imageName: string, options?: DatasetAccessOptions): Promise<File | null> {
    return this.readMedia('getImage', imageName, options);
  }

  /**
   * Get an original image file for exports and metric computations.
   * Unlike getImage(), URL and ZIP sources bypass the resized/lossy display cache.
   *
   * @param imageName - Image name from COLMAP
   * @returns The original image File or null if not found/failed
   */
  async getOriginalImage(imageName: string, options?: DatasetAccessOptions): Promise<File | null> {
    return this.readMedia('getOriginalImage', imageName, options);
  }

  getMetricImage(imageName: string, options?: DatasetAccessOptions): Promise<File | null> {
    return this.getOriginalImage(imageName, { ...options, priority: options?.priority ?? 'metric' });
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
    if (!this.isCurrent(state)) return undefined;
    return state.loadedFiles?.videoFrames?.has(imageName) ? state.loadedFiles.videoFrames.getImageSync(imageName)
      : this.getSourceAdapter(state)?.getImageSync(state, imageName);
  }

  /** Metadata only: opening camera details does not start video playback or download. */
  getVideoSource(imageName: string): CameraVideoSource | undefined {
    const state = this.getState();
    return this.isCurrent(state) ? state.loadedFiles?.videoFrames?.getSource(imageName) : undefined;
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
  async getMask(imageName: string, options?: DatasetAccessOptions): Promise<File | null> {
    return this.readMedia('getMask', imageName, options);
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
    if (!this.isCurrent(state)) return undefined;
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
  async prefetchImages(imageNames: string[], concurrency: number = 5, options?: DatasetAccessOptions): Promise<void> {
    const state = this.getState();
    if (state.loadedFiles?.cameraImport || state.loadedFiles?.nativeMedia || state.loadedFiles?.videoFrames) {
      const batch=Math.max(1,Math.min(8,Math.floor(concurrency)||1));
      for (let index=0;index<imageNames.length;index+=batch) {
        if (options?.signal?.aborted || !this.isCurrent(state)) return;
        await Promise.all(imageNames.slice(index,index+batch).map(name=>this.getImage(name,{...options,priority:options?.priority ?? 'prefetch'})));
      }
      return;
    }
    if (!this.isCurrent(state)) return;
    await this.getSourceAdapter(state)?.prefetchImages(state, imageNames, concurrency, options);
  }

  // ===========================================================================
  // State Queries
  // ===========================================================================

  /** A completed import found no photo binding; an uncached URL is not known missing. */
  isImageKnownMissing(imageName: string): boolean {
    const state = this.getState();
    if (state.loadedFiles?.videoFrames?.has(imageName)) return false;
    if (state.loadedFiles?.videoFrames?.exclusive) return true;
    const media = state.loadedFiles?.cameraImport ?? state.loadedFiles?.nativeMedia;
    return media !== undefined && !media.bindings.has(imageName);
  }

  /** Check if the dataset has images available */
  hasImages(): boolean {
    const state = this.getState();
    return Boolean(state.loadedFiles?.videoFrames?.size) || (this.getSourceAdapter(state)?.hasImages(state) ?? false);
  }

  /** Check if the dataset has masks available */
  hasMasks(): boolean {
    const state = this.getState();
    return this.getSourceAdapter(state)?.hasMasks(state) ?? false;
  }
}
