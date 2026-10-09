/**
 * The libarchive.js reader surface the app uses. The package ships its own types, but its
 * ArchiveReader is a class with private fields, so callers and test fakes rely on these instead.
 */
import type { CacheDimensionBounds } from '../utils/imageFileCachePolicy';
import type { MediaPriority } from '../dataset/types';

export interface ArchiveExtractOptions {
  signal?: AbortSignal;
  priority?: MediaPriority;
  getPriority?: () => MediaPriority;
  bounds?: CacheDimensionBounds;
}

export interface ArchiveEntry {
  name: string;
  size: number;
  lastModified: number;
  extract(options?: ArchiveExtractOptions): Promise<File>;
  extractPreview?(options: ArchiveExtractOptions): Promise<File>;
}

export interface ArchiveFileEntry {
  file: ArchiveEntry;
  path: string;
}

export interface ArchiveReader {
  getFilesArray(): Promise<ArchiveFileEntry[]>;
  getFilesObject(): Promise<{ [key: string]: ArchiveEntry | object }>;
  extractFiles(callback?: (entry: ArchiveFileEntry) => void): Promise<{ [key: string]: ArchiveEntry | object }>;
  extractSingleFile(path: string): Promise<File>;
  close(): Promise<void>;
}
