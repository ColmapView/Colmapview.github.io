import type { CacheDimensionBounds } from '../utils/imageFileCachePolicy';

export interface ArchiveMetadata {
  path: string;
  size: number;
  lastModified: number;
}

export type ArchiveSource = File | { kind: 'remote'; name: string; size: number };
export type ArchiveOperation =
  | { kind: 'open'; source: ArchiveSource; wasmUrl: string; temporaryName: string; diskBacked?: boolean }
  | { kind: 'extract'; path: string; bounds?: CacheDimensionBounds };

export type ArchiveRequest =
  | { kind: 'request'; id: number; operation: ArchiveOperation }
  | { kind: 'cancel'; id: number }
  | { kind: 'bytes'; id: number; bytes?: ArrayBuffer; error?: string; errorName?: string };

export type ArchiveResponse =
  | { kind: 'ready' }
  | { kind: 'result'; id: number; entries?: ArchiveMetadata[]; file?: File; error?: string; errorName?: string }
  | { kind: 'read'; id: number; offset: number; length: number };

export const ARCHIVE_INITIALIZATION_TIMEOUT_MS = 30_000;
export const ARCHIVE_ENTRY_SIZE_LIMIT = 2 * 1024 * 1024 * 1024;
export const ARCHIVE_INDEX_SIZE_LIMIT = 64 * 1024 * 1024;
export const ARCHIVE_ENTRY_COUNT_LIMIT = 1_000_000;
export const REMOTE_ARCHIVE_RANGE_THRESHOLD = 32 * 1024 * 1024;

export const isIndexedArchive = (name: string) => /\.(zip|tar)$/i.test(name);

export function archiveError(message: string, name = 'Error'): Error {
  return Object.assign(new Error(message), { name });
}
