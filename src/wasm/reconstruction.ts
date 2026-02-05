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
  WasmRig,
  WasmFrame,
  ImagePoints2DData,
} from './types';
import type { Point2D, Point3D, Point3DId, TrackElement } from '../types/colmap';

/**
 * Wrapper class for WASM Reconstruction with safer memory handling
 */
export class WasmReconstructionWrapper {
  private module: ColmapWasmModule | null = null;
  private reconstruction: WasmReconstruction | null = null;
  private memoryVersion = 0;

  // Disposal flag - set BEFORE freeing memory to prevent race conditions
  private _disposed = false;

  // Cached views - invalidated when memory version changes
  private cachedPositions: Float32Array | null = null;
  private cachedColors: Float32Array | null = null;
  private cachedErrors: Float32Array | null = null;
  private cachedTrackLengths: Uint32Array | null = null;

  // Lazy loading: store original images.bin buffer for on-demand 2D point loading
  private imagesBuffer: ArrayBuffer | null = null;

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
   * Parse images.bin data in lite mode (skip 2D points to save memory)
   * Does NOT support lazy loading - 2D points are completely unavailable.
   */
  parseImagesLite(buffer: ArrayBuffer): boolean {
    if (!this.reconstruction) {
      throw new Error('WASM module not initialized');
    }
    this.invalidateCaches();
    this.imagesBuffer = null;  // No lazy loading in lite mode
    return this.reconstruction.parseImagesLite(buffer);
  }

  /**
   * Parse images.bin data in lazy mode (skip 2D points but store offsets)
   * Supports on-demand loading of 2D points via loadImagePoints2D().
   *
   * This is the recommended mode for large files - it stores only ~50KB of
   * offset data instead of potentially gigabytes of 2D point data.
   */
  parseImagesLazy(buffer: ArrayBuffer): boolean {
    if (!this.reconstruction) {
      throw new Error('WASM module not initialized');
    }
    this.invalidateCaches();
    // Store buffer reference for lazy loading
    this.imagesBuffer = buffer;
    // Fall back to regular parseImages if parseImagesLazy not available (older WASM)
    if (typeof this.reconstruction.parseImagesLazy === 'function') {
      return this.reconstruction.parseImagesLazy(buffer);
    }
    console.warn('[WASM] parseImagesLazy not available, falling back to parseImages');
    return this.reconstruction.parseImages(buffer);
  }

  /**
   * Check if lazy loading mode is active
   */
  isLazyMode(): boolean {
    if (!this.reconstruction || typeof this.reconstruction.isLazyMode !== 'function') {
      return false;
    }
    return this.reconstruction.isLazyMode();
  }

  /**
   * Load 2D points for a specific image on-demand (lazy loading)
   * Only works if parseImagesLazy() was used.
   *
   * Returns a copy of the data (not a view), safe to store.
   */
  loadImagePoints2D(imageId: number): ImagePoints2DData | null {
    if (!this.reconstruction || !this.imagesBuffer) {
      return null;
    }
    if (!this.reconstruction.isLazyMode()) {
      // Not in lazy mode - try getImagePoints2D instead
      return this.getImagePoints2D(imageId);
    }
    return this.reconstruction.loadImagePoints2DFromBuffer(imageId, this.imagesBuffer);
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
   * Parse rigs.bin data
   */
  parseRigs(buffer: ArrayBuffer): boolean {
    if (!this.reconstruction) {
      throw new Error('WASM module not initialized');
    }
    return this.reconstruction.parseRigs(buffer);
  }

  /**
   * Parse frames.bin data
   */
  parseFrames(buffer: ArrayBuffer): boolean {
    if (!this.reconstruction) {
      throw new Error('WASM module not initialized');
    }
    return this.reconstruction.parseFrames(buffer);
  }

  /**
   * Clear all loaded data
   */
  clear(): void {
    if (this.reconstruction) {
      this.reconstruction.clear();
      this.invalidateCaches();
    }
    this.imagesBuffer = null;
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
   * Get rig count
   */
  get rigCount(): number {
    return this.reconstruction?.getRigCount() ?? 0;
  }

  /**
   * Get frame count
   */
  get frameCount(): number {
    return this.reconstruction?.getFrameCount() ?? 0;
  }

  /**
   * Check if points are loaded and wrapper is not disposed
   */
  hasPoints(): boolean {
    return !this._disposed && this.pointCount > 0;
  }

  /**
   * Get positions as Float32Array view
   *
   * WARNING: This is a zero-copy view into WASM memory.
   * The view becomes invalid if more data is parsed.
   * Use getPositionsCopy() if you need to keep the data.
   */
  getPositions(): Float32Array | null {
    if (this._disposed || !this.reconstruction) return null;
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
    if (this._disposed || !this.reconstruction) return null;
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
    if (this._disposed || !this.reconstruction) return null;
    if (!this.cachedErrors) {
      this.cachedErrors = this.reconstruction.getErrors();
    }
    return this.cachedErrors;
  }

  /**
   * Get track lengths per point
   */
  getTrackLengths(): Uint32Array | null {
    if (this._disposed || !this.reconstruction) return null;
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
   * Get track offsets (CSR format) for points3D
   */
  getTrackOffsets(): Uint32Array | null {
    return this.reconstruction?.getTrackOffsets() ?? null;
  }

  /**
   * Get track image IDs (flattened)
   */
  getTrackImageIds(): Uint32Array | null {
    return this.reconstruction?.getTrackImageIds() ?? null;
  }

  /**
   * Get track point2D indices (flattened)
   */
  getTrackPoint2DIdxs(): Uint32Array | null {
    return this.reconstruction?.getTrackPoint2DIdxs() ?? null;
  }

  /**
   * Get actual COLMAP point3D_id values (for consistent 2D point lookups)
   */
  getPoint3DIds(): BigUint64Array | null {
    if (this._disposed) return null;
    return this.reconstruction?.getPoint3DIds() ?? null;
  }

  /**
   * Get points2D XY coordinates [x,y, x,y, ...] per image (CSR format)
   */
  getPoints2DXY(): Float32Array | null {
    return this.reconstruction?.getPoints2DXY() ?? null;
  }

  /**
   * Get points2D point3D IDs (-1 if no corresponding 3D point)
   */
  getPoints2DPoint3DIds(): BigInt64Array | null {
    return this.reconstruction?.getPoints2DPoint3DIds() ?? null;
  }

  /**
   * Get points2D offsets (CSR format, num_images + 1 entries)
   */
  getPoints2DOffsets(): Uint32Array | null {
    return this.reconstruction?.getPoints2DOffsets() ?? null;
  }

  /**
   * Get number of 2D points per image (always available, even in lite mode)
   */
  getNumPoints2DPerImage(): Uint32Array | null {
    return this.reconstruction?.getNumPoints2DPerImage() ?? null;
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
   * Get rig by ID
   */
  getRig(rigId: number): WasmRig | null {
    return this.reconstruction?.getRig(rigId) ?? null;
  }

  /**
   * Get frame by ID
   */
  getFrame(frameId: number): WasmFrame | null {
    return this.reconstruction?.getFrame(frameId) ?? null;
  }

  /**
   * Get all rigs
   */
  getAllRigs(): Record<string, WasmRig> {
    return this.reconstruction?.getAllRigs() ?? {};
  }

  /**
   * Get all frames
   */
  getAllFrames(): Record<string, WasmFrame> {
    return this.reconstruction?.getAllFrames() ?? {};
  }

  /**
   * Check if rig data is available
   */
  hasRigData(): boolean {
    return this.reconstruction?.hasRigData() ?? false;
  }

  /**
   * Get 2D points for a specific image (zero-copy view into WASM memory)
   *
   * WARNING: The returned typed arrays are views into WASM memory.
   * They become invalid if WASM memory grows (e.g., more data is parsed).
   * Use getImagePoints2DArray() if you need a copy that won't be invalidated.
   */
  getImagePoints2D(imageId: number): ImagePoints2DData | null {
    if (!this.reconstruction) return null;
    const result = this.reconstruction.getImagePoints2D(imageId);
    if (!result) return null;
    return {
      xy: result.xy,
      point3dIds: result.point3dIds,
      count: result.count,
    };
  }

  /**
   * Get 2D points for a specific image as a Point2D array (copies data from WASM)
   *
   * This method creates a copy of the data, making it safe to use across
   * WASM memory growth operations. Use this when you need to store the points.
   *
   * Works in both full mode (getImagePoints2D) and lazy mode (loadImagePoints2D).
   */
  getImagePoints2DArray(imageId: number): Point2D[] {
    // Try lazy loading first if in lazy mode
    let data: ImagePoints2DData | null = null;
    if (this.isLazyMode()) {
      data = this.loadImagePoints2D(imageId);
    } else {
      data = this.getImagePoints2D(imageId);
    }

    if (!data || data.count === 0) return [];

    const points: Point2D[] = [];
    for (let i = 0; i < data.count; i++) {
      points.push({
        xy: [data.xy[i * 2], data.xy[i * 2 + 1]] as [number, number],
        point3DId: data.point3dIds[i],
      });
    }
    return points;
  }

  /**
   * Build a full points3D Map from WASM data on-demand.
   * This is expensive (copies all data) - use only for export/transform operations.
   * For rendering, use the typed array methods instead.
   */
  buildPoints3DMap(): Map<Point3DId, Point3D> {
    const points3D = new Map<Point3DId, Point3D>();

    if (!this.reconstruction) {
      return points3D;
    }

    const pointCount = this.pointCount;
    const positions = this.getPositions();
    const colors = this.getColors();
    const errors = this.getErrors();
    const trackOffsets = this.getTrackOffsets();
    const trackImageIds = this.getTrackImageIds();
    const trackPoint2DIdxs = this.getTrackPoint2DIdxs();
    const point3DIds = this.getPoint3DIds();

    if (!positions || !colors || !errors) {
      return points3D;
    }

    for (let i = 0; i < pointCount; i++) {
      // Use actual COLMAP point3D_id to ensure consistency with 2D point references
      const id = point3DIds ? point3DIds[i] : BigInt(i + 1);

      // Build track array from CSR data
      const track: TrackElement[] = [];
      if (trackOffsets && trackImageIds && trackPoint2DIdxs && i < trackOffsets.length - 1) {
        const start = trackOffsets[i];
        const end = trackOffsets[i + 1];

        for (let j = start; j < end; j++) {
          track.push({
            imageId: trackImageIds[j],
            point2DIdx: trackPoint2DIdxs[j],
          });
        }
      }

      points3D.set(id, {
        point3DId: id,
        xyz: [
          positions[i * 3],
          positions[i * 3 + 1],
          positions[i * 3 + 2],
        ] as [number, number, number],
        rgb: [
          Math.round(colors[i * 3] * 255),
          Math.round(colors[i * 3 + 1] * 255),
          Math.round(colors[i * 3 + 2] * 255),
        ] as [number, number, number],
        error: errors[i],
        track,
      });
    }

    return points3D;
  }

  /**
   * Dispose of WASM resources
   */
  dispose(): void {
    // Set disposed flag FIRST to prevent any concurrent access
    // This ensures hasPoints() returns false immediately
    this._disposed = true;
    this.invalidateCaches();
    if (this.reconstruction) {
      this.reconstruction.delete();
      this.reconstruction = null;
    }
    this.module = null;
    this.imagesBuffer = null;
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
