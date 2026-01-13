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

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif'];

function isImageFile(path: string): boolean {
  const lowerPath = path.toLowerCase();
  return IMAGE_EXTENSIONS.some(ext => lowerPath.endsWith(ext));
}

/**
 * Generate path suffixes for lookup.
 * "project/images/1/photo.jpg" -> ["project/images/1/photo.jpg", "images/1/photo.jpg", "1/photo.jpg", "photo.jpg"]
 */
function getPathSuffixes(path: string): string[] {
  const parts = path.split('/');
  const suffixes: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    suffixes.push(parts.slice(i).join('/'));
  }

  return suffixes;
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

    const normalizedPath = path.replace(/\\/g, '/');
    const suffixes = getPathSuffixes(normalizedPath);

    for (const suffix of suffixes) {
      // Store under original case (first match wins)
      if (!imageFiles.has(suffix)) {
        imageFiles.set(suffix, file);
      }

      // Store under lowercase for case-insensitive matching
      const lowerSuffix = suffix.toLowerCase();
      if (!imageFiles.has(lowerSuffix)) {
        imageFiles.set(lowerSuffix, file);
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

  // Normalize backslashes and try direct lookup
  const normalizedName = imageName.replace(/\\/g, '/');

  // Try exact match (most common case)
  const exactMatch = imageFiles.get(normalizedName);
  if (exactMatch) {
    return exactMatch;
  }

  // Try lowercase match
  return imageFiles.get(normalizedName.toLowerCase());
}
