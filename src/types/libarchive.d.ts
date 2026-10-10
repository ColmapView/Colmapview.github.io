/** Worker-backed archive contracts shared by dataset loading and test fakes. */
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
  extractPreview(options: ArchiveExtractOptions): Promise<File>;
}

export interface ArchiveFileEntry {
  file: ArchiveEntry;
  path: string;
}

export interface ArchiveReader {
  getFilesArray(): Promise<ArchiveFileEntry[]>;
  close(): Promise<void>;
}
