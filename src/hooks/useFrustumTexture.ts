/**
 * Texture loading for camera frustum image planes.
 *
 * Strategy: Cache resized ImageBitmaps for image planes and create textures
 * on-demand. This avoids the expensive canvas -> PNG blob -> bitmap round trip
 * while keeping the GPU texture lifecycle separate from decoded bitmap storage.
 */

import * as THREE from 'three';
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { SIZE } from '../theme';
import {
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
  retainSelectedImageTexture,
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
import { createFrustumCacheRetention } from './frustumCacheRetention';
import { createFrustumDecodeQueue, type FrustumDecodePriority } from './frustumDecodeQueue';

const BACKGROUND_FRUSTUM_TEXTURE_PREFETCH_BATCH_SIZE = 4;
const FRUSTUM_BITMAP_DECODE_TIMEOUT = 3000;
let frustumTextureCacheVersion = 0;
let frustumBitmapCacheGeneration = 0;
const frustumTextureCacheListeners = new Set<() => void>();
const frustumBitmapLoads = new Map<string, Promise<ImageBitmap | null>>();
const fileResourceIds = new WeakMap<File, number>();
const prefetchedResourceKeys = new Map<string, string>();
let nextFileResourceId = 0;
function fileResourceKey(file: File | undefined, name: string): string {
  if (!file) return prefetchedResourceKeys.get(name) ?? `missing\n${name}`;
  let id = fileResourceIds.get(file);
  if (id === undefined) { id = ++nextFileResourceId; fileResourceIds.set(file, id); }
  return `${id}\n${name}`;
}

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
const retention = createFrustumCacheRetention(bitmapCache, activeTextures);
const decodeQueue = createFrustumDecodeQueue();
let trimTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleRetentionTrim(): void {
  if (trimTimer !== undefined) return;
  trimTimer = setTimeout(() => {
    trimTimer = undefined;
    retention.trim();
  }, 0);
}

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
  sourceImageName: string,
  priority: FrustumDecodePriority = 'visible',
): Promise<ImageBitmap | null> {
  const imageName = fileResourceKey(imageFile, sourceImageName);
  prefetchedResourceKeys.set(sourceImageName, imageName);
  const cached = getCachedFrustumBitmap(bitmapCache, imageName);
  if (cached) return cached;

  const existingLoad = frustumBitmapLoads.get(imageName);
  if (existingLoad) {
    decodeQueue.promote(imageName, priority);
    return existingLoad;
  }

  const loadGeneration = frustumBitmapCacheGeneration;
  const load = decodeQueue.run(imageName, priority, () => createImageBitmapWithTimeout(imageFile, FRUSTUM_BITMAP_DECODE_TIMEOUT)
    .then((decodedBitmap) => resizeImageBitmapToMaxSizeWithTimeout(
      decodedBitmap,
      SIZE.frustumMaxSize,
      FRUSTUM_BITMAP_DECODE_TIMEOUT
    )))
    .then((bitmap) => {
      if (!bitmap) return null;
      if (loadGeneration !== frustumBitmapCacheGeneration) {
        bitmap.close();
        return null;
      }

      retention.storeBitmap(imageName, bitmap);
      notifyFrustumTextureCacheChanged();
      scheduleRetentionTrim();
      return bitmap;
    })
    .catch(() => null)
    .finally(() => {
      if (frustumBitmapLoads.get(imageName) === load) frustumBitmapLoads.delete(imageName);
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
  const existing = getActiveFrustumTexture(activeTextures, imageName);
  if (existing) return existing;
  const texture = createFrustumTextureFromBitmap(bitmap, imageName, activeTextures);
  if (texture) retention.noteTexture(imageName);
  scheduleRetentionTrim();
  return texture;
}

/**
 * Clear all cached textures.
 * Call this when loading a new reconstruction.
 */
export function clearFrustumTextureCache(): void {
  frustumBitmapCacheGeneration++;
  frustumBitmapLoads.clear();
  prefetchedResourceKeys.clear();
  decodeQueue.clear();

  // IMPORTANT: Dispose textures BEFORE closing bitmaps to prevent WebGL errors
  // When a texture has needsUpdate=true, Three.js will try to upload the bitmap data
  // on the next render. If we close the bitmap first, we get "source data detached" errors.

  retention.clear();

  // Clear high-res selected image texture
  clearSelectedImageTextureCache();

  // Leased old-generation resources retire only after mounted consumers detach.
  notifyFrustumTextureCacheChanged();
}

/**
 * Pause frustum texture processing (e.g., during camera movement).
 */
export function pauseFrustumTextureCache(): void {
  decodeQueue.pause();
}

/**
 * Resume frustum texture processing after pause.
 */
export function resumeFrustumTextureCache(): void {
  decodeQueue.resume();
}

/**
 * Get frustum texture cache statistics.
 * Returns counts for decoded images (in RAM) and active textures (in GPU).
 */
export function getFrustumTextureCacheStats(): {
  urlCache: { count: number; loading: number; pending: number };
  bitmaps: number;
  textures: number;
  retention: ReturnType<typeof retention.getStats>;
  decodeQueue: ReturnType<typeof decodeQueue.getStats>;
} {
  return {
    urlCache: {
      count: bitmapCache.size,
      loading: frustumBitmapLoads.size,
      pending: 0,
    },
    bitmaps: bitmapCache.size,
    textures: activeTextures.size,
    retention: retention.getStats(),
    decodeQueue: decodeQueue.getStats(),
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
    await loadFrustumBitmapFromFile(file, name, 'prefetch');
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
    await Promise.all(batch.map(({ file, name }) => loadFrustumBitmapFromFile(file, name, 'prefetch')));
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
  sourceImageName: string
): Promise<THREE.Texture | null> {
  const imageName = fileResourceKey(imageFile, sourceImageName);
  const bitmap = await loadFrustumBitmapFromFile(imageFile, sourceImageName, 'selected');
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
  sourceImageName: string,
  enabled: boolean
): THREE.Texture | null {
  const imageName = fileResourceKey(imageFile, sourceImageName);
  const cacheVersion = useSyncExternalStore(
    subscribeFrustumTextureCacheChanges,
    getFrustumTextureCacheVersion,
    getFrustumTextureCacheVersion
  );
  void cacheVersion;
  const cacheGeneration = frustumBitmapCacheGeneration;

  useLayoutEffect(() => {
    if (!enabled) return;
    const release = retention.acquire(imageName);
    // React may run cleanup before the material update in this commit. Retire
    // only after that commit, so a pending upload never sees a closed bitmap.
    return () => { setTimeout(release, 0); };
  }, [enabled, imageName, cacheGeneration]);

  useEffect(() => {
    if (!enabled || !imageFile) return;
    if (getCachedFrustumBitmap(bitmapCache, imageName)) return;
    void loadFrustumBitmapFromFile(imageFile, sourceImageName);
  }, [enabled, imageFile, imageName, sourceImageName, cacheGeneration]);

  const cachedBitmap = enabled ? getCachedFrustumBitmap(bitmapCache, imageName) : null;
  const cacheToken = cachedBitmap ? `bitmap:${cacheGeneration}:${imageName}` : null;
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
    return () => resource.sync({ cachedUrl: null, enabled: false, imageName });
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
  sourceImageName: string,
  isSelected: boolean,
  delayMs = 0
): THREE.Texture | null {
  const imageName = fileResourceKey(imageFile, sourceImageName);
  useSyncExternalStore(subscribeFrustumTextureCacheChanges, getFrustumTextureCacheVersion, getFrustumTextureCacheVersion);
  const cacheGeneration = frustumBitmapCacheGeneration;
  const resourceRef = useRef<SelectedImageTextureResource | null>(null);
  resourceRef.current ??= createSelectedImageTextureResource({
    getCachedTexture: getSelectedImageTexture,
    clearTextureCache: clearSelectedImageTextureCache,
    createBitmap: async (file, isCurrent) => {
      const bitmap = await decodeQueue.run(`selected:${fileResourceKey(file, '')}`, 'selected', async () => {
        if (!isCurrent()) return null;
        return createImageBitmapWithTimeout(file, FRUSTUM_BITMAP_DECODE_TIMEOUT);
      });
      if (!bitmap) throw new Error('Selected image decode cancelled or failed');
      return bitmap;
    },
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

  useEffect(() => () => resource.cancel(), [resource, imageName, isSelected, cacheGeneration]);

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
      resource.cancel();
    };
  }, [delayMs, imageFile, imageName, isSelected, resource, cacheGeneration]);

  const texture = snapshot.cacheKey === cacheKey ? snapshot.texture : null;
  useLayoutEffect(() => {
    if (!texture) return;
    const release = retainSelectedImageTexture(texture);
    return () => { setTimeout(release, 0); };
  }, [texture]);
  return texture;
}

/**
 * Clear the high-resolution selected image texture.
 * Call this when loading a new reconstruction.
 */
export function clearSelectedImageTexture(): void {
  clearSelectedImageTextureCache();
}
