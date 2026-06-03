import type {
  CacheEntryStats,
  CacheStats,
  DatasetMemoryStats,
  DatasetState,
  LoadStrategy,
  MemoryItem,
  MemoryType,
  ResourceInfo,
} from './types';
import { getDatasetSourceAdapter } from './datasetSourceAdapters';
import type { Reconstruction } from '../types/colmap';
import type { WasmReconstructionWrapper } from '../wasm/reconstruction';
import { getLocalImageStats } from '../utils/imageFileUtils';
import { getUrlImageCacheStats } from '../utils/urlImageFiles';
import { getZipImageCacheStats, getZipMaskCacheStats } from '../utils/zipImageFiles';
import { getActiveZipStats } from '../utils/zipLoader';
import { getThumbnailCacheStats } from '../hooks/useThumbnail';
import { getFrustumTextureCacheStats } from '../hooks/useFrustumTexture';

export interface DatasetDiagnosticsState extends DatasetState {
  reconstruction: Reconstruction | null;
  wasmReconstruction: WasmReconstructionWrapper | null;
}

export type DatasetDiagnosticsStateReader = () => DatasetDiagnosticsState;

interface DatasetDiagnosticsCacheReaders {
  getThumbnailCacheStats: typeof getThumbnailCacheStats;
  getFrustumTextureCacheStats: typeof getFrustumTextureCacheStats;
  getActiveZipStats: typeof getActiveZipStats;
}

const DEFAULT_CACHE_READERS: DatasetDiagnosticsCacheReaders = {
  getThumbnailCacheStats,
  getFrustumTextureCacheStats,
  getActiveZipStats,
};

export class DatasetDiagnostics {
  private readonly getState: DatasetDiagnosticsStateReader;
  private readonly cacheReaders: DatasetDiagnosticsCacheReaders;

  constructor(
    getState: DatasetDiagnosticsStateReader,
    cacheReaders: DatasetDiagnosticsCacheReaders = DEFAULT_CACHE_READERS,
  ) {
    this.getState = getState;
    this.cacheReaders = cacheReaders;
  }

  getSourceType(): DatasetDiagnosticsState['sourceType'] {
    return this.getState().sourceType;
  }

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

  getMemoryStats(): DatasetMemoryStats {
    const state = this.getState();
    const { sourceType, loadedFiles, reconstruction, wasmReconstruction } = state;

    const useWasm = wasmReconstruction?.hasPoints() ?? false;

    const points3DCount = useWasm
      ? wasmReconstruction!.pointCount
      : reconstruction?.points3D?.size ?? 0;
    const points3DBytes = points3DCount * 80;

    let points2DCount = 0;
    if (reconstruction?.images) {
      for (const image of reconstruction.images.values()) {
        points2DCount += image.numPoints2D ?? image.points2D.length;
      }
    }
    const points2DBytes = points2DCount * 16;

    const cameraCount = reconstruction?.cameras.size ?? 0;
    const camerasBytes = cameraCount * 200;

    const imageCount = reconstruction?.images.size ?? 0;
    const imagePosesBytes = imageCount * 200;

    const hasDatabase = !!loadedFiles?.databaseFile;
    const matchCount = reconstruction?.globalStats?.totalObservations ?? 0;
    const matchesBytes = matchCount * 12;

    const cacheStats = this.getCacheStats();
    const isLocalSource = sourceType === 'local';
    const imageFilesStrategy: LoadStrategy = isLocalSource ? 'memory' : 'lazy';

    const imageFilesCount = isLocalSource
      ? cacheStats.localImages.count
      : cacheStats.urlImages.count + cacheStats.zipImages.count;
    const imageFilesBytes = isLocalSource
      ? cacheStats.localImages.sizeBytes
      : cacheStats.urlImages.sizeBytes + cacheStats.zipImages.sizeBytes;

    const maskFilesCount = cacheStats.zipMasks.count;
    const maskFilesBytes = cacheStats.zipMasks.sizeBytes;

    const thumbnailStats = this.cacheReaders.getThumbnailCacheStats();
    const frustumStats = this.cacheReaders.getFrustumTextureCacheStats();
    const decodedImagesCount = thumbnailStats.count + frustumStats.bitmaps;
    const decodedImagesBytes = (thumbnailStats.count * 75000) + (frustumStats.bitmaps * 65000);

    const databaseBytes = hasDatabase ? loadedFiles!.databaseFile!.size : 0;

    const hasRigs = !!loadedFiles?.rigsFile;
    const rigsBytes = hasRigs ? loadedFiles!.rigsFile!.size : 0;

    const hasSplats = !!loadedFiles?.splatFile;
    const splatsBytes = hasSplats ? loadedFiles!.splatFile!.size : 0;

    const zipStats = this.cacheReaders.getActiveZipStats();
    const isZipSource = sourceType === 'zip';
    const zipArchiveBytes = zipStats.fileSize;

    const totalWasmBytes = useWasm ? points3DBytes : 0;
    const jsReconstructionBytes = (useWasm ? 0 : points3DBytes)
      + points2DBytes
      + camerasBytes
      + imagePosesBytes
      + matchesBytes;
    const totalJsBytes = jsReconstructionBytes + databaseBytes + rigsBytes + splatsBytes;

    return {
      points3D: this.resource(points3DCount > 0, 'memory', useWasm ? 'wasm' : 'js', points3DCount, points3DBytes),
      points2D: this.resource(points2DCount > 0, 'memory', 'js', points2DCount, points2DBytes),
      matches: this.resource(matchCount > 0, 'memory', 'js', matchCount, matchesBytes),
      cameras: this.resource(cameraCount > 0, 'memory', 'js', cameraCount, camerasBytes),
      imagePoses: this.resource(imageCount > 0, 'memory', 'js', imageCount, imagePosesBytes),
      imageFiles: this.resource(
        this.hasImages(state),
        imageFilesStrategy,
        'js',
        imageFilesCount,
        imageFilesBytes,
      ),
      maskFiles: this.resource(
        this.hasMasks(state),
        isLocalSource ? 'memory' : 'lazy',
        'js',
        maskFilesCount,
        maskFilesBytes,
      ),
      imagesDecoded: this.resource(
        decodedImagesCount > 0,
        'memory',
        'js',
        decodedImagesCount,
        decodedImagesBytes,
      ),
      database: this.resource(hasDatabase, 'memory', 'js', hasDatabase ? 1 : 0, databaseBytes),
      rigs: this.resource(hasRigs, 'memory', 'js', hasRigs ? 1 : 0, rigsBytes),
      splats: this.resource(hasSplats, 'memory', 'js', hasSplats ? 1 : 0, splatsBytes),
      zipArchive: this.resource(isZipSource && zipArchiveBytes > 0, 'memory', 'js', 1, zipArchiveBytes),
      totalWasm: this.memItem(0, totalWasmBytes),
      totalJs: this.memItem(0, totalJsBytes),
      totalCached: this.memItem(0, 0),
      sourceType,
    };
  }

  private getSourceAdapter(state: DatasetState) {
    return getDatasetSourceAdapter(state.sourceType);
  }

  private hasImages(state: DatasetState): boolean {
    return this.getSourceAdapter(state)?.hasImages(state) ?? false;
  }

  private hasMasks(state: DatasetState): boolean {
    return this.getSourceAdapter(state)?.hasMasks(state) ?? false;
  }

  private formatCacheEntry(info: { count: number; sizeBytes: number }): CacheEntryStats {
    return {
      count: info.count,
      sizeBytes: info.sizeBytes,
      sizeFormatted: this.formatBytes(info.sizeBytes),
    };
  }

  private resource(
    available: boolean,
    strategy: LoadStrategy,
    memoryType: MemoryType,
    count: number,
    bytes: number,
  ): ResourceInfo {
    return {
      available,
      strategy,
      memoryType,
      memory: this.memItem(count, bytes),
    };
  }

  private memItem(count: number, bytes: number): MemoryItem {
    return {
      count,
      sizeBytes: bytes,
      sizeFormatted: this.formatBytes(bytes),
    };
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const size = bytes / Math.pow(k, i);
    const decimals = size < 10 ? 2 : size < 100 ? 1 : 0;
    return `${size.toFixed(decimals)} ${units[i]}`;
  }
}
