import { z } from 'zod';

/**
 * COLMAP manifest file format for loading reconstructions from URLs.
 * Used for loading datasets from Hugging Face and other web sources.
 */
export interface ColmapManifest {
  /** Manifest version (currently 1) */
  version: number;
  /** Optional name for the reconstruction */
  name?: string;
  /** Base URL prefix for all relative file paths */
  baseUrl: string;
  /** COLMAP binary/text file paths relative to baseUrl */
  files: {
    cameras: string;
    images: string;
    points3D: string;
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
  /** Optional explicit array of image file paths (overrides imagesPath inference) */
  images?: string[];
  /** Optional explicit array of mask file paths (overrides masksPath inference) */
  masks?: string[];
}

/**
 * Zod schema for validating manifest files
 */
export const ColmapManifestSchema = z.object({
  version: z.number().int().min(1).max(1),
  name: z.string().optional(),
  baseUrl: z.string().url(),
  files: z.object({
    cameras: z.string().min(1),
    images: z.string().min(1),
    points3D: z.string().min(1),
    rigs: z.string().optional(),
    frames: z.string().optional(),
  }),
  imagesPath: z.string().optional(),
  masksPath: z.string().optional(),
  skipImages: z.boolean().optional(),
  images: z.array(z.string()).optional(),
  masks: z.array(z.string()).optional(),
});

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
}

/**
 * Error types for URL loading
 */
export type UrlLoadErrorType =
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
}
