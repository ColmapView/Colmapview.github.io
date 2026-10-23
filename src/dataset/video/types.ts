import type { DatasetAccessOptions } from '../types';

export interface VideoImageBinding {
  url: string;
  bytes: number;
  timestamp: number;
  width: number;
  height: number;
}

/** Stable, read-only binding; a disposed scene also cancels an open player. */
export interface CameraVideoSource extends Readonly<VideoImageBinding> {
  readonly signal: AbortSignal;
}

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
