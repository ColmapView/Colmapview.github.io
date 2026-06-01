import * as THREE from 'three';
import { appLogger } from '../utils/logger';

export interface FrustumBitmapCacheEntry {
  bitmap: ImageBitmap;
  lastUsed: number;
}

export interface FrustumTextureCacheEntry {
  texture: THREE.Texture;
  lastUsed: number;
}

export type FrustumBitmapCache = Map<string, FrustumBitmapCacheEntry>;
export type FrustumTextureCache = Map<string, FrustumTextureCacheEntry>;

export const MAX_ACTIVE_FRUSTUM_TEXTURES = 50;

interface BlobResponse {
  blob(): Promise<Blob>;
}

export interface LoadFrustumBitmapDeps {
  fetchBlob?: (url: string) => Promise<BlobResponse>;
  createBitmap?: (blob: Blob) => Promise<ImageBitmap>;
  now?: () => number;
}

export interface GetOrCreateFrustumTextureOptions {
  url: string;
  imageName: string;
  bitmapCache: FrustumBitmapCache;
  activeTextures: FrustumTextureCache;
  loadBitmap: (url: string, imageName: string) => Promise<ImageBitmap | null>;
  maxActiveTextures?: number;
  now?: () => number;
}

export function getCachedFrustumBitmap(
  bitmapCache: FrustumBitmapCache,
  imageName: string,
  now = Date.now
): ImageBitmap | null {
  const cached = bitmapCache.get(imageName);
  if (!cached) return null;

  cached.lastUsed = now();
  return cached.bitmap;
}

export async function getOrLoadFrustumBitmap(
  url: string,
  imageName: string,
  bitmapCache: FrustumBitmapCache,
  deps: LoadFrustumBitmapDeps = {}
): Promise<ImageBitmap | null> {
  const cached = getCachedFrustumBitmap(bitmapCache, imageName, deps.now);
  if (cached) return cached;

  try {
    const fetchBlob = deps.fetchBlob ?? ((input: string) => fetch(input));
    const createBitmap = deps.createBitmap ?? createImageBitmap;
    const response = await fetchBlob(url);
    const blob = await response.blob();
    const bitmap = await createBitmap(blob);

    bitmapCache.set(imageName, { bitmap, lastUsed: (deps.now ?? Date.now)() });
    return bitmap;
  } catch {
    return null;
  }
}

export function getActiveFrustumTexture(
  activeTextures: FrustumTextureCache,
  imageName: string,
  now = Date.now
): THREE.Texture | null {
  const existing = activeTextures.get(imageName);
  if (!existing) return null;

  existing.lastUsed = now();
  return existing.texture;
}

export function touchActiveFrustumTexture(
  activeTextures: FrustumTextureCache,
  imageName: string,
  now = Date.now
): void {
  const entry = activeTextures.get(imageName);
  if (entry) {
    entry.lastUsed = now();
  }
}

export function createFrustumTextureFromBitmap(
  bitmap: ImageBitmap,
  imageName: string,
  activeTextures: FrustumTextureCache,
  maxActiveTextures = MAX_ACTIVE_FRUSTUM_TEXTURES,
  now = Date.now
): THREE.Texture | null {
  if (!bitmap || bitmap.width <= 0 || bitmap.height <= 0) {
    appLogger.warn(`[useFrustumTexture] Invalid bitmap dimensions for ${imageName}: ${bitmap?.width}x${bitmap?.height}`);
    return null;
  }

  const texture = new THREE.Texture(bitmap);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.needsUpdate = true;

  activeTextures.set(imageName, { texture, lastUsed: now() });
  evictOldestFrustumTextures(activeTextures, maxActiveTextures);

  return texture;
}

export function getOrCreateFrustumTexture({
  url,
  imageName,
  bitmapCache,
  activeTextures,
  loadBitmap,
  maxActiveTextures = MAX_ACTIVE_FRUSTUM_TEXTURES,
  now = Date.now,
}: GetOrCreateFrustumTextureOptions): THREE.Texture | null {
  const existing = getActiveFrustumTexture(activeTextures, imageName, now);
  if (existing) return existing;

  const cachedBitmap = getCachedFrustumBitmap(bitmapCache, imageName, now);
  if (cachedBitmap) {
    return createFrustumTextureFromBitmap(cachedBitmap, imageName, activeTextures, maxActiveTextures, now);
  }

  void loadBitmap(url, imageName);
  return null;
}

export function evictOldestFrustumTextures(
  activeTextures: FrustumTextureCache,
  maxActiveTextures = MAX_ACTIVE_FRUSTUM_TEXTURES
): number {
  if (activeTextures.size <= maxActiveTextures) return 0;

  const entries = Array.from(activeTextures.entries());
  entries.sort((a, b) => a[1].lastUsed - b[1].lastUsed);

  const removeCount = Math.floor(entries.length / 2);
  for (let i = 0; i < removeCount; i++) {
    const [key, { texture }] = entries[i];
    disposeDetachedFrustumTexture(texture);
    activeTextures.delete(key);
  }

  return removeCount;
}

export function disposeDetachedFrustumTexture(texture: THREE.Texture): void {
  texture.image = null;
  texture.needsUpdate = false;
  texture.dispose();
}

export function clearActiveFrustumTextures(activeTextures: FrustumTextureCache): void {
  for (const { texture } of activeTextures.values()) {
    disposeDetachedFrustumTexture(texture);
  }
  activeTextures.clear();
}

export function clearFrustumBitmapCache(bitmapCache: FrustumBitmapCache): void {
  for (const { bitmap } of bitmapCache.values()) {
    bitmap.close();
  }
  bitmapCache.clear();
}
