import type { Camera, Point2D, Reconstruction } from '../types/colmap';
import type { Sim3dEuler } from '../types/sim3d';
import type { BoundingBox } from './types';
import type { Plane } from '../utils/ransac';
import type { HistogramData } from '../components/layout/statHistogramViewModel';
import { assertCompactPointMembership, pointMembershipTransfers, type CompactPointMembership } from './compactPointMembership';

/** Read-only rendering contract. Returned arrays belong to the source and must not be mutated. */
export interface ReconstructionPointSource {
  readonly pointCount: number;
  readonly immutableBuffers?: boolean;
  hasPoints(): boolean;
  getPositions(): Float32Array | null;
  getPositionsCopy(): Float32Array | null;
  getColors(): Float32Array | null;
  getColorsCopy(): Float32Array | null;
  getErrors(): Float32Array | null;
  getTrackLengths(): Uint32Array | null;
  getPoint3DIds(): BigUint64Array | null;
  getBoundingBox(): BoundingBox | null;
}

export interface ReconstructionLoadFiles {
  camerasFile: File;
  imagesFile: File;
  points3DFile: File;
  rigsFile?: File;
  framesFile?: File;
}

export type ReconstructionPhase = 'initializing' | 'parsing' | 'statistics' | 'snapshot' | 'editing' | 'exporting';
export type ReconstructionExecutionMode = 'worker' | 'main-thread-fallback';

export interface ReconstructionSnapshotData {
  revision: number;
  /** Metadata/index only: observations and authoritative 3D records stay with the service. */
  reconstruction: Reconstruction;
  /** Present on compact wire snapshots. The service installs read-only membership views. */
  pointMembership?: CompactPointMembership;
  positions: Float32Array;
  colors: Float32Array;
  errors: Float32Array;
  trackLengths: Uint32Array;
  point3DIds: BigUint64Array;
  boundingBox: BoundingBox | null;
  diagnostics: {
    parser: 'wasm' | 'javascript';
    parseMs: number;
    statisticsMs: number;
    snapshotMs: number;
    membershipPackMs?: number;
    membershipBytes?: number;
    renderBytes: number;
    wasmHeapBytes: number | null;
    retainedImageBufferBytes: number;
  };
  warnings: string[];
}

export interface ReconstructionExportPayload {
  format: 'binary' | 'text' | 'ply';
  transform?: Sim3dEuler;
}
export type ReconstructionExportFiles = Record<string, Uint8Array>;
export interface ReconstructionFloorResult {
  plane: Plane | null;
  distances: Float32Array | null;
  normalFlipped: boolean;
}

export interface ReconstructionOperationPayloads {
  init: null;
  load: ReconstructionLoadFiles;
  observations: { imageIds: number[] };
  transform: { transform: Sim3dEuler };
  deleteImages: { imageIds: number[] };
  updateCameras: { cameras: Map<number, Camera> };
  export: ReconstructionExportPayload;
  floor: { transform: Sim3dEuler; params: { distanceThreshold: number; sampleCount: number; maxIterations?: number } };
  histogram: { type: 'trackLength' | 'error' };
  dispose: null;
}
export interface ReconstructionOperationResults {
  init: null;
  load: ReconstructionSnapshotData;
  observations: Map<number, Point2D[]>;
  transform: ReconstructionSnapshotData;
  deleteImages: ReconstructionSnapshotData;
  updateCameras: ReconstructionSnapshotData;
  export: ReconstructionExportFiles;
  floor: ReconstructionFloorResult;
  histogram: HistogramData;
  dispose: null;
}
export type ReconstructionOperation = keyof ReconstructionOperationPayloads;
export type ReconstructionRequest = {
  [K in ReconstructionOperation]: {
    requestId: number;
    generation: number;
    operation: K;
    payload: ReconstructionOperationPayloads[K];
  }
}[ReconstructionOperation];

export type ReconstructionResponse = {
  requestId: number;
  generation: number;
  operation: ReconstructionOperation;
} & (
  | { type: 'progress'; phase: ReconstructionPhase }
  | { type: 'result'; result: ReconstructionOperationResults[ReconstructionOperation] }
  | { type: 'error'; error: { code: 'input' | 'operation' | 'protocol'; message: string } }
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function isId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
function isTransform(value: unknown): value is Sim3dEuler {
  if (!isRecord(value)) return false;
  return ['scale', 'rotationX', 'rotationY', 'rotationZ', 'translationX', 'translationY', 'translationZ']
    .every(key => typeof value[key] === 'number' && Number.isFinite(value[key])) && (value.scale as number) > 0;
}
function isFile(value: unknown): value is File {
  return isRecord(value) && typeof value.name === 'string' && typeof value.size === 'number'
    && value.size >= 0 && typeof value.arrayBuffer === 'function' && typeof value.text === 'function';
}

export function isReconstructionRequest(value: unknown): value is ReconstructionRequest {
  if (!isRecord(value) || !isId(value.requestId) || !isId(value.generation)) return false;
  const payload = value.payload;
  switch (value.operation) {
    case 'init': case 'dispose': return payload === null;
    case 'load': return isRecord(payload) && isFile(payload.camerasFile) && isFile(payload.imagesFile)
      && isFile(payload.points3DFile) && (payload.rigsFile === undefined || isFile(payload.rigsFile))
      && (payload.framesFile === undefined || isFile(payload.framesFile));
    case 'observations': case 'deleteImages': return isRecord(payload)
      && Array.isArray(payload.imageIds) && payload.imageIds.every(isId);
    case 'transform': return isRecord(payload) && isTransform(payload.transform);
    case 'histogram': return isRecord(payload) && (payload.type === 'trackLength' || payload.type === 'error');
    case 'updateCameras': return isRecord(payload) && payload.cameras instanceof Map
      && [...payload.cameras].every(([id, camera]) => isId(id) && isRecord(camera) && camera.cameraId === id
        && isId(camera.modelId) && isId(camera.width) && isId(camera.height)
        && Array.isArray(camera.params) && camera.params.every(value => typeof value === 'number' && Number.isFinite(value)));
    case 'floor': return isRecord(payload) && isTransform(payload.transform) && isRecord(payload.params)
      && typeof payload.params.distanceThreshold === 'number' && Number.isFinite(payload.params.distanceThreshold) && payload.params.distanceThreshold > 0
      && isId(payload.params.sampleCount) && payload.params.sampleCount > 0
      && (payload.params.maxIterations === undefined || (isId(payload.params.maxIterations) && payload.params.maxIterations > 0));
    case 'export': return isRecord(payload) && ['binary', 'text', 'ply'].includes(String(payload.format))
      && (payload.transform === undefined || isTransform(payload.transform));
    default: return false;
  }
}

export function isReconstructionResponse(value: unknown): value is ReconstructionResponse {
  if (!isRecord(value) || !isId(value.requestId) || !isId(value.generation)
    || !['init', 'load', 'observations', 'transform', 'deleteImages', 'updateCameras', 'export', 'floor', 'histogram', 'dispose'].includes(String(value.operation))) return false;
  if (value.type === 'progress') return ['initializing', 'parsing', 'statistics', 'snapshot', 'editing', 'exporting'].includes(String(value.phase));
  if (value.type === 'error') return isRecord(value.error) && typeof value.error.message === 'string'
    && ['input', 'operation', 'protocol'].includes(String(value.error.code));
  return value.type === 'result' && 'result' in value;
}

export function assertReconstructionSnapshot(value: unknown): asserts value is ReconstructionSnapshotData {
  if (!isRecord(value) || !isId(value.revision) || !(value.positions instanceof Float32Array)
    || !(value.colors instanceof Float32Array) || !(value.errors instanceof Float32Array)
    || !(value.trackLengths instanceof Uint32Array) || !(value.point3DIds instanceof BigUint64Array)
    || !isRecord(value.reconstruction) || !(value.reconstruction.cameras instanceof Map)
    || !(value.reconstruction.images instanceof Map) || !(value.reconstruction.imageStats instanceof Map)
    || !(value.reconstruction.imageToPoint3DIds instanceof Map) || !(value.reconstruction.connectedImagesIndex instanceof Map)
    || !isRecord(value.diagnostics) || !Array.isArray(value.warnings)) throw new Error('Invalid reconstruction snapshot');
  const count = value.point3DIds.length;
  if (value.positions.length !== count * 3 || value.colors.length !== count * 3
    || value.errors.length !== count || value.trackLengths.length !== count
    || value.reconstruction.points3D !== undefined) throw new Error('Invalid reconstruction snapshot arrays');
  if (value.pointMembership !== undefined) assertCompactPointMembership(value.pointMembership);
}

/** Only copies owned by the message are transferable. Live WASM memory is never passed here. */
export function reconstructionResultTransfers(result: ReconstructionOperationResults[ReconstructionOperation]): ArrayBuffer[] {
  if (!result || result instanceof Map) return [];
  if ('bins' in result) return [];
  if ('distances' in result) return result.distances instanceof Float32Array ? [result.distances.buffer as ArrayBuffer] : [];
  if ('revision' in result) {
    const snapshot = result as ReconstructionSnapshotData;
    return [snapshot.positions, snapshot.colors, snapshot.errors, snapshot.trackLengths, snapshot.point3DIds]
      .map(array => array.buffer as ArrayBuffer)
      .concat(snapshot.pointMembership ? pointMembershipTransfers(snapshot.pointMembership) : []);
  }
  return Object.values(result).map(array => (array as Uint8Array).buffer as ArrayBuffer);
}
