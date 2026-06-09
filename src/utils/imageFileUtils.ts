/**
 * Utilities for matching COLMAP image names to loaded image files.
 *
 * COLMAP stores image names that may be:
 * - Just filename: "photo.jpg"
 * - With camera subfolder: "1/photo.jpg" or "cam1/photo.jpg"
 * - With images prefix: "images/1/photo.jpg"
 * - With backslashes (Windows): "1\\photo.jpg"
 * - Different case than filesystem: "Photo.JPG" vs "photo.jpg"
 *
 * The filesystem structure when dropping a folder might be:
 * - project/sparse/0/images.bin + project/images/1/photo.jpg
 * - or many other variations
 *
 * Strategy: Store images under multiple lookup keys for O(1) retrieval.
 */

import {
  getImageLookupKeys,
  getMaskLookupPaths,
  isImageFile,
  isMaskImagePath,
  normalizeImagePath,
} from './imageFileLookupPolicy';
import {
  getUniqueFileMapStats,
  type CacheInfo,
} from './imageFileCachePolicy';

export { getMaskPathVariants } from './imageFileLookupPolicy';
export {
  clearUrlImageCache,
  clearUrlMaskCache,
  fetchUrlImage,
  fetchUrlMask,
  getUrlImageCached,
  getUrlImageCacheStats,
  getUrlMaskCached,
  getUrlMaskCacheStats,
  prefetchUrlImages,
} from './urlImageFiles';
export {
  clearZipCache,
  fetchZipImage,
  fetchZipMask,
  getZipImageCached,
  getZipImageCacheStats,
  getZipMaskCached,
  getZipMaskCacheStats,
  isZipLoadingAvailable,
  removeZipMaskCacheEntries,
} from './zipImageFiles';

/**
 * Check if any files are in a masks/ folder.
 * Used to determine whether to show mask overlay controls.
 */
export function hasMaskFiles(files: Map<string, File>): boolean {
  for (const path of files.keys()) {
    if (isMaskImagePath(path)) {
      return true;
    }
  }
  return false;
}

/**
 * Collect image files from a file map and create a lookup map.
 * Stores each image under multiple keys (path suffixes, case variants) for fast O(1) lookup.
 */
export function collectImageFiles(files: Map<string, File>): Map<string, File> {
  const imageFiles = new Map<string, File>();

  for (const [path, file] of files) {
    if (!isImageFile(path)) {
      continue;
    }

    for (const key of getImageLookupKeys(path)) {
      if (!imageFiles.has(key)) {
        imageFiles.set(key, file);
      }
    }
  }

  return imageFiles;
}

/**
 * Look up an image file by COLMAP image name.
 * Handles various path formats and case sensitivity issues.
 */
export function getImageFile(
  imageFiles: Map<string, File> | undefined,
  imageName: string
): File | undefined {
  if (!imageFiles || !imageName) {
    return undefined;
  }

  const normalizedName = normalizeImagePath(imageName);
  const lookupKeys = getPreferredImageLookupKeys(normalizedName);
  for (const key of lookupKeys) {
    const match = imageFiles.get(key);
    if (match) return match;
  }

  return undefined;
}

function getPreferredImageLookupKeys(normalizedName: string): string[] {
  const keys: string[] = [];
  const addKey = (key: string) => {
    if (!key || keys.includes(key)) return;
    keys.push(key);
    const lowerKey = key.toLowerCase();
    if (lowerKey !== key && !keys.includes(lowerKey)) {
      keys.push(lowerKey);
    }
  };

  if (!normalizedName.toLowerCase().startsWith('images/')) {
    addKey(`images/${normalizedName}`);
  }
  addKey(normalizedName);
  return keys;
}

/**
 * Diagnostic function: Find images that don't have corresponding files.
 * Returns information about missing images and potential causes.
 */
export function findMissingImageFiles(
  images: Map<number, { imageId: number; name: string }>,
  imageFiles: Map<string, File>
): {
  missingImages: Array<{ imageId: number; name: string }>;
  totalImages: number;
  totalFiles: number;
} {
  const missingImages: Array<{ imageId: number; name: string }> = [];

  for (const image of images.values()) {
    const file = getImageFile(imageFiles, image.name);
    if (!file) {
      missingImages.push({ imageId: image.imageId, name: image.name });
    }
  }

  return {
    missingImages,
    totalImages: images.size,
    totalFiles: imageFiles.size,
  };
}

/**
 * Look up a mask file for an image.
 * Masks are stored in masks/ folder mirroring images/ structure.
 * Supports both exact match and .png suffix variants.
 *
 * Tries multiple strategies to handle various folder structures:
 * 1. Replace 'images/' with 'masks/' anywhere in path
 * 2. Strip leading 'images/' and prepend 'masks/'
 * 3. Just filename with 'masks/' prefix (fallback)
 *
 * Examples:
 * - "images/cam1/photo.jpg" -> "masks/cam1/photo.jpg" or "masks/cam1/photo.jpg.png"
 * - "data/images/cam1/photo.jpg" -> "data/masks/cam1/photo.jpg.png"
 * - "cam1/photo.jpg" -> "masks/cam1/photo.jpg.png"
 */
export function getMaskFile(
  imageFiles: Map<string, File> | undefined,
  imageName: string
): File | undefined {
  if (!imageFiles || !imageName) return undefined;

  for (const path of getMaskLookupPaths(imageName)) {
    const match = imageFiles.get(path) || imageFiles.get(path.toLowerCase());
    if (match) return match;
  }

  return undefined;
}

/**
 * Get statistics for local image files.
 */
export function getLocalImageStats(imageFiles: Map<string, File> | undefined): CacheInfo {
  return getUniqueFileMapStats(imageFiles);
}
