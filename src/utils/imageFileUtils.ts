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
 * This utility handles all these edge cases.
 */

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif'];

/**
 * Check if a path is an image file based on extension
 */
function isImageFile(path: string): boolean {
  const lowerPath = path.toLowerCase();
  return IMAGE_EXTENSIONS.some(ext => lowerPath.endsWith(ext));
}

/**
 * Generate all possible path suffixes for a given path.
 * For "project/images/1/photo.jpg", generates:
 * - "project/images/1/photo.jpg"
 * - "images/1/photo.jpg"
 * - "1/photo.jpg"
 * - "photo.jpg"
 */
function generatePathSuffixes(path: string): string[] {
  const normalizedPath = path.replace(/\\/g, '/');
  const parts = normalizedPath.split('/');
  const suffixes: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    suffixes.push(parts.slice(i).join('/'));
  }

  return suffixes;
}

/**
 * Collect image files from a file map and create a lookup map that handles
 * various COLMAP naming conventions.
 *
 * Stores each image under multiple keys:
 * 1. All path suffixes (to handle nested folders)
 * 2. Both original case and lowercase (for case-insensitive matching)
 * 3. Handles both forward and backslash separators
 */
export function collectImageFiles(files: Map<string, File>): Map<string, File> {
  const imageFiles = new Map<string, File>();

  // Helper to add a key if not already present (first match wins)
  const addKey = (key: string, file: File) => {
    if (!key) return;

    // Store under original key
    if (!imageFiles.has(key)) {
      imageFiles.set(key, file);
    }

    // Store under lowercase key for case-insensitive matching
    const lowerKey = key.toLowerCase();
    if (lowerKey !== key && !imageFiles.has(lowerKey)) {
      imageFiles.set(lowerKey, file);
    }
  };

  for (const [path, file] of files) {
    if (!isImageFile(path)) {
      continue;
    }

    // Normalize backslashes to forward slashes
    const normalizedPath = path.replace(/\\/g, '/');

    // Generate all path suffixes
    const suffixes = generatePathSuffixes(normalizedPath);

    for (const suffix of suffixes) {
      addKey(suffix, file);
    }
  }

  return imageFiles;
}

/**
 * Look up an image file by COLMAP image name.
 * Handles various path formats and case sensitivity issues.
 *
 * @param imageFiles - Map of image files from collectImageFiles
 * @param imageName - Image name from COLMAP (may include path, backslashes, different case)
 * @returns The matching File or undefined
 */
export function getImageFile(
  imageFiles: Map<string, File> | undefined,
  imageName: string
): File | undefined {
  if (!imageFiles || !imageName) {
    return undefined;
  }

  // Try exact match first (most common case)
  const exactMatch = imageFiles.get(imageName);
  if (exactMatch) {
    return exactMatch;
  }

  // Normalize the COLMAP image name (handle backslashes)
  const normalizedName = imageName.replace(/\\/g, '/');
  if (normalizedName !== imageName) {
    const normalizedMatch = imageFiles.get(normalizedName);
    if (normalizedMatch) {
      return normalizedMatch;
    }
  }

  // Try lowercase (case-insensitive match)
  const lowerName = normalizedName.toLowerCase();
  if (lowerName !== normalizedName) {
    const lowerMatch = imageFiles.get(lowerName);
    if (lowerMatch) {
      return lowerMatch;
    }
  }

  // Try just the filename (strip any path)
  const filename = normalizedName.split('/').pop();
  if (filename && filename !== normalizedName) {
    const filenameMatch = imageFiles.get(filename);
    if (filenameMatch) {
      return filenameMatch;
    }

    // Also try lowercase filename
    const lowerFilename = filename.toLowerCase();
    if (lowerFilename !== filename) {
      const lowerFilenameMatch = imageFiles.get(lowerFilename);
      if (lowerFilenameMatch) {
        return lowerFilenameMatch;
      }
    }
  }

  // No match found
  return undefined;
}
