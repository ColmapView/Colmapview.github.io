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
import { getActiveZipImageIndex, retainActiveZipSource } from '../utils/zipArchiveState';
import { buildImageUrl, buildMaskUrlCandidates, normalizeImagePath } from '../utils/imageFileLookupPolicy';
import { getFilenameFromUrl } from '../utils/urlUtils';

/** Full paths only. Aliases for the same source are harmless; distinct sources
 * at the same folded path are ambiguous and must never be chosen by map order. */
function fullPathLookup<T>(entries: Iterable<[string, T]>) {
  const exact = new Map<string, Map<T, string>>();
  const folded = new Map<string, Map<T, string>>();
  for (const [path, source] of entries) {
    const normalized = normalizeImagePath(path);
    for (const [index, key] of [[exact, normalized], [folded, normalized.toLowerCase()]] as const) {
      const matches = index.get(key) ?? new Map<T, string>();
      matches.set(source, path);
      index.set(key, matches);
    }
  }
  return (paths: string[]): string | undefined => {
    for (const index of [exact, folded]) {
      for (const path of paths) {
        const matches = index.get(index === exact ? path : path.toLowerCase());
        if (matches?.size === 1) return matches.values().next().value;
      }
    }
    return undefined;
  };
}

async function readWithSignal<T>(read: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  const result = await read();
  signal?.throwIfAborted();
  return result;
}

export class DatasetManager {
  private readonly getState: DatasetStateReader;

  constructor(getState: DatasetStateReader) {
    this.getState = getState;
  }

  /** Freeze source access without materializing image bytes or using shared caches. */
  snapshot(imageNames: string[] = []): DatasetManager {
    const current = this.getState();
    const state: DatasetState = {
      ...current,
      imageNameToUrl: current.imageNameToUrl ? { ...current.imageNameToUrl } : null,
      loadedFiles: current.loadedFiles ? {
        ...current.loadedFiles,
        imageFiles: new Map(current.loadedFiles.imageFiles),
      } : null,
    };
    const manager = new DatasetManager(() => state);
    const zip = state.sourceType === 'zip' ? retainActiveZipSource() : null;
    const findMaskPath = zip
      ? fullPathLookup(getActiveZipImageIndex() ?? [])
      : fullPathLookup(state.loadedFiles?.imageFiles ?? []);
    const loadedMasks = new Map(imageNames.map(name => [name, this.getMaskSync(name)]));
    const maskPaths = (name: string) => {
      const normalized = normalizeImagePath(name);
      const replaced = normalized.replace(/\/images\//i, '/masks/').replace(/^images\//i, 'masks/');
      const relative = normalized.replace(/^images\//i, '');
      return [...new Set([
        ...(replaced !== normalized ? [replaced, `${replaced}.png`] : []),
        `masks/${relative}`, `masks/${relative}.png`,
      ])];
    };
    manager.hasMask = (name) => {
      if (zip || state.sourceType === 'local') return findMaskPath(maskPaths(name)) !== undefined;
      return loadedMasks.get(name) !== undefined;
    };
    if (zip) manager.getMetricImage = (name, signal) => readWithSignal(() => zip.read(name), signal);
    if (state.sourceType === 'url' || state.sourceType === 'manifest') {
      manager.getMetricImage = (name, signal) => readWithSignal(async () => {
        const explicitUrl = state.imageNameToUrl?.[name];
        const request = explicitUrl
          ? { url: explicitUrl, filename: getFilenameFromUrl(explicitUrl) }
          : state.imageUrlBase ? buildImageUrl(state.imageUrlBase, name) : null;
        if (!request) return null;
        const response = await fetch(request.url, { signal });
        if (!response.ok) throw new Error(`Could not read original image (${response.status}): ${name}`);
        const blob = await response.blob();
        return new File([blob], request.filename, { type: blob.type });
      }, signal);
    }
    // Masks are original bytes: no canvas, orientation, threshold or alpha conversion.
    manager.getMask = (name, signal) => readWithSignal(async () => {
      if (zip || state.sourceType === 'local') {
        const path = findMaskPath(maskPaths(name));
        if (path === undefined) return null;
        return zip ? zip.read(path) : state.loadedFiles?.imageFiles?.get(path) ?? null;
      }
      const loaded = loadedMasks.get(name);
      if (loaded) return loaded;
      if (!state.maskUrlBase) return null;
      for (const { url, filename } of buildMaskUrlCandidates(state.maskUrlBase, name)) {
        signal?.throwIfAborted();
        const response = await fetch(url, { signal });
        if (response.ok) {
          const blob = await response.blob();
          return new File([blob], filename, { type: blob.type });
        }
        if (response.status !== 404) throw new Error(`Could not read mask (${response.status}): ${name}`);
      }
      return null;
    }, signal);
    if (zip) manager.hasMasks = zip.hasMasks;
    return manager;
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
  async getMetricImage(imageName: string, signal?: AbortSignal): Promise<File | null> {
    const state = this.getState();
    return readWithSignal(() => this.getSourceAdapter(state)?.getMetricImage(state, imageName) ?? Promise.resolve(null), signal);
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
  async getMask(imageName: string, signal?: AbortSignal): Promise<File | null> {
    const state = this.getState();
    return readWithSignal(() => this.getSourceAdapter(state)?.getMask(state, imageName) ?? Promise.resolve(null), signal);
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

  /** Known loaded mask availability, without probing or decoding remote images. */
  hasMask(imageName: string): boolean {
    return this.getMaskSync(imageName) !== undefined;
  }
}
