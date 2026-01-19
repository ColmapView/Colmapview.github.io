/**
 * TypeScript wrapper for WASM Reconstruction
 *
 * Provides a cleaner interface and handles memory view management.
 */

import { loadColmapWasm } from './init';
import type {
  ColmapWasmModule,
  WasmReconstruction,
  BoundingBox,
  ReconstructionStats,
  CameraInfo,
  ImageInfo,
} from './types';

/**
 * Wrapper class for WASM Reconstruction with safer memory handling
 */
export class WasmReconstructionWrapper {
  private module: ColmapWasmModule | null = null;
  private reconstruction: WasmReconstruction | null = null;
  private memoryVersion = 0;

  // Cached views - invalidated when memory version changes
  private cachedPositions: Float32Array | null = null;
  private cachedColors: Float32Array | null = null;
  private cachedErrors: Float32Array | null = null;
  private cachedTrackLengths: Uint32Array | null = null;

  /**
   * Initialize the WASM module and create a Reconstruction instance
   */
  async initialize(): Promise<boolean> {
    if (this.reconstruction) {
      return true;
    }

    this.module = await loadColmapWasm();
    if (!this.module) {
      return false;
    }

    this.reconstruction = new this.module.Reconstruction();
    return true;
  }

  /**
   * Check if WASM module is ready
   */
  get isReady(): boolean {
    return this.reconstruction !== null;
  }

  /**
   * Get the raw WASM reconstruction instance (for advanced use)
   */
  get raw(): WasmReconstruction | null {
    return this.reconstruction;
  }

  /**
   * Invalidate cached views (call after parsing or when memory might have grown)
   */
  private invalidateCaches(): void {
    this.memoryVersion++;
    this.cachedPositions = null;
    this.cachedColors = null;
    this.cachedErrors = null;
    this.cachedTrackLengths = null;
  }

  /**
   * Parse points3D.bin data
   */
  parsePoints3D(buffer: ArrayBuffer): boolean {
    if (!this.reconstruction) {
      throw new Error('WASM module not initialized');
    }
    this.invalidateCaches();
    return this.reconstruction.parsePoints3D(buffer);
  }

  /**
   * Parse images.bin data
   */
  parseImages(buffer: ArrayBuffer): boolean {
    if (!this.reconstruction) {
      throw new Error('WASM module not initialized');
    }
    this.invalidateCaches();
    return this.reconstruction.parseImages(buffer);
  }

  /**
   * Parse cameras.bin data
   */
  parseCameras(buffer: ArrayBuffer): boolean {
    if (!this.reconstruction) {
      throw new Error('WASM module not initialized');
    }
    return this.reconstruction.parseCameras(buffer);
  }

  /**
   * Clear all loaded data
   */
  clear(): void {
    if (this.reconstruction) {
      this.reconstruction.clear();
      this.invalidateCaches();
    }
  }

  /**
   * Get point count
   */
  get pointCount(): number {
    return this.reconstruction?.getPointCount() ?? 0;
  }

  /**
   * Get image count
   */
  get imageCount(): number {
    return this.reconstruction?.getImageCount() ?? 0;
  }

  /**
   * Get camera count
   */
  get cameraCount(): number {
    return this.reconstruction?.getCameraCount() ?? 0;
  }

  /**
   * Check if points are loaded
   */
  hasPoints(): boolean {
    return this.pointCount > 0;
  }

  /**
   * Get positions as Float32Array view
   *
   * WARNING: This is a zero-copy view into WASM memory.
   * The view becomes invalid if more data is parsed.
   * Use getPositionsCopy() if you need to keep the data.
   */
  getPositions(): Float32Array | null {
    if (!this.reconstruction) return null;
    if (!this.cachedPositions) {
      this.cachedPositions = this.reconstruction.getPositions();
    }
    return this.cachedPositions;
  }

  /**
   * Get a copy of positions (safe to keep across operations)
   */
  getPositionsCopy(): Float32Array | null {
    const view = this.getPositions();
    return view ? new Float32Array(view) : null;
  }

  /**
   * Get colors as Float32Array view (normalized 0-1)
   */
  getColors(): Float32Array | null {
    if (!this.reconstruction) return null;
    if (!this.cachedColors) {
      this.cachedColors = this.reconstruction.getColors();
    }
    return this.cachedColors;
  }

  /**
   * Get a copy of colors
   */
  getColorsCopy(): Float32Array | null {
    const view = this.getColors();
    return view ? new Float32Array(view) : null;
  }

  /**
   * Get reprojection errors
   */
  getErrors(): Float32Array | null {
    if (!this.reconstruction) return null;
    if (!this.cachedErrors) {
      this.cachedErrors = this.reconstruction.getErrors();
    }
    return this.cachedErrors;
  }

  /**
   * Get track lengths per point
   */
  getTrackLengths(): Uint32Array | null {
    if (!this.reconstruction) return null;
    if (!this.cachedTrackLengths) {
      this.cachedTrackLengths = this.reconstruction.getTrackLengths();
    }
    return this.cachedTrackLengths;
  }

  /**
   * Get image quaternions [qw,qx,qy,qz, ...] per image
   */
  getImageQuaternions(): Float32Array | null {
    return this.reconstruction?.getImageQuaternions() ?? null;
  }

  /**
   * Get image translations [tx,ty,tz, ...] per image
   */
  getImageTranslations(): Float32Array | null {
    return this.reconstruction?.getImageTranslations() ?? null;
  }

  /**
   * Get bounding box
   */
  getBoundingBox(): BoundingBox | null {
    return this.reconstruction?.getBoundingBox() ?? null;
  }

  /**
   * Get reconstruction statistics
   */
  getStats(): ReconstructionStats | null {
    return this.reconstruction?.getStats() ?? null;
  }

  /**
   * Get camera info by ID
   */
  getCameraInfo(cameraId: number): CameraInfo | null {
    return this.reconstruction?.getCameraInfo(cameraId) ?? null;
  }

  /**
   * Get image info by ID
   */
  getImageInfo(imageId: number): ImageInfo | null {
    return this.reconstruction?.getImageInfo(imageId) ?? null;
  }

  /**
   * Get all cameras
   */
  getAllCameras(): Record<string, CameraInfo> {
    return this.reconstruction?.getAllCameras() ?? {};
  }

  /**
   * Get all image infos
   */
  getAllImageInfos(): ImageInfo[] {
    return this.reconstruction?.getAllImageInfos() ?? [];
  }

  /**
   * Dispose of WASM resources
   */
  dispose(): void {
    if (this.reconstruction) {
      this.reconstruction.delete();
      this.reconstruction = null;
    }
    this.invalidateCaches();
    this.module = null;
  }
}

/**
 * Create a new WasmReconstructionWrapper and initialize it
 */
export async function createWasmReconstruction(): Promise<WasmReconstructionWrapper | null> {
  const wrapper = new WasmReconstructionWrapper();
  const success = await wrapper.initialize();
  return success ? wrapper : null;
}

/**
 * Try to create WASM reconstruction, return null if unavailable
 * (for optional WASM support with JS fallback)
 */
export async function tryCreateWasmReconstruction(): Promise<WasmReconstructionWrapper | null> {
  try {
    return await createWasmReconstruction();
  } catch {
    return null;
  }
}
