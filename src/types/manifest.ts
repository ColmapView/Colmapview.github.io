import { z } from 'zod';

/**
 * COLMAP manifest file format for loading reconstructions from URLs.
 * Used for loading datasets from Hugging Face and other web sources.
 */
export interface ManifestMediaArchive {
  /** Pinned HTTP(S) ZIP or plain TAR; its actual range size must match bytes. */
  url: string;
  bytes: number;
  /** Scene-owned logical directory in which to expose members. */
  mountPath: string;
  /** Remove this exact member-directory prefix, without flattening subfolders. */
  stripPrefix?: string;
  role?: 'images' | 'masks';
}

export interface ColmapManifest {
  /** Version 1 for loose media; version 2 also supports companion archives. */
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
}

function safeArchivePath(value: string): boolean {
  return !/[\\?#]/.test(value) && ![...value].some(character => character.charCodeAt(0) <= 31)
    && value.split('/').every(part => part !== '' && part !== '.' && part !== '..');
}

/**
 * Zod schema for validating manifest files
 */
export const ColmapManifestSchema = z.object({
  version: z.number().int().min(1).max(2),
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
    url: z.string().url().refine(value => /^https?:\/\//i.test(value)
      && /\.(zip|tar)$/i.test(new URL(value).pathname)),
    bytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    mountPath: z.string().min(1).refine(safeArchivePath),
    stripPrefix: z.string().refine(value => value === '' || safeArchivePath(value.replace(/\/$/, ''))).optional(),
    role: z.enum(['images', 'masks']).optional(),
  })).min(1).max(8).optional(),
}).refine(value => value.version === 1 ? value.mediaArchives === undefined : value.mediaArchives !== undefined,
  { message: 'Companion media archives require manifest version 2.' });

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
