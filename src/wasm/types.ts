/**
 * TypeScript type definitions for colmap-wasm module
 */

export interface BoundingBox {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface ReconstructionStats {
  numPoints: number;
  numImages: number;
  numCameras: number;
  totalObservations: number;
  meanTrackLength: number;
  meanReprojectionError: number;
  boundingBox: BoundingBox;
}

export interface CameraInfo {
  cameraId: number;
  modelId: number;
  width: number;
  height: number;
  params: number[];
}

export interface ImageInfo {
  imageId: number;
  cameraId: number;
  name: string;
  quaternion?: [number, number, number, number];
  translation?: [number, number, number];
}

/**
 * Camera model IDs matching COLMAP's enum
 */
export const CameraModelId = {
  SIMPLE_PINHOLE: 0,
  PINHOLE: 1,
  SIMPLE_RADIAL: 2,
  RADIAL: 3,
  OPENCV: 4,
  OPENCV_FISHEYE: 5,
  FULL_OPENCV: 6,
  FOV: 7,
  SIMPLE_RADIAL_FISHEYE: 8,
  RADIAL_FISHEYE: 9,
  THIN_PRISM_FISHEYE: 10,
} as const;

export type CameraModelId = (typeof CameraModelId)[keyof typeof CameraModelId];

/**
 * Embind-generated Reconstruction class interface
 */
export interface WasmReconstruction {
  // Parsing methods
  parsePoints3D(buffer: ArrayBuffer): boolean;
  parseImages(buffer: ArrayBuffer): boolean;
  parseCameras(buffer: ArrayBuffer): boolean;

  // Counts
  getPointCount(): number;
  getImageCount(): number;
  getCameraCount(): number;

  // Point cloud data - zero-copy typed arrays
  getPositions(): Float32Array | null;
  getColors(): Float32Array | null;
  getErrors(): Float32Array | null;
  getTrackLengths(): Uint32Array | null;

  // Image pose data
  getImageQuaternions(): Float32Array | null;
  getImageTranslations(): Float32Array | null;

  // Track data (CSR format)
  getTrackOffsets(): Uint32Array | null;
  getTrackImageIds(): Uint32Array | null;
  getTrackPoint2DIdxs(): Uint32Array | null;

  // Metadata
  getCameraInfo(cameraId: number): CameraInfo | null;
  getImageInfo(imageId: number): ImageInfo | null;
  getAllCameras(): Record<string, CameraInfo>;
  getAllImageInfos(): ImageInfo[];

  // Computed properties
  getBoundingBox(): BoundingBox;
  getStats(): ReconstructionStats;

  // Cleanup
  clear(): void;

  // Destructor (Embind classes have delete)
  delete(): void;
}

/**
 * Constructor type for WasmReconstruction
 */
export interface WasmReconstructionConstructor {
  new (): WasmReconstruction;
}

/**
 * Emscripten module interface
 */
export interface ColmapWasmModule {
  // Reconstruction class
  Reconstruction: WasmReconstructionConstructor;

  // Enum
  CameraModelId: typeof CameraModelId;

  // Helper function
  getNumCameraParams(modelId: CameraModelId): number;

  // Emscripten memory (for memory monitoring)
  HEAPU8: Uint8Array;
  HEAP32: Int32Array;
  HEAPF32: Float32Array;
  HEAPF64: Float64Array;
}

/**
 * Factory function type returned by the WASM loader
 */
export type CreateColmapWasm = () => Promise<ColmapWasmModule>;
