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

/** Valid until the iterator advances/returns; its generator owns decoder resources. */
export interface PlaybackFrame {
  timestamp: number;
  duration: number;
  width: number;
  height: number;
  draw(context: CanvasRenderingContext2D): void;
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
