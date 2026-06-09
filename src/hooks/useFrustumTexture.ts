/**
 * Texture loading for camera frustum image planes.
 *
 * Strategy: Cache resized ImageBitmaps for image planes and create textures
 * on-demand. This avoids the expensive canvas -> PNG blob -> bitmap round trip
 * while keeping the GPU texture lifecycle separate from decoded bitmap storage.
 */

import * as THREE from 'three';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { SIZE } from '../theme';
import {
  clearActiveFrustumTextures,
  clearFrustumBitmapCache,
  createFrustumTextureFromBitmap,
  getActiveFrustumTexture,
  getCachedFrustumBitmap,
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
import {
  createImageBitmapWithTimeout,
  resizeImageBitmapToMaxSizeWithTimeout,
} from './asyncImageDecode';

const BACKGROUND_FRUSTUM_TEXTURE_PREFETCH_BATCH_SIZE = 4;
const FRUSTUM_BITMAP_DECODE_TIMEOUT = 3000;
let frustumTextureCacheVersion = 0;
let frustumBitmapCacheGeneration = 0;
const frustumTextureCacheListeners = new Set<() => void>();
const frustumBitmapLoads = new Map<string, Promise<ImageBitmap | null>>();

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

const bitmapCache: FrustumBitmapCache = new Map();
const activeTextures: FrustumTextureCache = new Map();

export function getFrustumTextureCacheVersion(): number {
  return frustumTextureCacheVersion;
}

function getCachedFrustumTexture(imageName: string): THREE.Texture | null {
  const existing = getActiveFrustumTexture(activeTextures, imageName);
  if (existing) return existing;

  const cachedBitmap = getCachedFrustumBitmap(bitmapCache, imageName);
  return cachedBitmap ? createTextureFromBitmap(cachedBitmap, imageName) : null;
}

async function loadFrustumBitmapFromFile(
  imageFile: File,
  imageName: string
): Promise<ImageBitmap | null> {
  const cached = getCachedFrustumBitmap(bitmapCache, imageName);
  if (cached) return cached;

  const existingLoad = frustumBitmapLoads.get(imageName);
  if (existingLoad) return existingLoad;

  const loadGeneration = frustumBitmapCacheGeneration;
  const load = createImageBitmapWithTimeout(imageFile, FRUSTUM_BITMAP_DECODE_TIMEOUT)
    .then((decodedBitmap) => resizeImageBitmapToMaxSizeWithTimeout(
      decodedBitmap,
      SIZE.frustumMaxSize,
      FRUSTUM_BITMAP_DECODE_TIMEOUT
    ))
    .then((bitmap) => {
      if (loadGeneration !== frustumBitmapCacheGeneration) {
        bitmap.close();
        return null;
      }

      bitmapCache.set(imageName, { bitmap, lastUsed: Date.now() });
      notifyFrustumTextureCacheChanged();
      return bitmap;
    })
    .catch(() => null)
    .finally(() => {
      frustumBitmapLoads.delete(imageName);
    });

  frustumBitmapLoads.set(imageName, load);
  return load;
}

/**
 * Return a cached resized bitmap for image-plane texture creation.
 */
async function getOrLoadBitmap(_cacheKey: string, imageName: string): Promise<ImageBitmap | null> {
  return getCachedFrustumBitmap(bitmapCache, imageName);
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
  frustumBitmapCacheGeneration++;
  frustumBitmapLoads.clear();

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
  return undefined;
}

/**
 * Resume frustum texture processing after pause.
 */
export function resumeFrustumTextureCache(): void {
  return undefined;
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
    urlCache: {
      count: bitmapCache.size,
      loading: frustumBitmapLoads.size,
      pending: 0,
    },
    bitmaps: bitmapCache.size,
    textures: activeTextures.size,
  };
}

/**
 * Prefetch frustum textures for a list of images.
 * This caches resized bitmaps, not actual GPU textures.
 */
export async function prefetchFrustumTextures(
  images: Array<{ file: File; name: string }>,
  onProgress?: (progress: number) => void
): Promise<void> {
  if (images.length === 0) {
    onProgress?.(1);
    return;
  }

  let completed = 0;
  for (const { file, name } of images) {
    await loadFrustumBitmapFromFile(file, name);
    completed++;
    onProgress?.(completed / images.length);
  }
  notifyFrustumTextureCacheChanged();
}

export interface BackgroundFrustumTexturePrefetchOptions {
  batchSize?: number;
  shouldCancel?: () => boolean;
}

/**
 * Gently prefetch the low-resolution bitmap cache used by image-plane display.
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
    await Promise.all(batch.map(({ file, name }) => loadFrustumBitmapFromFile(file, name)));
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
  const bitmap = await loadFrustumBitmapFromFile(imageFile, imageName);
  if (!bitmap) return null;

  // Check if texture already exists
  const existing = activeTextures.get(imageName);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing.texture;
  }

  return createTextureFromBitmap(bitmap, imageName);
}

/**
 * Hook to get a frustum texture with caching and optimization.
 *
 * Strategy:
 * 1. Cache resized ImageBitmaps for fast low-resolution image-plane display
 * 2. Keep active Three textures valid while mounted image planes may reference them
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

  useEffect(() => {
    if (!enabled || !imageFile) return;
    if (getCachedFrustumBitmap(bitmapCache, imageName)) return;
    void loadFrustumBitmapFromFile(imageFile, imageName);
  }, [enabled, imageFile, imageName]);

  const cachedBitmap = enabled ? getCachedFrustumBitmap(bitmapCache, imageName) : null;
  const cacheToken = cachedBitmap ? `bitmap:${imageName}` : null;
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
  const cacheKey = getFrustumTextureCacheKey(cacheToken, imageName, enabled);

  useEffect(() => {
    resource.sync({
      cachedUrl: cacheToken,
      enabled,
      imageName,
    });
  }, [cacheToken, enabled, imageName, resource]);

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
  isSelected: boolean,
  delayMs = 0
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
    if (!isSelected || !imageFile) {
      resource.sync({
        imageFile,
        imageName,
        isSelected: false,
      });
      return;
    }

    if (delayMs <= 0 || getSelectedImageTexture(imageName)) {
      resource.sync({
        imageFile,
        imageName,
        isSelected,
      });
      return;
    }

    resource.sync({
      imageFile: undefined,
      imageName,
      isSelected: false,
    });

    const timeoutId = setTimeout(() => {
      resource.sync({
        imageFile,
        imageName,
        isSelected,
      });
    }, delayMs);

    return () => {
      clearTimeout(timeoutId);
      resource.sync({
        imageFile,
        imageName,
        isSelected: false,
      });
    };
  }, [delayMs, imageFile, imageName, isSelected, resource]);

  return snapshot.cacheKey === cacheKey ? snapshot.texture : null;
}

/**
 * Clear the high-resolution selected image texture.
 * Call this when loading a new reconstruction.
 */
export function clearSelectedImageTexture(): void {
  clearSelectedImageTextureCache();
}
