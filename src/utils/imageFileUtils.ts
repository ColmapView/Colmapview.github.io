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
 * Check if any files are in a masks/ folder.
 * Used to determine whether to show mask overlay controls.
 */
export function hasMaskFiles(files: Map<string, File>): boolean {
  for (const path of files.keys()) {
    const normalized = path.replace(/\\/g, '/').toLowerCase();
    if (normalized.includes('/masks/') || normalized.startsWith('masks/')) {
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

// ============================================================================
// URL-based image loading (for remote reconstructions)
// ============================================================================

/** JPEG quality for cached URL images (0-1) */
const URL_IMAGE_JPEG_QUALITY = 0.75;

/** Maximum dimension for cached images (cap to prevent excessive memory on 4K+ displays) */
const URL_IMAGE_MAX_DIMENSION = 2048;

/** Cache for images fetched from URLs (stored as compressed JPEG, resized) */
const urlImageCache = new Map<string, File>();

/** Set of URLs currently being fetched (to avoid duplicate requests) */
const pendingFetches = new Set<string>();

/** Callbacks waiting for a fetch to complete */
const fetchCallbacks = new Map<string, Array<(file: File | null) => void>>();

/**
 * Get max dimensions for cached images.
 * Capped at URL_IMAGE_MAX_DIMENSION to prevent excessive memory on high-DPI displays.
 */
function getMaxCacheDimensions(): { maxWidth: number; maxHeight: number } {
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const screenWidth = typeof screen !== 'undefined' ? screen.width : 1920;
  const screenHeight = typeof screen !== 'undefined' ? screen.height : 1080;
  // Cap dimensions to prevent excessive memory usage
  return {
    maxWidth: Math.min(Math.round(screenWidth * dpr), URL_IMAGE_MAX_DIMENSION),
    maxHeight: Math.min(Math.round(screenHeight * dpr), URL_IMAGE_MAX_DIMENSION),
  };
}

/**
 * Compress and resize an image blob to JPEG format.
 * Resizes to max screen resolution and compresses to JPEG quality 75.
 * Returns the original blob if compression fails.
 */
async function compressAndResizeToJpeg(blob: Blob, filename: string): Promise<File> {
  try {
    // Decode the image
    const bitmap = await createImageBitmap(blob);
    const { maxWidth, maxHeight } = getMaxCacheDimensions();

    // Calculate scaled dimensions (fit within max, preserve aspect ratio)
    let targetWidth = bitmap.width;
    let targetHeight = bitmap.height;

    if (bitmap.width > maxWidth || bitmap.height > maxHeight) {
      const scale = Math.min(maxWidth / bitmap.width, maxHeight / bitmap.height);
      targetWidth = Math.round(bitmap.width * scale);
      targetHeight = Math.round(bitmap.height * scale);
    }

    // Use OffscreenCanvas if available, otherwise regular canvas
    let canvas: OffscreenCanvas | HTMLCanvasElement;
    let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;

    if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(targetWidth, targetHeight);
      ctx = canvas.getContext('2d');
    } else {
      canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      ctx = canvas.getContext('2d');
    }

    if (!ctx) {
      bitmap.close();
      return new File([blob], filename, { type: blob.type || 'image/png' });
    }

    // Draw the image (scaled if needed)
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close();

    // Convert to JPEG blob
    let jpegBlob: Blob;
    if (canvas instanceof OffscreenCanvas) {
      jpegBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: URL_IMAGE_JPEG_QUALITY });
    } else {
      jpegBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => b ? resolve(b) : reject(new Error('Failed to create blob')),
          'image/jpeg',
          URL_IMAGE_JPEG_QUALITY
        );
      });
    }

    // Use compressed version
    const jpegFilename = filename.replace(/\.[^.]+$/, '.jpg');
    return new File([jpegBlob], jpegFilename, { type: 'image/jpeg' });
  } catch (err) {
    // Fall back to original blob on any error
    console.warn('[URL Image] Compression failed, using original:', err);
    return new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  }
}

/**
 * Clear the URL image cache.
 * Call this when loading a new reconstruction.
 */
export function clearUrlImageCache(): void {
  urlImageCache.clear();
  pendingFetches.clear();
  fetchCallbacks.clear();
}

/**
 * Get a cached URL image (synchronous).
 * Returns undefined if not yet fetched.
 */
export function getUrlImageCached(imageName: string): File | undefined {
  return urlImageCache.get(imageName);
}

/**
 * Fetch an image from URL and cache it.
 * Returns the cached File if already fetched, otherwise fetches and caches.
 *
 * @param imageUrlBase - Base URL for images (e.g., "https://example.com/dataset/images/")
 * @param imageName - Image name from COLMAP (e.g., "camera_123/00.png")
 * @returns The fetched File or null if fetch failed
 */
export async function fetchUrlImage(
  imageUrlBase: string,
  imageName: string
): Promise<File | null> {
  // Check cache first
  const cached = urlImageCache.get(imageName);
  if (cached) {
    return cached;
  }

  // Construct full URL
  let normalizedName = imageName.replace(/\\/g, '/');

  // Handle path duplication: if imageUrlBase ends with "images/" and imageName starts with "images/",
  // strip the prefix from imageName to avoid double "images/images/" in the URL
  const urlBaseLower = imageUrlBase.toLowerCase();
  const nameLower = normalizedName.toLowerCase();
  if (urlBaseLower.endsWith('/images/') && nameLower.startsWith('images/')) {
    normalizedName = normalizedName.slice(7); // Remove "images/"
  }

  const imageUrl = imageUrlBase.endsWith('/')
    ? `${imageUrlBase}${normalizedName}`
    : `${imageUrlBase}/${normalizedName}`;

  console.log(`[URL Image] Fetching: ${imageUrl}`);

  // Check if already fetching
  if (pendingFetches.has(imageUrl)) {
    // Wait for existing fetch to complete
    return new Promise((resolve) => {
      const callbacks = fetchCallbacks.get(imageUrl) || [];
      callbacks.push(resolve);
      fetchCallbacks.set(imageUrl, callbacks);
    });
  }

  // Start fetching
  pendingFetches.add(imageUrl);

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.warn(`[URL Image] Failed to fetch ${imageName}: ${response.status}`);
      return null;
    }

    const blob = await response.blob();

    // Extract filename from imageName
    const filename = normalizedName.split('/').pop() || normalizedName;

    // Compress and resize to JPEG (max screen resolution, quality 75)
    const file = await compressAndResizeToJpeg(blob, filename);

    // Cache the compressed file
    urlImageCache.set(imageName, file);

    // Notify waiting callbacks
    const callbacks = fetchCallbacks.get(imageUrl) || [];
    for (const cb of callbacks) {
      cb(file);
    }
    fetchCallbacks.delete(imageUrl);

    return file;
  } catch (err) {
    console.warn(`[URL Image] Error fetching ${imageName}:`, err);

    // Notify waiting callbacks of failure
    const callbacks = fetchCallbacks.get(imageUrl) || [];
    for (const cb of callbacks) {
      cb(null);
    }
    fetchCallbacks.delete(imageUrl);

    return null;
  } finally {
    pendingFetches.delete(imageUrl);
  }
}

/**
 * Fetch a mask from URL (lazy loaded, no cache).
 * Tries multiple naming conventions:
 * 1. Same name as image (e.g., "cam1/photo.png" → "masks/cam1/photo.png")
 * 2. Image name + ".png" suffix (COLMAP convention: "cam1/photo.jpg" → "masks/cam1/photo.jpg.png")
 *
 * @param maskUrlBase - Base URL for masks (e.g., "https://example.com/dataset/masks/")
 * @param imageName - Image name from COLMAP (e.g., "camera_123/00.png")
 * @returns The fetched File or null if fetch failed
 */
export async function fetchUrlMask(
  maskUrlBase: string,
  imageName: string
): Promise<File | null> {
  let normalizedName = imageName.replace(/\\/g, '/');

  // Handle path duplication: if maskUrlBase ends with "masks/" and imageName starts with "masks/",
  // strip the prefix from imageName to avoid double "masks/masks/" in the URL
  const urlBaseLower = maskUrlBase.toLowerCase();
  const nameLower = normalizedName.toLowerCase();
  if (urlBaseLower.endsWith('/masks/') && nameLower.startsWith('masks/')) {
    normalizedName = normalizedName.slice(6); // Remove "masks/"
  }

  // Also strip "images/" prefix if present (common case: image name is "images/cam1/photo.jpg")
  if (normalizedName.toLowerCase().startsWith('images/')) {
    normalizedName = normalizedName.slice(7); // Remove "images/"
  }

  const baseUrl = maskUrlBase.endsWith('/') ? maskUrlBase : `${maskUrlBase}/`;

  // Try multiple naming conventions
  const maskNames = [
    normalizedName,                    // Same name (for PNG images: cam1/photo.png)
    `${normalizedName}.png`,           // COLMAP convention (cam1/photo.jpg.png)
  ];

  for (const maskName of maskNames) {
    const maskUrl = `${baseUrl}${maskName}`;
    console.log(`[URL Mask] Trying: ${maskUrl}`);

    try {
      const response = await fetch(maskUrl);
      if (response.ok) {
        const blob = await response.blob();
        const filename = maskName.split('/').pop() || maskName;
        console.log(`[URL Mask] Found mask for ${imageName}`);
        return new File([blob], filename, { type: blob.type || 'image/png' });
      }
      // Continue to next naming convention on 404
    } catch (err) {
      // Continue to next naming convention on error
      console.debug(`[URL Mask] Error trying ${maskUrl}:`, err);
    }
  }

  console.debug(`[URL Mask] No mask found for ${imageName}`);
  return null;
}

/**
 * Prefetch multiple images from URLs.
 * Useful for preloading visible frustum images.
 */
export async function prefetchUrlImages(
  imageUrlBase: string,
  imageNames: string[],
  concurrency: number = 5
): Promise<void> {
  // Filter out already cached images
  const toFetch = imageNames.filter(name => !urlImageCache.has(name));
  if (toFetch.length === 0) return;

  // Fetch in batches
  for (let i = 0; i < toFetch.length; i += concurrency) {
    const batch = toFetch.slice(i, i + concurrency);
    await Promise.all(batch.map(name => fetchUrlImage(imageUrlBase, name)));
  }
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

  const normalized = imageName.replace(/\\/g, '/');

  // Strategy 1: Replace 'images/' with 'masks/' anywhere in path
  // Only use if it actually contains 'images/' to replace
  const replaced = normalized.replace(/\/images\//i, '/masks/').replace(/^images\//i, 'masks/');
  const hasImagesInPath = replaced !== normalized;

  // Strategy 2: Strip leading images/ and prepend masks/
  const stripped = normalized.replace(/^images\//i, '');
  const maskPath = `masks/${stripped}`;

  // Strategy 3: Just filename with masks/ prefix (fallback)
  const filename = normalized.split('/').pop() || '';
  const maskByFilename = `masks/${filename}`;

  // Build list of paths to try - only include paths that have 'masks/' in them
  const tryPaths: string[] = [];

  // Only add replaced paths if the original had 'images/' in it
  if (hasImagesInPath) {
    tryPaths.push(replaced, `${replaced}.png`);
  }

  // Always try masks/ prefixed paths
  tryPaths.push(maskPath, `${maskPath}.png`);

  // Add filename-only fallback if different from maskPath
  if (maskByFilename !== maskPath) {
    tryPaths.push(maskByFilename, `${maskByFilename}.png`);
  }

  for (const path of tryPaths) {
    const match = imageFiles.get(path) || imageFiles.get(path.toLowerCase());
    if (match) return match;
  }

  return undefined;
}
