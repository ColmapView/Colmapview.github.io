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
  DatasetStateReader,
  CacheStats,
  CacheEntryStats,
  DatasetMemoryStats,
  ResourceInfo,
  MemoryItem,
  LoadStrategy,
  MemoryType,
} from './types';
import { useReconstructionStore } from '../store/reconstructionStore';
import {
  getImageFile,
  getMaskFile,
  getUrlImageCached,
  fetchUrlImage,
  fetchUrlMask,
  prefetchUrlImages,
  getZipImageCached,
  fetchZipImage,
  fetchZipMask,
  isZipLoadingAvailable,
  getUrlImageCacheStats,
  getZipImageCacheStats,
  getZipMaskCacheStats,
  getLocalImageStats,
} from '../utils/imageFileUtils';
import { getActiveZipStats } from '../utils/zipLoader';
import { getThumbnailCacheStats } from '../hooks/useThumbnail';
import { getFrustumTextureCacheStats } from '../hooks/useFrustumTexture';

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
    const { sourceType, loadedFiles, imageUrlBase } = this.getState();

    switch (sourceType) {
      case 'local':
        return getImageFile(loadedFiles?.imageFiles, imageName) ?? null;

      case 'url':
      case 'manifest':
        if (!imageUrlBase) return null;
        // Check cache first, then fetch
        return getUrlImageCached(imageName) ?? await fetchUrlImage(imageUrlBase, imageName);

      case 'zip':
        if (!isZipLoadingAvailable()) return null;
        // Check cache first, then extract
        return getZipImageCached(imageName) ?? await fetchZipImage(imageName);

      default:
        return null;
    }
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
    const { sourceType, loadedFiles } = this.getState();

    switch (sourceType) {
      case 'local':
        // Local files are always "cached" (stored in loadedFiles)
        return getImageFile(loadedFiles?.imageFiles, imageName);

      case 'url':
      case 'manifest':
        // Only return if already fetched and cached
        return getUrlImageCached(imageName);

      case 'zip':
        // Only return if already extracted and cached
        return getZipImageCached(imageName);

      default:
        return undefined;
    }
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
    const { sourceType, loadedFiles, maskUrlBase } = this.getState();

    switch (sourceType) {
      case 'local':
        return getMaskFile(loadedFiles?.imageFiles, imageName) ?? null;

      case 'url':
      case 'manifest':
        if (!maskUrlBase) return null;
        return await fetchUrlMask(maskUrlBase, imageName);

      case 'zip':
        if (!isZipLoadingAvailable()) return null;
        return await fetchZipMask(imageName);

      default:
        return null;
    }
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
    const { sourceType, loadedFiles } = this.getState();

    switch (sourceType) {
      case 'local':
        // Local masks are stored in the same imageFiles map
        return getMaskFile(loadedFiles?.imageFiles, imageName);

      case 'url':
      case 'manifest':
      case 'zip':
        // Masks are fetched on-demand, no caching for masks currently
        return undefined;

      default:
        return undefined;
    }
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
    const { sourceType, imageUrlBase } = this.getState();

    switch (sourceType) {
      case 'local':
        // Local files don't need prefetching
        return;

      case 'url':
      case 'manifest':
        if (!imageUrlBase) return;
        await prefetchUrlImages(imageUrlBase, imageNames, concurrency);
        return;

      case 'zip':
        // Prefetch ZIP images in batches (same pattern as URL)
        if (!isZipLoadingAvailable()) return;
        const toFetch = imageNames.filter(name => !getZipImageCached(name));
        for (let i = 0; i < toFetch.length; i += concurrency) {
          const batch = toFetch.slice(i, i + concurrency);
          await Promise.all(batch.map(name => fetchZipImage(name)));
        }
        return;

      default:
        return;
    }
  }

  // ===========================================================================
  // State Queries
  // ===========================================================================

  /** Check if the dataset has images available */
  hasImages(): boolean {
    const { sourceType, loadedFiles } = this.getState();

    switch (sourceType) {
      case 'local':
        return (loadedFiles?.imageFiles?.size ?? 0) > 0;

      case 'url':
      case 'manifest':
        // URL sources always have images (via imageUrlBase)
        return this.getState().imageUrlBase !== null;

      case 'zip':
        return isZipLoadingAvailable();

      default:
        return false;
    }
  }

  /** Check if the dataset has masks available */
  hasMasks(): boolean {
    const { sourceType, loadedFiles, maskUrlBase } = this.getState();

    switch (sourceType) {
      case 'local':
        return loadedFiles?.hasMasks ?? false;

      case 'url':
      case 'manifest':
        return maskUrlBase !== null;

      case 'zip':
        // ZIP masks are discovered lazily, so we assume they might exist
        return isZipLoadingAvailable();

      default:
        return false;
    }
  }

  // ===========================================================================
  // Cache Statistics
  // ===========================================================================

  /**
   * Get statistics about cache memory usage.
   * Returns counts and sizes for all caches.
   */
  getCacheStats(): CacheStats {
    const { sourceType, loadedFiles } = this.getState();

    const urlImages = getUrlImageCacheStats();
    const zipImages = getZipImageCacheStats();
    const zipMasks = getZipMaskCacheStats();
    const localImages = getLocalImageStats(loadedFiles?.imageFiles);

    const totalCount = urlImages.count + zipImages.count + zipMasks.count + localImages.count;
    const totalBytes = urlImages.sizeBytes + zipImages.sizeBytes + zipMasks.sizeBytes + localImages.sizeBytes;

    return {
      urlImages: this.formatCacheEntry(urlImages),
      zipImages: this.formatCacheEntry(zipImages),
      zipMasks: this.formatCacheEntry(zipMasks),
      localImages: this.formatCacheEntry(localImages),
      total: this.formatCacheEntry({ count: totalCount, sizeBytes: totalBytes }),
      sourceType,
    };
  }

  /**
   * Format cache info into CacheEntryStats with human-readable size.
   */
  private formatCacheEntry(info: { count: number; sizeBytes: number }): CacheEntryStats {
    return {
      count: info.count,
      sizeBytes: info.sizeBytes,
      sizeFormatted: this.formatBytes(info.sizeBytes),
    };
  }

  /**
   * Format bytes into human-readable string.
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const size = bytes / Math.pow(k, i);

    // Use more decimals for smaller values
    const decimals = size < 10 ? 2 : size < 100 ? 1 : 0;
    return `${size.toFixed(decimals)} ${units[i]}`;
  }

  // ===========================================================================
  // Detailed Memory Stats
  // ===========================================================================

  /**
   * Get detailed memory usage breakdown for all resources.
   * Shows what's in memory, what's lazy-loaded, and what's cached.
   */
  getMemoryStats(): DatasetMemoryStats {
    const { sourceType, loadedFiles } = this.getState();
    const reconstruction = useReconstructionStore.getState().reconstruction;
    const wasmReconstruction = useReconstructionStore.getState().wasmReconstruction;

    // Helper to create memory item
    const memItem = (count: number, bytes: number): MemoryItem => ({
      count,
      sizeBytes: bytes,
      sizeFormatted: this.formatBytes(bytes),
    });

    // Helper to create resource info
    const resource = (
      available: boolean,
      strategy: LoadStrategy,
      memoryType: MemoryType,
      count: number,
      bytes: number
    ): ResourceInfo => ({
      available,
      strategy,
      memoryType,
      memory: memItem(count, bytes),
    });

    // Check if WASM is being used for points
    const useWasm = wasmReconstruction?.hasPoints() ?? false;

    // 3D Points: ~80 bytes each (xyz, rgb, error, track refs)
    const points3DCount = useWasm
      ? wasmReconstruction!.pointCount
      : reconstruction?.points3D?.size ?? 0;
    const points3DBytes = points3DCount * 80;

    // 2D Keypoints: count from images, ~16 bytes each (xy + point3DId)
    let points2DCount = 0;
    if (reconstruction?.images) {
      for (const img of reconstruction.images.values()) {
        points2DCount += img.numPoints2D ?? img.points2D.length;
      }
    }
    const points2DBytes = points2DCount * 16;

    // Cameras: ~200 bytes each (model, params, id)
    const cameraCount = reconstruction?.cameras.size ?? 0;
    const camerasBytes = cameraCount * 200;

    // Image poses: ~200 bytes each (qvec, tvec, ids, name)
    const imageCount = reconstruction?.images.size ?? 0;
    const imagePosesBytes = imageCount * 200;

    // Matches: estimated from globalStats observations
    // Each observation is a 2D-3D correspondence, matches are pairs
    const hasDatabase = !!loadedFiles?.databaseFile;
    const matchCount = reconstruction?.globalStats?.totalObservations ?? 0;
    const matchesBytes = matchCount * 12; // imageId + point2DIdx + point3DId

    // Get cache stats for image files
    const cacheStats = this.getCacheStats();
    const isLocalSource = sourceType === 'local';
    const imageFilesStrategy: LoadStrategy = isLocalSource ? 'memory' : 'lazy';

    // For local: files are in memory; for remote: they're lazy-loaded and cached
    const imageFilesCount = isLocalSource
      ? cacheStats.localImages.count
      : cacheStats.urlImages.count + cacheStats.zipImages.count;
    const imageFilesBytes = isLocalSource
      ? cacheStats.localImages.sizeBytes
      : cacheStats.urlImages.sizeBytes + cacheStats.zipImages.sizeBytes;

    const maskFilesCount = cacheStats.zipMasks.count;
    const maskFilesBytes = cacheStats.zipMasks.sizeBytes;

    // Decoded images (thumbnails + frustum textures loaded to RAM)
    const thumbnailStats = getThumbnailCacheStats();
    const frustumStats = getFrustumTextureCacheStats();
    // Thumbnails: ~75KB each (256px JPEG blob), Frustum bitmaps: ~65KB each (128px)
    const decodedImagesCount = thumbnailStats.count + frustumStats.bitmaps;
    const decodedImagesBytes = (thumbnailStats.count * 75000) + (frustumStats.bitmaps * 65000);

    // Database file size
    const databaseBytes = hasDatabase ? loadedFiles!.databaseFile!.size : 0;

    // Rigs
    const hasRigs = !!loadedFiles?.rigsFile;
    const rigsBytes = hasRigs ? loadedFiles!.rigsFile!.size : 0;

    // ZIP archive (for 'zip' source type)
    const zipStats = getActiveZipStats();
    const isZipSource = sourceType === 'zip';
    const zipArchiveBytes = zipStats.fileSize;

    // Calculate totals (reconstruction data only - caches are tracked by CacheManager registry)
    // WASM memory: 3D points (when using WASM)
    const totalWasmBytes = useWasm ? points3DBytes : 0;

    // JS memory: reconstruction data only (caches handled separately by registry)
    const jsReconstructionBytes = (useWasm ? 0 : points3DBytes) + points2DBytes + camerasBytes + imagePosesBytes + matchesBytes;
    const totalJsBytes = jsReconstructionBytes + databaseBytes + rigsBytes;

    // Cached totals are now computed by CacheStatsIndicator from registry entries
    // These are kept at 0 to avoid double-counting
    const totalCachedBytes = 0;
    const totalCachedCount = 0;

    return {
      points3D: resource(points3DCount > 0, 'memory', useWasm ? 'wasm' : 'js', points3DCount, points3DBytes),
      points2D: resource(points2DCount > 0, 'memory', 'js', points2DCount, points2DBytes),
      matches: resource(matchCount > 0, 'memory', 'js', matchCount, matchesBytes),
      cameras: resource(cameraCount > 0, 'memory', 'js', cameraCount, camerasBytes),
      imagePoses: resource(imageCount > 0, 'memory', 'js', imageCount, imagePosesBytes),
      imageFiles: resource(
        this.hasImages(),
        imageFilesStrategy,
        'js',
        imageFilesCount,
        imageFilesBytes
      ),
      maskFiles: resource(
        this.hasMasks(),
        isLocalSource ? 'memory' : 'lazy',
        'js',
        maskFilesCount,
        maskFilesBytes
      ),
      imagesDecoded: resource(
        decodedImagesCount > 0,
        'memory',
        'js',
        decodedImagesCount,
        decodedImagesBytes
      ),
      database: resource(hasDatabase, 'memory', 'js', hasDatabase ? 1 : 0, databaseBytes),
      rigs: resource(hasRigs, 'memory', 'js', hasRigs ? 1 : 0, rigsBytes),
      zipArchive: resource(isZipSource && zipArchiveBytes > 0, 'memory', 'js', 1, zipArchiveBytes),
      totalWasm: memItem(0, totalWasmBytes),
      totalJs: memItem(0, totalJsBytes),
      totalCached: memItem(totalCachedCount, totalCachedBytes),
      sourceType,
    };
  }
}
