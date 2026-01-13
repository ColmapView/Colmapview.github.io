/**
 * Optimized texture loading for camera frustum image planes.
 *
 * Optimizations:
 * 1. Shared cache - textures are cached and reused across frustums
 * 2. Thumbnails - images are downscaled to save GPU memory
 * 3. Concurrency limit - prevents browser overload from parallel loads
 * 4. Deduplication - concurrent requests for same image share one load
 */

import { useState, useEffect } from 'react';
import * as THREE from 'three';

const THUMBNAIL_MAX_SIZE = 1920; // 1080p max
const MAX_CONCURRENT_LOADS = 6;

// Module-level shared state
const textureCache = new Map<string, THREE.Texture>();
const loadingPromises = new Map<string, Promise<THREE.Texture | null>>();
const pendingQueue: Array<() => void> = [];
const objectUrls: string[] = [];
let activeLoads = 0;

/**
 * Clear all cached textures and URLs.
 * Call this when loading a new reconstruction.
 */
export function clearFrustumTextureCache(): void {
  // Revoke all object URLs
  for (const url of objectUrls) {
    URL.revokeObjectURL(url);
  }
  objectUrls.length = 0;

  // Dispose all textures
  for (const texture of textureCache.values()) {
    texture.dispose();
  }
  textureCache.clear();
  loadingPromises.clear();
  pendingQueue.length = 0;
  activeLoads = 0;
}

/**
 * Process the next item in the queue if under concurrency limit.
 */
function processQueue(): void {
  while (activeLoads < MAX_CONCURRENT_LOADS && pendingQueue.length > 0) {
    const next = pendingQueue.shift();
    if (next) {
      activeLoads++;
      next();
    }
  }
}

/**
 * Load an image file and create a thumbnail texture.
 */
async function loadTextureFromFile(
  imageFile: File,
  cacheKey: string
): Promise<THREE.Texture | null> {
  // Double-check cache (might have loaded while queued)
  const cached = textureCache.get(cacheKey);
  if (cached) {
    activeLoads--;
    processQueue();
    return cached;
  }

  try {
    // Create object URL
    const url = URL.createObjectURL(imageFile);
    objectUrls.push(url);

    // Load image element
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to load: ${imageFile.name}`));
      image.src = url;
    });

    // Create thumbnail canvas (downscale large images)
    const scale = Math.min(
      THUMBNAIL_MAX_SIZE / img.width,
      THUMBNAIL_MAX_SIZE / img.height,
      1
    );

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.needsUpdate = true;

    // Cache the texture
    textureCache.set(cacheKey, texture);
    return texture;
  } catch (error) {
    console.error('Error loading frustum texture:', error);
    return null;
  } finally {
    activeLoads--;
    loadingPromises.delete(cacheKey);
    processQueue();
  }
}

/**
 * Queue a texture load with concurrency limiting.
 */
function queueTextureLoad(
  imageFile: File,
  cacheKey: string
): Promise<THREE.Texture | null> {
  return new Promise((resolve) => {
    const doLoad = () => {
      loadTextureFromFile(imageFile, cacheKey).then(resolve);
    };

    if (activeLoads < MAX_CONCURRENT_LOADS) {
      activeLoads++;
      doLoad();
    } else {
      pendingQueue.push(() => doLoad());
    }
  });
}

/**
 * Hook to get a frustum texture with caching and optimization.
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
  const [texture, setTexture] = useState<THREE.Texture | null>(() => {
    // Check cache synchronously on mount
    return enabled && imageName ? (textureCache.get(imageName) ?? null) : null;
  });

  useEffect(() => {
    if (!enabled || !imageFile || !imageName) {
      setTexture(null);
      return;
    }

    // Check cache first
    const cached = textureCache.get(imageName);
    if (cached) {
      setTexture(cached);
      return;
    }

    // Check if already loading
    let promise = loadingPromises.get(imageName);
    if (!promise) {
      promise = queueTextureLoad(imageFile, imageName);
      loadingPromises.set(imageName, promise);
    }

    let cancelled = false;
    promise.then((tex) => {
      if (!cancelled) {
        setTexture(tex);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [imageFile, imageName, enabled]);

  return texture;
}
