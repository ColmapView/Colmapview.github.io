/**
 * Register all caches with the CacheManager.
 *
 * This file centralizes cache registration to ensure:
 * 1. All caches are registered in one place
 * 2. Dependencies and priorities are documented
 * 3. New caches can be easily added
 * 4. Stats functions are provided for memory display
 *
 * Call registerAllCaches() once at app startup (in main.tsx).
 */

import { CacheManager, CacheDisposalPriority } from './CacheManager';

// Cache clear and stats functions
import { clearFrustumTextureCache, getFrustumTextureCacheStats } from '../hooks/useFrustumTexture';
import { clearThumbnailCache, getThumbnailCacheStats } from '../hooks/useThumbnail';
import { clearSharedDecodeCache } from '../hooks/useAsyncImageCache';
import {
  clearUrlImageCache,
  clearZipCache,
  getUrlImageCacheStats,
  getZipImageCacheStats,
  getZipMaskCacheStats,
} from '../utils/imageFileUtils';
import { getActiveZipStats } from '../utils/zipLoader';

// Zustand stores
import { useFloorPlaneStore } from '../store/stores/floorPlaneStore';
import { usePointPickingStore } from '../store/stores/pointPickingStore';
import { useCameraStore } from '../store/stores/cameraStore';
import { useUIStore } from '../store/stores/uiStore';

let registered = false;

/**
 * Register all caches with the CacheManager.
 * Safe to call multiple times (only registers once).
 */
export function registerAllCaches(): void {
  if (registered) {
    return;
  }
  registered = true;

  // ========================================================================
  // Priority 0: THREE.Texture objects (must dispose first)
  // ========================================================================

  CacheManager.register({
    name: 'frustumTextures',
    label: 'Frustum Textures',
    priority: CacheDisposalPriority.TEXTURE,
    clear: clearFrustumTextureCache,
    getStats: () => {
      const stats = getFrustumTextureCacheStats();
      // Textures: ~65KB each (128px bitmaps)
      return {
        count: stats.textures,
        sizeBytes: stats.textures * 65000,
      };
    },
    strategy: 'lazy',
    memoryType: 'js',
    showInStats: true,
  });

  CacheManager.register({
    name: 'frustumBitmaps',
    label: 'Decoded Bitmaps',
    priority: CacheDisposalPriority.BITMAP,
    clear: () => {}, // Cleared with frustumTextures
    getStats: () => {
      const stats = getFrustumTextureCacheStats();
      // Bitmaps: ~65KB each (128px)
      return {
        count: stats.bitmaps,
        sizeBytes: stats.bitmaps * 65000,
      };
    },
    strategy: 'lazy',
    memoryType: 'js',
    showInStats: true,
  });

  // ========================================================================
  // Priority 20: Blob URLs (revoke after textures release references)
  // Note: thumbnailCache creates blob URLs from decoded images
  // ========================================================================

  CacheManager.register({
    name: 'thumbnails',
    label: 'Thumbnails',
    priority: CacheDisposalPriority.BLOB_URL,
    clear: clearThumbnailCache,
    getStats: () => {
      const stats = getThumbnailCacheStats();
      // Thumbnails: ~75KB each (256px JPEG blob)
      return {
        count: stats.count,
        sizeBytes: stats.count * 75000,
      };
    },
    strategy: 'lazy',
    memoryType: 'js',
    showInStats: true,
  });

  // ========================================================================
  // Priority 30: Simple file/Map caches
  // ========================================================================

  CacheManager.register({
    name: 'sharedDecode',
    label: 'Shared Decode',
    priority: CacheDisposalPriority.FILE_CACHE,
    clear: clearSharedDecodeCache,
  });

  CacheManager.register({
    name: 'urlImages',
    label: 'URL Images',
    priority: CacheDisposalPriority.FILE_CACHE,
    clear: clearUrlImageCache,
    getStats: getUrlImageCacheStats,
    strategy: 'lazy',
    memoryType: 'js',
    showInStats: true,
  });

  CacheManager.register({
    name: 'zipImages',
    label: 'ZIP Images',
    priority: CacheDisposalPriority.FILE_CACHE,
    clear: () => {}, // Cleared with zipCache
    getStats: getZipImageCacheStats,
    strategy: 'lazy',
    memoryType: 'js',
    showInStats: true,
  });

  CacheManager.register({
    name: 'zipMasks',
    label: 'ZIP Masks',
    priority: CacheDisposalPriority.FILE_CACHE,
    clear: () => {}, // Cleared with zipCache
    getStats: getZipMaskCacheStats,
    strategy: 'lazy',
    memoryType: 'js',
    showInStats: true,
  });

  // ========================================================================
  // Priority 40: Zustand store resets (no stats - internal state)
  // ========================================================================

  CacheManager.register({
    name: 'floorPlaneStore',
    label: 'Floor Plane Store',
    priority: CacheDisposalPriority.STORE_STATE,
    clear: () => {
      useFloorPlaneStore.getState().reset();
    },
  });

  CacheManager.register({
    name: 'pointPickingStore',
    label: 'Point Picking Store',
    priority: CacheDisposalPriority.STORE_STATE,
    clear: () => {
      usePointPickingStore.getState().reset();
    },
  });

  CacheManager.register({
    name: 'cameraStoreNavigation',
    label: 'Camera Navigation',
    priority: CacheDisposalPriority.STORE_STATE,
    clear: () => {
      const store = useCameraStore.getState();
      store.setSelectedImageId(null);
      store.clearNavigationHistory();
    },
  });

  CacheManager.register({
    name: 'uiStoreImageDetail',
    label: 'UI Image Detail',
    priority: CacheDisposalPriority.STORE_STATE,
    clear: () => {
      useUIStore.getState().closeImageDetail();
    },
  });

  // ========================================================================
  // Priority 50: ZIP archive (last, allows garbage collection)
  // ========================================================================

  CacheManager.register({
    name: 'zipCache',
    label: 'ZIP Archive',
    priority: CacheDisposalPriority.ARCHIVE,
    clear: clearZipCache,
    getStats: () => {
      const stats = getActiveZipStats();
      return {
        count: stats.imageCount,
        sizeBytes: stats.fileSize,
      };
    },
    strategy: 'memory',
    memoryType: 'js',
    showInStats: true,
  });

  console.log(`[CacheManager] Registered ${CacheManager.getRegisteredNames().length} caches`);
}

/**
 * Reset registration state (for testing).
 */
export function resetCacheRegistration(): void {
  registered = false;
  CacheManager.reset();
}
