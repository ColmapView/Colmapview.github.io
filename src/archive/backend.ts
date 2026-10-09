import type { ArchiveMetadata } from './protocol';

export interface ArchiveBackend {
  list(signal: AbortSignal): Promise<ArchiveMetadata[]>;
  extract(path: string, signal: AbortSignal): Promise<File>;
  close(): Promise<void>;
}
