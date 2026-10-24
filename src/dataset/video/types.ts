import type { DatasetAccessOptions } from '../types';
import type { ManifestVideoImage } from '../../types/manifest';

/** Each cached source and prepared playback copy stays within this file budget. */
export const MAX_CACHED_VIDEO_BYTES = 256 * 1024 * 1024;

export interface CameraVideoProgress { phase: 'download' | 'prepare'; percent: number }

export type VideoImageBinding = ManifestVideoImage & {
  width: number;
  height: number;
};
export type ResolvedVideoImageBinding = Omit<VideoImageBinding, 'frameIndex' | 'timestamp'> & { timestamp: number };

/** Stable, read-only binding; a disposed scene also cancels an open player. */
export type CameraVideoSource = Readonly<VideoImageBinding> & {
  readonly signal: AbortSignal;
  readonly resolveFrame?: (signal: AbortSignal) => Promise<ResolvedVideoImageBinding>;
};

export interface VideoFrameMedia {
  readonly size: number;
  readonly exclusive: boolean;
  has(name: string): boolean;
  getSource(name: string): CameraVideoSource | undefined;
  getImage(name: string, options?: DatasetAccessOptions): Promise<File | null>;
  getImageSync(name: string): File | undefined;
  getStats(): { count: number; sizeBytes: number };
  clear(): void;
  dispose(): void;
}
