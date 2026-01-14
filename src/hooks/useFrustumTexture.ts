/**
 * Texture loading for camera frustum image planes.
 *
 * Uses the generic async image cache with THREE.Texture output.
 */

import * as THREE from 'three';
import { createImageCache } from './useAsyncImageCache';
import { SIZE, TIMING } from '../theme';

/**
 * Process canvas to THREE.Texture.
 */
function canvasToTexture(canvas: HTMLCanvasElement | OffscreenCanvas): THREE.Texture {
  const texture = new THREE.CanvasTexture(canvas as HTMLCanvasElement);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

// Create the frustum texture cache instance
const frustumTextureCache = createImageCache<THREE.Texture>({
  maxSize: SIZE.thumbnailMaxSize,
  processCanvas: canvasToTexture,
  dispose: (texture) => texture.dispose(),
  idleTimeout: TIMING.textureUploadTimeout,
  idleFallback: TIMING.textureUploadFallback,
});

/**
 * Clear all cached textures.
 * Call this when loading a new reconstruction.
 */
export function clearFrustumTextureCache(): void {
  frustumTextureCache.clear();
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
  return frustumTextureCache.useCache(imageFile, imageName, enabled);
}
