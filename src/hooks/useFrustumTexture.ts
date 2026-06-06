/**
 * Texture loading for camera frustum image planes.
 *
 * Strategy: Cache JPEG blob URLs (compressed, ~50-100KB each) instead of
 * THREE.Texture objects (uncompressed, ~4MB each). Create textures on-demand.
 * This allows caching thousands of images without running out of memory.
 */

import * as THREE from 'three';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createImageCache } from './useAsyncImageCache';
import { SIZE, TIMING } from '../theme';
import {
  clearActiveFrustumTextures,
  clearFrustumBitmapCache,
  createFrustumTextureFromBitmap,
  getActiveFrustumTexture,
  getCachedFrustumBitmap,
  getOrLoadFrustumBitmap,
  touchActiveFrustumTexture,
  type FrustumBitmapCache,
  type FrustumTextureCache,
} from './frustumTextureCache';
import {
  clearSelectedImageTextureCache,
  createSelectedImageTextureFromBitmap,
  getSelectedImageTexture,
  replaceSelectedImageTexture,
} from './selectedImageTextureCache';
import {
  createFrustumTextureResource,
  createSelectedImageTextureResource,
  getFrustumTextureCacheKey,
  getSelectedImageTextureCacheKey,
  type FrustumTextureResource,
  type SelectedImageTextureResource,
} from './frustumTextureResources';
import { isOffscreenCanvas } from '../utils/canvasTypeGuards';

const BACKGROUND_FRUSTUM_TEXTURE_PREFETCH_BATCH_SIZE = 4;
let frustumTextureCacheVersion = 0;
const frustumTextureCacheListeners = new Set<() => void>();

function notifyFrustumTextureCacheChanged(): void {
  frustumTextureCacheVersion++;
  for (const listener of frustumTextureCacheListeners) {
    listener();
  }
}

export function subscribeFrustumTextureCacheChanges(listener: () => void): () => void {
  frustumTextureCacheListeners.add(listener);
  return () => {
    frustumTextureCacheListeners.delete(listener);
  };
}

export function getFrustumTextureCacheVersion(): number {
  return frustumTextureCacheVersion;
}

/**
 * Process canvas to JPEG blob URL (same as thumbnails, but larger size).
 */
async function canvasToJpegUrl(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<string | null> {
  try {
    const blob = isOffscreenCanvas(canvas)
      ? await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.75 })
      : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.75));
    return blob ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}

// Cache stores JPEG blob URLs (compressed) instead of textures (uncompressed)
const frustumUrlCache = createImageCache<string>({
  maxSize: SIZE.frustumMaxSize,
  processCanvas: canvasToJpegUrl,
  dispose: (url) => URL.revokeObjectURL(url),
  idleTimeout: TIMING.textureUploadTimeout,
  idleFallback: TIMING.textureUploadFallback,
});

const bitmapCache: FrustumBitmapCache = new Map();
const activeTextures: FrustumTextureCache = new Map();

function getCachedFrustumTexture(imageName: string): THREE.Texture | null {
  const existing = getActiveFrustumTexture(activeTextures, imageName);
  if (existing) return existing;

  const cachedBitmap = getCachedFrustumBitmap(bitmapCache, imageName);
  return cachedBitmap ? createTextureFromBitmap(cachedBitmap, imageName) : null;
}

/**
 * Load and cache an ImageBitmap from a blob URL.
 * Returns cached bitmap if available, otherwise loads and caches it.
 */
async function getOrLoadBitmap(url: string, imageName: string): Promise<ImageBitmap | null> {
  return getOrLoadFrustumBitmap(url, imageName, bitmapCache);
}

/**
 * Create texture from ImageBitmap (synchronous, no async load delay).
 * Returns null if bitmap has invalid dimensions.
 */
function createTextureFromBitmap(bitmap: ImageBitmap, imageName: string): THREE.Texture | null {
  return createFrustumTextureFromBitmap(bitmap, imageName, activeTextures);
}

/**
 * Clear all cached textures.
 * Call this when loading a new reconstruction.
 */
export function clearFrustumTextureCache(): void {
  // Clear the JPEG URL cache
  frustumUrlCache.clear();

  // IMPORTANT: Dispose textures BEFORE closing bitmaps to prevent WebGL errors
  // When a texture has needsUpdate=true, Three.js will try to upload the bitmap data
  // on the next render. If we close the bitmap first, we get "source data detached" errors.

  clearActiveFrustumTextures(activeTextures);

  // Clear high-res selected image texture
  clearSelectedImageTextureCache();

  // NOW safe to close bitmap cache (textures no longer reference them)
  clearFrustumBitmapCache(bitmapCache);
  notifyFrustumTextureCacheChanged();
}

/**
 * Pause frustum texture processing (e.g., during camera movement).
 */
export function pauseFrustumTextureCache(): void {
  frustumUrlCache.pause();
}

/**
 * Resume frustum texture processing after pause.
 */
export function resumeFrustumTextureCache(): void {
  frustumUrlCache.resume();
}

/**
 * Get frustum texture cache statistics.
 * Returns counts for decoded images (in RAM) and active textures (in GPU).
 */
export function getFrustumTextureCacheStats(): {
  urlCache: { count: number; loading: number; pending: number };
  bitmaps: number;
  textures: number;
} {
  return {
    urlCache: frustumUrlCache.getStats(),
    bitmaps: bitmapCache.size,
    textures: activeTextures.size,
  };
}

/**
 * Prefetch frustum textures for a list of images.
 * This caches JPEG blob URLs, not actual textures.
 */
export async function prefetchFrustumTextures(
  images: Array<{ file: File; name: string }>,
  onProgress?: (progress: number) => void
): Promise<void> {
  await frustumUrlCache.prefetch(images, onProgress);
  notifyFrustumTextureCacheChanged();
}

export interface BackgroundFrustumTexturePrefetchOptions {
  batchSize?: number;
  shouldCancel?: () => boolean;
}

/**
 * Gently prefetch the low-resolution JPEG URL cache used by image-plane display.
 */
export async function prefetchFrustumTexturesInBackground(
  images: Array<{ file: File; name: string }>,
  options: BackgroundFrustumTexturePrefetchOptions = {}
): Promise<void> {
  const batchSize = Math.max(1, Math.floor(options.batchSize ?? BACKGROUND_FRUSTUM_TEXTURE_PREFETCH_BATCH_SIZE));
  for (let i = 0; i < images.length; i += batchSize) {
    if (options.shouldCancel?.()) {
      return;
    }

    const batch = images.slice(i, i + batchSize);
    await Promise.all(batch.map(({ file, name }) => frustumUrlCache.load(file, name)));
    notifyFrustumTextureCacheChanged();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

/**
 * Prioritize loading of a specific frustum texture.
 * Useful when user selects or navigates to an image.
 */
export async function prioritizeFrustumTexture(
  imageFile: File,
  imageName: string
): Promise<THREE.Texture | null> {
  const url = await frustumUrlCache.prioritize(imageFile, imageName);
  if (!url) return null;

  // Check if texture already exists
  const existing = activeTextures.get(imageName);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing.texture;
  }

  // Load bitmap and create texture
  const bitmap = await getOrLoadBitmap(url, imageName);
  if (!bitmap) return null;
  return createTextureFromBitmap(bitmap, imageName);
}

/**
 * Hook to get a frustum texture with caching and optimization.
 *
 * Strategy:
 * 1. Cache stores JPEG blob URLs (compressed, ~50-100KB each)
 * 2. Small bitmap cache for fast texture recreation (MAX_CACHED_BITMAPS)
 * 3. Keep active Three textures valid while mounted image planes may reference them
 *
 * @param imageFile - The image file to load
 * @param imageName - Unique identifier for caching
 * @param enabled - Whether to load the texture (e.g., showImagePlanes)
 * @returns The loaded texture or null
 */
export function useFrustumTexture(
  imageFile: File | undefined,
  imageName: string,
  enabled: boolean
): THREE.Texture | null {
  const cacheVersion = useSyncExternalStore(
    subscribeFrustumTextureCacheChanges,
    getFrustumTextureCacheVersion,
    getFrustumTextureCacheVersion
  );
  void cacheVersion;

  // Get the cached JPEG blob URL
  const cachedUrl = frustumUrlCache.useCache(imageFile, imageName, enabled);
  const resourceRef = useRef<FrustumTextureResource | null>(null);
  resourceRef.current ??= createFrustumTextureResource({
    getCachedTexture: getCachedFrustumTexture,
    getOrLoadBitmap,
    createTextureFromBitmap,
  });
  const resource = resourceRef.current;
  const snapshot = useSyncExternalStore(
    resource.subscribe,
    resource.getSnapshot,
    resource.getSnapshot
  );
  const cacheKey = getFrustumTextureCacheKey(cachedUrl, imageName, enabled);

  useEffect(() => {
    resource.sync({
      cachedUrl,
      enabled,
      imageName,
    });
  }, [cachedUrl, enabled, imageName, resource]);

  const texture = snapshot.cacheKey === cacheKey ? snapshot.texture : null;

  // Update lastUsed time when texture is accessed
  useEffect(() => {
    if (texture && imageName) {
      touchActiveFrustumTexture(activeTextures, imageName);
    }
  }, [texture, imageName]);

  return texture;
}

/**
 * Hook to get a high-resolution texture for the selected image.
 * Loads directly from the original file without downscaling.
 * Only one high-res texture exists at a time (the selected image).
 *
 * @param imageFile - The original image file
 * @param imageName - Unique identifier
 * @param isSelected - Whether this image is currently selected
 * @returns High-res texture if selected, null otherwise
 */
export function useSelectedImageTexture(
  imageFile: File | undefined,
  imageName: string,
  isSelected: boolean
): THREE.Texture | null {
  const resourceRef = useRef<SelectedImageTextureResource | null>(null);
  resourceRef.current ??= createSelectedImageTextureResource({
    getCachedTexture: getSelectedImageTexture,
    clearTextureCache: clearSelectedImageTextureCache,
    createBitmap: createImageBitmap,
    createTextureFromBitmap: createSelectedImageTextureFromBitmap,
    replaceTexture: replaceSelectedImageTexture,
  });
  const resource = resourceRef.current;
  const snapshot = useSyncExternalStore(
    resource.subscribe,
    resource.getSnapshot,
    resource.getSnapshot
  );
  const cacheKey = getSelectedImageTextureCacheKey(imageFile, imageName, isSelected);

  useEffect(() => {
    resource.sync({
      imageFile,
      imageName,
      isSelected,
    });
  }, [imageFile, imageName, isSelected, resource]);

  return snapshot.cacheKey === cacheKey ? snapshot.texture : null;
}

/**
 * Clear the high-resolution selected image texture.
 * Call this when loading a new reconstruction.
 */
export function clearSelectedImageTexture(): void {
  clearSelectedImageTextureCache();
}
