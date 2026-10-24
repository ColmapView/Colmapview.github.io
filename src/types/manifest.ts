import { z } from 'zod';
import { MAX_GEOMETRY_MEMBER_BYTES, MAX_GEOMETRY_PREFIX_BYTES } from '../archive/geometryLimits';

/**
 * COLMAP manifest file format for loading reconstructions from URLs.
 * Used for loading datasets from Hugging Face and other web sources.
 */
export interface ManifestMediaArchive {
  /** Pinned HTTP(S) ZIP or plain TAR; its actual range size must match bytes. */
  url: string;
  bytes: number;
  /** Plain TAR only: index this complete, block-aligned prefix (for example one temporal frame). */
  indexBytes?: number;
  /** Scene-owned logical directory in which to expose members. */
  mountPath: string;
  /** Remove this exact member-directory prefix, without flattening subfolders. */
  stripPrefix?: string;
  role?: 'images' | 'masks';
}

/** One explicit geometry frame; archive timelines are never merged into a static model. */
export interface ManifestGeometryArchive {
  url: string;
  bytes: number;
  format: 'zip' | 'tar.zst';
  role: 'points3D' | 'splat';
  member: { path: string; bytes: number; sha256: string };
  /** TAR/Zstandard: checked compressed prefix containing the complete first regular file. */
  prefix?: { bytes: number; sha256: string };
}

export type ManifestVideoImage = {
  url: string;
  bytes: number;
  playbackRate?: number;
} & ({ timestamp: number; frameIndex?: never } | { frameIndex: number; timestamp?: never });

export interface ColmapManifest {
  /** Versions 1–4 retain their contracts; version 5 adds presentation-frame indices. */
  version: number;
  /** Optional name for the reconstruction */
  name?: string;
  /** Base URL prefix for all relative file paths */
  baseUrl: string;
  /** Optional saved ColmapView presentation, relative to baseUrl. */
  viewerStatePath?: string;
  /** Model file paths relative to baseUrl, or absolute HTTP(S) URLs. */
  files: {
    cameras: string;
    images: string;
    /**
     * COLMAP binary/text or an XYZ PLY in the world coordinate system used by the poses.
     * Omit for a camera-only reconstruction. Declared files must exist.
     */
    points3D?: string;
    rigs?: string;
    frames?: string;
  };
  /**
   * Path prefix for source images relative to baseUrl.
   * Image names from images.bin are appended to this prefix.
   * Example: "images/" means image "cam1/photo.jpg" becomes "images/cam1/photo.jpg"
   * Default: "images/"
   */
  imagesPath?: string;
  /**
   * Path prefix for mask files relative to baseUrl.
   * Mask naming: imagesPath filename + ".png" suffix
   * Example: "masks/" means image "cam1/photo.jpg" gets mask "masks/cam1/photo.jpg.png"
   * Default: "masks/"
   */
  masksPath?: string;
  /**
   * Whether to skip loading source images (only load COLMAP data).
   * Default: false
   */
  skipImages?: boolean;
  /**
   * Optional per-image override map: COLMAP image name -> path relative to
   * baseUrl, or absolute HTTP(S) URL. Resolves datasets that renamed images
   * before COLMAP and ship a mapping (e.g. image_mapping.csv); unmapped names
   * fall back to imagesPath.
   */
  imageNameToPath?: Record<string, string>;
  /** Explicit mask paths keyed by registered image name. Absolute HTTP(S) URLs are allowed. */
  maskNameToPath?: Record<string, string>;
  /** Meaning of explicit masks; unknown masks cannot be exported as feature masks. */
  maskRole?: 'validity' | 'foreground' | 'unknown';
  /** Optional explicit array of image file paths (overrides imagesPath inference) */
  images?: string[];
  /** Optional explicit array of mask file paths (overrides masksPath inference) */
  masks?: string[];
  /** Optional explicit array of splat `.spz`/`.ply`/`.sog` file paths; SPZ is preferred over PLY, then SOG. */
  splats?: string[];
  /** Version 2: lazily indexed companion photographs or masks. */
  mediaArchives?: ManifestMediaArchive[];
  /** Version 3: required, integrity-checked geometry extracted using bounded archive reads. */
  geometryFiles?: ManifestGeometryArchive[];
  /** Registered name -> source presentation time (v4+) or zero-based displayed frame (v5). */
  videoImages?: Record<string, ManifestVideoImage>;
}

function safeArchivePath(value: string): boolean {
  return !/[\\?#]/.test(value) && ![...value].some(character => character.charCodeAt(0) <= 31)
    && value.split('/').every(part => part !== '' && part !== '.' && part !== '..');
}

function archiveUrlMatches(value: string, extensions: readonly string[]): boolean {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && extensions.some(extension => url.pathname.toLowerCase().endsWith('.' + extension));
  } catch { return false; }
}

function safeVideoUrl(value: string): boolean {
  try {
    const url = new URL(value, 'https://manifest.invalid/');
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.hash;
  } catch { return false; }
}

/**
 * Zod schema for validating manifest files
 */
const videoSourceShape = {
  url: z.string().min(1).max(4096).refine(safeVideoUrl),
  bytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  playbackRate: z.number().finite().min(0.0625).max(120).optional(),
};
const timestampSchema = z.number().finite().min(0).max(604800);
const legacyVideoImageSchema = z.object({ ...videoSourceShape, timestamp: timestampSchema });
const videoImageSchema = z.union([
  z.object({ ...videoSourceShape, timestamp: timestampSchema, frameIndex: z.never().optional() }),
  z.object({ ...videoSourceShape, frameIndex: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), timestamp: z.never().optional() }),
]);
const videoImagesSchema = <T extends z.ZodType>(binding: T) => z.record(z.string().min(1).max(4096), binding)
  .refine(value => Object.keys(value).length > 0 && Object.keys(value).length <= 100000).optional();

const manifestShape = {
  name: z.string().optional(),
  baseUrl: z.string().url(),
  viewerStatePath: z.string().min(1).max(4096).optional(),
  files: z.object({
    cameras: z.string().min(1),
    images: z.string().min(1),
    points3D: z.string().min(1).optional(),
    rigs: z.string().optional(),
    frames: z.string().optional(),
  }),
  imagesPath: z.string().optional(),
  masksPath: z.string().optional(),
  skipImages: z.boolean().optional(),
  imageNameToPath: z.record(z.string(), z.string()).optional(),
  maskNameToPath: z.record(z.string(), z.string().min(1)).optional(),
  maskRole: z.enum(['validity', 'foreground', 'unknown']).optional(),
  images: z.array(z.string()).optional(),
  masks: z.array(z.string()).optional(),
  splats: z.array(z.string().min(1)).optional(),
  mediaArchives: z.array(z.object({
    url: z.string().url().refine(value => archiveUrlMatches(value, ['zip', 'tar'])),
    bytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    indexBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
    mountPath: z.string().min(1).refine(safeArchivePath),
    stripPrefix: z.string().refine(value => value === '' || safeArchivePath(value.replace(/\/$/, ''))).optional(),
    role: z.enum(['images', 'masks']).optional(),
  }).refine(value => value.indexBytes === undefined || archiveUrlMatches(value.url, ['tar'])
    && value.indexBytes % 512 === 0 && value.indexBytes <= value.bytes,
  { message: 'A TAR index prefix must end on a complete 512-byte block within the original archive.' })).min(1).max(8).optional(),
  geometryFiles: z.array(z.object({
    url: z.string().url().refine(value => /^https?:\/\//i.test(value)),
    bytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    format: z.enum(['zip', 'tar.zst']),
    role: z.enum(['points3D', 'splat']),
    member: z.object({
      path: z.string().min(1).max(4096).refine(safeArchivePath),
      bytes: z.number().int().positive().max(MAX_GEOMETRY_MEMBER_BYTES),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    }),
    prefix: z.object({
      bytes: z.number().int().min(18).max(MAX_GEOMETRY_PREFIX_BYTES),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    }).optional(),
  }).refine(value => archiveUrlMatches(value.url, [value.format])
    && (value.role === 'points3D' ? /\.ply$/i.test(value.member.path) : /\.(ply|spz|sog)$/i.test(value.member.path))
    && (value.format === 'zip' ? value.prefix === undefined : value.prefix !== undefined && value.prefix.bytes <= value.bytes),
  { message: 'Geometry needs the declared archive format, member type and bounded optional prefix.' })).min(1).max(2).optional(),
};
export const ColmapManifestSchema = z.discriminatedUnion('version', [
  z.object({ ...manifestShape, version: z.literal([1, 2, 3, 4]), videoImages: videoImagesSchema(legacyVideoImageSchema) }),
  z.object({ ...manifestShape, version: z.literal(5), videoImages: videoImagesSchema(videoImageSchema) }),
]).refine(value => value.version >= 4 ? value.videoImages !== undefined && !value.skipImages
  : value.videoImages === undefined && (value.version === 1 ? value.mediaArchives === undefined && value.geometryFiles === undefined
    : value.version === 2 ? value.mediaArchives !== undefined && value.geometryFiles === undefined : value.geometryFiles !== undefined),
{ message: 'Media archives require version 2; archived geometry requires version 3; video frames require version 4 or 5 with images enabled.' })
  .refine(value => !value.geometryFiles || new Set(value.geometryFiles.map(file => file.role)).size === value.geometryFiles.length
    && !(value.files.points3D && value.geometryFiles.some(file => file.role === 'points3D'))
    && !(value.splats?.length && value.geometryFiles.some(file => file.role === 'splat')),
  { message: 'Select one source for points and one for splats.' });

/**
 * Progress state for URL loading
 */
export interface UrlLoadProgress {
  /** Current progress percentage (0-100) */
  percent: number;
  /** Description of current operation */
  message: string;
  /** Current file being downloaded (if any) */
  currentFile?: string;
  /** Number of files downloaded */
  filesDownloaded?: number;
  /** Total number of files to download */
  totalFiles?: number;
  /** Bytes loaded for the current large file operation, if available */
  bytesLoaded?: number;
  /** Total bytes for the current large file operation, if available */
  bytesTotal?: number;
  /** Renderer that currently owns splat loading, if a renderer has taken over. */
  splatRenderer?: 'spark' | 'webgpu';
}

/**
 * Error types for URL loading
 */
export type UrlLoadErrorType =
  | 'auth'         // Storage connection or file access is required
  | 'network'      // Network error (fetch failed)
  | 'cors'         // CORS error
  | 'not_found'    // 404 error
  | 'invalid_manifest' // Manifest validation failed
  | 'timeout'      // Request timeout
  | 'unknown';     // Unknown error

export interface UrlLoadError {
  type: UrlLoadErrorType;
  message: string;
  details?: string;
  failedFile?: string;
  access?: StorageAccessRequest;
}

export type StorageAccessRequest =
  | { provider: 'bucket'; bucketUrl: string }
  | { provider: 'hf' | 'google' };

/**
 * Supported cloud storage providers
 */
export type CloudProvider = 's3' | 'gcs' | 'r2' | 'dropbox';
