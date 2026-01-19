/**
 * Texture loading for camera frustum image planes.
 *
 * Strategy: Cache JPEG blob URLs (compressed, ~50-100KB each) instead of
 * THREE.Texture objects (uncompressed, ~4MB each). Create textures on-demand.
 * This allows caching thousands of images without running out of memory.
 */

import * as THREE from 'three';
import { useState, useEffect, useRef } from 'react';
import { createImageCache } from './useAsyncImageCache';
import { SIZE, TIMING } from '../theme';

/**
 * Process canvas to JPEG blob URL (same as thumbnails, but larger size).
 */
async function canvasToJpegUrl(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<string | null> {
  return new Promise((resolve) => {
    if (canvas instanceof OffscreenCanvas) {
      canvas.convertToBlob({ type: 'image/jpeg', quality: 0.75 }).then((blob) => {
        resolve(URL.createObjectURL(blob));
      }).catch(() => {
        resolve(null);
      });
    } else {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(URL.createObjectURL(blob));
        } else {
          resolve(null);
        }
      }, 'image/jpeg', 0.75);
    }
  });
}

// Cache stores JPEG blob URLs (compressed) instead of textures (uncompressed)
const frustumUrlCache = createImageCache<string>({
  maxSize: SIZE.frustumMaxSize,
  processCanvas: canvasToJpegUrl,
  dispose: (url) => URL.revokeObjectURL(url),
  idleTimeout: TIMING.textureUploadTimeout,
  idleFallback: TIMING.textureUploadFallback,
});

// Cache all decoded ImageBitmaps (small due to 128px max size, ~50KB each)
const bitmapCache = new Map<string, { bitmap: ImageBitmap; lastUsed: number }>();

// Small LRU cache for active textures (only keep recently used ones in GPU memory)
const MAX_ACTIVE_TEXTURES = 50;
const activeTextures = new Map<string, { texture: THREE.Texture; lastUsed: number }>();

/**
 * Load and cache an ImageBitmap from a blob URL.
 * Returns cached bitmap if available, otherwise loads and caches it.
 */
async function getOrLoadBitmap(url: string, imageName: string): Promise<ImageBitmap | null> {
  // Check cache first
  const cached = bitmapCache.get(imageName);
  if (cached) {
    cached.lastUsed = Date.now();
    return cached.bitmap;
  }

  try {
    // Fetch blob from URL and decode to ImageBitmap
    const response = await fetch(url);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    // Cache the bitmap (no eviction - small size due to downscaling)
    bitmapCache.set(imageName, { bitmap, lastUsed: Date.now() });

    return bitmap;
  } catch {
    return null;
  }
}

/**
 * Create texture from ImageBitmap (synchronous, no async load delay).
 */
function createTextureFromBitmap(bitmap: ImageBitmap, imageName: string): THREE.Texture {
  const texture = new THREE.Texture(bitmap);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.needsUpdate = true;

  // Add to active textures
  activeTextures.set(imageName, { texture, lastUsed: Date.now() });

  // Evict old textures if over limit
  if (activeTextures.size > MAX_ACTIVE_TEXTURES) {
    evictOldestTextures();
  }

  return texture;
}

function getOrCreateTexture(url: string, imageName: string): THREE.Texture | null {
  // Check if we already have this texture active
  const existing = activeTextures.get(imageName);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing.texture;
  }

  // Check if we have a cached bitmap - create texture synchronously
  const cachedBitmap = bitmapCache.get(imageName);
  if (cachedBitmap) {
    cachedBitmap.lastUsed = Date.now();
    return createTextureFromBitmap(cachedBitmap.bitmap, imageName);
  }

  // No cached bitmap - need to load async (this path is for initial load)
  // Start loading bitmap in background, return null for now
  // The texture will be created once bitmap is ready
  getOrLoadBitmap(url, imageName); // Fire and forget - will be picked up on next render

  return null;
}

function evictOldestTextures(): void {
  // Sort by lastUsed and remove oldest
  const entries = Array.from(activeTextures.entries());
  entries.sort((a, b) => a[1].lastUsed - b[1].lastUsed);

  // Remove oldest half
  const toRemove = Math.floor(entries.length / 2);
  for (let i = 0; i < toRemove; i++) {
    const [key, { texture }] = entries[i];
    texture.dispose();
    activeTextures.delete(key);
  }
}

/**
 * Clear all cached textures.
 * Call this when loading a new reconstruction.
 */
export function clearFrustumTextureCache(): void {
  // Clear the JPEG URL cache
  frustumUrlCache.clear();

  // Clear and close bitmap cache
  for (const { bitmap } of bitmapCache.values()) {
    bitmap.close();
  }
  bitmapCache.clear();

  // Dispose and clear active textures
  for (const { texture } of activeTextures.values()) {
    texture.dispose();
  }
  activeTextures.clear();

  // Clear high-res selected image texture
  if (selectedImageTexture) {
    selectedImageTexture.texture.dispose();
    selectedImageTexture = null;
  }
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
 * Prefetch frustum textures for a list of images.
 * This caches JPEG blob URLs, not actual textures.
 */
export async function prefetchFrustumTextures(
  images: Array<{ file: File; name: string }>,
  onProgress?: (progress: number) => void
): Promise<void> {
  return frustumUrlCache.prefetch(images, onProgress);
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
 * 3. Keep only MAX_ACTIVE_TEXTURES in GPU memory (LRU eviction)
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
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const urlRef = useRef<string | null>(null);

  // Get the cached JPEG blob URL
  const cachedUrl = frustumUrlCache.useCache(imageFile, imageName, enabled);

  useEffect(() => {
    if (!enabled || !cachedUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Async texture loading pattern with setState
      setTexture(null);
      return;
    }

    // Try to get texture (sync if bitmap cached, null if needs async load)
    const tex = getOrCreateTexture(cachedUrl, imageName);
    if (tex) {
      urlRef.current = cachedUrl;
       
      setTexture(tex);
      return;
    }

    // Bitmap not cached - load async and update when ready
    let cancelled = false;
    getOrLoadBitmap(cachedUrl, imageName).then((bitmap) => {
      if (cancelled || !bitmap) return;
      const newTex = createTextureFromBitmap(bitmap, imageName);
      urlRef.current = cachedUrl;
       
      setTexture(newTex);
    });

    return () => {
      cancelled = true;
    };
  }, [cachedUrl, imageName, enabled]);

  // Update lastUsed time when texture is accessed
  useEffect(() => {
    if (texture && imageName) {
      const entry = activeTextures.get(imageName);
      if (entry) {
        entry.lastUsed = Date.now();
      }
    }
  }, [texture, imageName]);

  return texture;
}

// High-resolution texture for selected image (single instance, loaded from original file)
let selectedImageTexture: { name: string; texture: THREE.Texture } | null = null;

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
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!isSelected || !imageFile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Async texture loading pattern with setState
      setTexture(null);
      return;
    }

    // Check if we already have this image loaded at high-res
    if (selectedImageTexture?.name === imageName) {
       
      setTexture(selectedImageTexture.texture);
      return;
    }

    // Dispose previous high-res texture
    if (selectedImageTexture) {
      selectedImageTexture.texture.dispose();
      selectedImageTexture = null;
    }

    // Load new high-res texture from original file
    let cancelled = false;
    createImageBitmap(imageFile).then((bitmap) => {
      if (cancelled) {
        bitmap.close();
        return;
      }

      const tex = new THREE.Texture(bitmap);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false;
      tex.needsUpdate = true;

      selectedImageTexture = { name: imageName, texture: tex };
       
      setTexture(tex);
    }).catch(() => {
      // Fall back to low-res on error
       
      setTexture(null);
    });

    return () => {
      cancelled = true;
    };
  }, [imageFile, imageName, isSelected]);

  return texture;
}

/**
 * Clear the high-resolution selected image texture.
 * Call this when loading a new reconstruction.
 */
export function clearSelectedImageTexture(): void {
  if (selectedImageTexture) {
    selectedImageTexture.texture.dispose();
    selectedImageTexture = null;
  }
}
