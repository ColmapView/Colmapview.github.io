import type { Camera, Image, Point3D, Point3DId } from '../../types/colmap';
import type { ArchiveEntry } from '../../archive/types';

export type CameraDatasetSchema = 'colmap' | 'nerf-blender' | 'nerfstudio' | 'instant-ngp'
  | 'opensfm' | 'openmvg' | 'bundler' | 'gaussian-splatting' | 'llff' | 'dtu';
export type MaskRole = 'validity' | 'foreground' | 'ignore' | 'label' | 'unknown';

export interface ImportDiagnostic {
  code: string;
  severity: 'info' | 'warning';
  message: string;
  frameIndex?: number;
  path?: string;
}

export class CameraDatasetImportError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'CameraDatasetImportError';
    this.code = code;
  }
}

export interface ImportedFileMask {
  kind: 'file';
  path: string;
  role: MaskRole;
  invert: boolean;
  normalization?: 'binary-luminance';
}

export interface ImportedImageBinding {
  sourceImagePath: string;
  width: number;
  height: number;
  frameIndex: number;
  time?: number;
  mask?: ImportedFileMask | { kind: 'alpha'; role: 'foreground' };
}

export type CameraDatasetSource =
  | { kind: 'local'; files: ReadonlyMap<string, File> }
  | { kind: 'archive'; entries: ReadonlyMap<string, ArchiveEntry> }
  | {
    kind: 'url';
    baseUrl: string;
    /** Complete file paths relative to baseUrl, when a host provides an authoritative listing. */
    filePaths?: readonly string[];
    /** Archive members keyed by their logical, encoded resource URL. */
    archiveEntries?: ReadonlyMap<string, ArchiveEntry>;
  };

export interface CameraDatasetSelection {
  metadataPath: string;
  sceneRoot: string;
  schema: CameraDatasetSchema;
  split: string | null;
  component?: number;
}

/** Immutable for a committed scene. Live readers stay with their existing source owner. */
export interface CameraDatasetImportContext {
  source: CameraDatasetSource;
  selection: CameraDatasetSelection;
  bindings: ReadonlyMap<string, ImportedImageBinding>;
  /** Native COLMAP masks remain readable when the corresponding RGB photo is absent. */
  nativeMasks?: ReadonlyMap<string, ImportedFileMask>;
  diagnostics: readonly ImportDiagnostic[];
  metadataFrameCount: number;
  savedWorldMetadata?: Record<string, unknown>;
  /** Untracked XYZ geometry (companion PLY or embedded OpenSfM points); no observations are synthesized. */
  pointCloud?: { sourcePath: string };
}

export interface NormalizedCameraDataset {
  cameras: Map<number, Camera>;
  images: Map<number, Image>;
  points3D?: Map<Point3DId, Point3D>;
  bindings: Map<string, ImportedImageBinding>;
  diagnostics: ImportDiagnostic[];
  schema: CameraDatasetSchema;
  metadataFrameCount: number;
  savedWorldMetadata?: Record<string, unknown>;
}

export interface PreparedCameraDataset {
  files: Map<string, File>;
  context: CameraDatasetImportContext;
}

export const MAX_CAMERA_METADATA_BYTES = 16 * 1024 * 1024;
export const MAX_CAMERA_FRAMES = 100_000;
export const MAX_CAMERA_METADATA_CANDIDATES = 256;

export function importError(code: string, message: string): never {
  throw new CameraDatasetImportError(code, message);
}

export function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return importError('INVALID_METADATA', `${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function finite(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return importError('INVALID_CALIBRATION', `${field} must be a finite number.`);
  }
  return value;
}

export function positive(value: unknown, field: string): number {
  const number = finite(value, field);
  if (number <= 0) return importError('INVALID_CALIBRATION', `${field} must be positive.`);
  return number;
}

export function dimension(value: unknown, field: string): number {
  const number = positive(value, field);
  if (!Number.isSafeInteger(number)) return importError('INVALID_CALIBRATION', `${field} must be an integer.`);
  return number;
}
