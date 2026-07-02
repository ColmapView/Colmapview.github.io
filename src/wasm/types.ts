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

declare const embindEnumBrand: unique symbol;

/**
 * Opaque handle to an Emscripten embind enum value.
 *
 * Embind `enum_<>` bindings expose each enumerator as a tagged wrapper object,
 * NOT a plain integer, and the wrapper must be handed back to embind APIs
 * verbatim. Treat this as opaque — obtain a value only by indexing the runtime
 * enum object (e.g. `module.CameraModelId.PINHOLE`); never construct one or pass
 * a raw integer, which embind silently misinterprets.
 *
 * (The canonical numeric camera-model ids live in `src/types/cameraModelId.ts`;
 * this module deliberately does not mirror them.)
 */
export interface EmbindEnumValue {
  readonly [embindEnumBrand]: never;
}

/**
 * Sensor types matching COLMAP's enum (for rigs)
 */
export const WasmSensorType = {
  CAMERA: 0,
  IMU: 1,
} as const;

export type WasmSensorType = (typeof WasmSensorType)[keyof typeof WasmSensorType];

/**
 * Sensor identifier from WASM
 */
export interface WasmSensorId {
  type: WasmSensorType;
  id: number;
}

/**
 * Pose (quaternion + translation) from WASM
 */
export interface WasmRigPose {
  qvec: [number, number, number, number];
  tvec: [number, number, number];
}

/**
 * Sensor within a rig from WASM
 */
export interface WasmRigSensor {
  sensorId: WasmSensorId;
  hasPose: boolean;
  pose?: WasmRigPose;
}

/**
 * Rig data from WASM
 */
export interface WasmRig {
  rigId: number;
  refSensorId: WasmSensorId | null;
  sensors: WasmRigSensor[];
}

/**
 * Frame data mapping from WASM
 */
export interface WasmFrameDataMapping {
  sensorId: WasmSensorId;
  dataId: number;
}

/**
 * Frame data from WASM
 */
export interface WasmFrame {
  frameId: number;
  rigId: number;
  rigFromWorld: WasmRigPose;
  dataIds: WasmFrameDataMapping[];
}

/**
 * Per-image 2D points data from WASM (zero-copy views)
 */
export interface ImagePoints2DData {
  /** 2D coordinates [x,y, x,y, ...] - zero-copy view into WASM memory */
  xy: Float32Array;
  /** Point3D IDs (-1 if no 3D correspondence) - zero-copy view into WASM memory */
  point3dIds: BigInt64Array;
  /** Number of 2D points */
  count: number;
}

/**
 * Embind-generated Reconstruction class interface
 */
export interface WasmReconstruction {
  // Parsing methods
  parsePoints3D(buffer: ArrayBuffer): boolean;
  parseImages(buffer: ArrayBuffer): boolean;
  parseImagesLite(buffer: ArrayBuffer): boolean;  // Skip 2D points for large files (no lazy loading)
  parseImagesLazy(buffer: ArrayBuffer): boolean;  // Skip 2D points but store offsets for lazy loading
  parseCameras(buffer: ArrayBuffer): boolean;
  parseRigs(buffer: ArrayBuffer): boolean;
  parseFrames(buffer: ArrayBuffer): boolean;

  // Lazy loading: load 2D points for a single image on-demand from original buffer
  loadImagePoints2DFromBuffer(imageId: number, buffer: ArrayBuffer): ImagePoints2DData | null;
  isLazyMode(): boolean;

  // Counts
  getPointCount(): number;
  getImageCount(): number;
  getCameraCount(): number;
  getRigCount(): number;
  getFrameCount(): number;

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
  getPoint3DIds(): BigUint64Array | null;  // Actual COLMAP point3D_id values

  // Points2D data (CSR format per image)
  getPoints2DXY(): Float32Array | null;
  getPoints2DPoint3DIds(): BigInt64Array | null;
  getPoints2DOffsets(): Uint32Array | null;
  getNumPoints2DPerImage(): Uint32Array | null;

  // Per-image 2D points accessor (for lazy loading)
  getImagePoints2D(imageId: number): ImagePoints2DData | null;

  // Metadata
  getCameraInfo(cameraId: number): CameraInfo | null;
  getImageInfo(imageId: number): ImageInfo | null;
  getAllCameras(): Record<string, CameraInfo>;
  getAllImageInfos(): ImageInfo[];

  // Rig/frame data
  getRig(rigId: number): WasmRig | null;
  getFrame(frameId: number): WasmFrame | null;
  getAllRigs(): Record<string, WasmRig>;
  getAllFrames(): Record<string, WasmFrame>;
  hasRigData(): boolean;

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

  // Enums — runtime embind enum objects keyed by COLMAP model name.
  // e.g. module.CameraModelId["PINHOLE"] -> an opaque EmbindEnumValue.
  CameraModelId: Readonly<Record<string, EmbindEnumValue>>;
  SensorType: typeof WasmSensorType;

  /**
   * Number of intrinsic parameters for a camera model.
   * Pass `module.CameraModelId.<NAME>` (the embind enum object) — raw integers
   * are silently misinterpreted by embind.
   */
  getNumCameraParams(modelId: EmbindEnumValue): number;

  // Emscripten memory (for memory monitoring)
  HEAPU8: Uint8Array;
  HEAP32: Int32Array;
  HEAPF32: Float32Array;
  HEAPF64: Float64Array;
}

/**
 * Emscripten module configuration options
 */
export interface EmscriptenModuleConfig {
  locateFile?: (path: string, prefix: string) => string;
  print?: (text: string) => void;
  printErr?: (text: string) => void;
}

/**
 * Factory function type returned by the WASM loader
 */
export type CreateColmapWasm = (config?: EmscriptenModuleConfig) => Promise<ColmapWasmModule>;
