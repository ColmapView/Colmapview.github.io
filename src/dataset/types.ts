/**
 * Type definitions for the DatasetManager abstraction.
 */

import type { LoadedFiles } from '../types/colmap';

/** Source type for loaded dataset */
export type DatasetSource = 'local' | 'url' | 'manifest' | 'zip';

/** Read-only dataset state from reconstruction store */
export interface DatasetState {
  /** Source type of the loaded dataset */
  sourceType: DatasetSource | null;
  /** Base URL for fetching images (for 'url' and 'manifest' sources) */
  imageUrlBase: string | null;
  /** Base URL for fetching masks (for 'url' and 'manifest' sources) */
  maskUrlBase: string | null;
  /** Loaded files from local drop (for 'local' source) */
  loadedFiles: LoadedFiles | null;
}

/** Function type for reading dataset state from store */
export type DatasetStateReader = () => DatasetState;

// ===========================================================================
// Cache Statistics Types
// ===========================================================================

/** Statistics for a single cache */
export interface CacheEntryStats {
  /** Number of items in cache */
  count: number;
  /** Total size in bytes */
  sizeBytes: number;
  /** Human-readable size (e.g., "12.5 MB") */
  sizeFormatted: string;
}

/** Statistics for all caches */
export interface CacheStats {
  /** URL image cache (for 'url' and 'manifest' sources) */
  urlImages: CacheEntryStats;
  /** ZIP image cache (for 'zip' source) */
  zipImages: CacheEntryStats;
  /** ZIP mask cache (for 'zip' source) */
  zipMasks: CacheEntryStats;
  /** Local image files (for 'local' source) - readonly, not a cache */
  localImages: CacheEntryStats;
  /** Total across all caches */
  total: CacheEntryStats;
  /** Current source type */
  sourceType: DatasetSource | null;
}

// ===========================================================================
// Memory Usage Types
// ===========================================================================

/** Memory item with size info */
export interface MemoryItem {
  /** Number of items */
  count: number;
  /** Estimated memory in bytes */
  sizeBytes: number;
  /** Human-readable size */
  sizeFormatted: string;
}

/** Loading strategy for a resource */
export type LoadStrategy = 'memory' | 'lazy' | 'unavailable';

/** Memory type - where the data is stored */
export type MemoryType = 'wasm' | 'js';

/** Resource info with loading strategy */
export interface ResourceInfo {
  /** Whether available */
  available: boolean;
  /** How the resource is loaded */
  strategy: LoadStrategy;
  /** Memory type (wasm or js) - only relevant when strategy is 'memory' */
  memoryType: MemoryType;
  /** Memory usage if loaded/cached */
  memory: MemoryItem;
}

/** Complete dataset memory breakdown */
export interface DatasetMemoryStats {
  /** 3D points - in WASM or JS memory */
  points3D: ResourceInfo;
  /** 2D keypoints per image - in WASM or JS memory */
  points2D: ResourceInfo;
  /** Feature matches (if database loaded) */
  matches: ResourceInfo;
  /** Camera models - always in JS memory */
  cameras: ResourceInfo;
  /** Image poses - in WASM or JS memory */
  imagePoses: ResourceInfo;
  /** Image files - lazy loaded, cached */
  imageFiles: ResourceInfo;
  /** Mask files - lazy loaded, cached */
  maskFiles: ResourceInfo;
  /** Images decoded and loaded to JS RAM (thumbnails + frustum textures) */
  imagesDecoded: ResourceInfo;
  /** Database file reference */
  database: ResourceInfo;
  /** Rig definitions */
  rigs: ResourceInfo;
  /** ZIP archive loaded in memory (for 'zip' source) */
  zipArchive: ResourceInfo;
  /** Total in WASM memory */
  totalWasm: MemoryItem;
  /** Total in JS memory */
  totalJs: MemoryItem;
  /** Total cached (lazy loaded images/masks) */
  totalCached: MemoryItem;
  /** Source type */
  sourceType: DatasetSource | null;
}
