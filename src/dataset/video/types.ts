import type { DatasetAccessOptions } from '../types';

export interface VideoImageBinding {
  url: string;
  bytes: number;
  timestamp: number;
  width: number;
  height: number;
}

export interface VideoFrameMedia {
  readonly size: number;
  readonly exclusive: boolean;
  has(name: string): boolean;
  getImage(name: string, options?: DatasetAccessOptions): Promise<File | null>;
  getImageSync(name: string): File | undefined;
  getStats(): { count: number; sizeBytes: number };
  clear(): void;
  dispose(): void;
}
