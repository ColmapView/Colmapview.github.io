export const URL_IMAGE_JPEG_QUALITY = 0.75;
export const URL_IMAGE_MAX_DIMENSION = 2048;

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface CacheDimensionBounds {
  maxWidth: number;
  maxHeight: number;
}

export interface CacheDimensionInput {
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio?: number;
  maxDimension?: number;
}

/** Statistics for a cache. */
export interface CacheInfo {
  count: number;
  sizeBytes: number;
}

export function getBoundedCacheDimensions({
  screenWidth,
  screenHeight,
  devicePixelRatio = 1,
  maxDimension = URL_IMAGE_MAX_DIMENSION,
}: CacheDimensionInput): CacheDimensionBounds {
  const dpr = Math.min(devicePixelRatio || 1, 2);

  return {
    maxWidth: Math.min(Math.round(screenWidth * dpr), maxDimension),
    maxHeight: Math.min(Math.round(screenHeight * dpr), maxDimension),
  };
}

export function getCacheResizeDimensions(
  dimensions: ImageDimensions,
  bounds: CacheDimensionBounds
): ImageDimensions {
  if (dimensions.width <= bounds.maxWidth && dimensions.height <= bounds.maxHeight) {
    return dimensions;
  }

  const scale = Math.min(
    bounds.maxWidth / dimensions.width,
    bounds.maxHeight / dimensions.height
  );

  return {
    width: Math.round(dimensions.width * scale),
    height: Math.round(dimensions.height * scale),
  };
}

export function getJpegCacheFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, '.jpg');
}

export function getFileMapStats(files: Map<string, File>): CacheInfo {
  let total = 0;
  for (const file of files.values()) {
    total += file.size;
  }

  return {
    count: files.size,
    sizeBytes: total,
  };
}

export function getUniqueFileMapStats(files: Map<string, File> | undefined): CacheInfo {
  if (!files) {
    return { count: 0, sizeBytes: 0 };
  }

  const uniqueFiles = new Set<File>(files.values());
  let totalSize = 0;
  for (const file of uniqueFiles) {
    totalSize += file.size;
  }

  return {
    count: uniqueFiles.size,
    sizeBytes: totalSize,
  };
}
