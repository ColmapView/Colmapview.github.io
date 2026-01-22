/**
 * Type declarations for libarchive.js
 */

declare module 'libarchive.js' {
  export interface ArchiveEntry {
    name: string;
    size: number;
    lastModified: number;
    extract(): Promise<File>;
  }

  export interface ArchiveFileEntry {
    file: ArchiveEntry;
    path: string;
  }

  export interface ArchiveFilesObject {
    [key: string]: ArchiveEntry | ArchiveFilesObject;
  }

  export interface ArchiveReader {
    getFilesArray(): Promise<ArchiveFileEntry[]>;
    getFilesObject(): Promise<ArchiveFilesObject>;
    extractFiles(callback?: (entry: ArchiveFileEntry) => void): Promise<ArchiveFilesObject>;
    extractSingleFile(path: string): Promise<File>;
    close(): Promise<void>;
  }

  export interface ArchiveOptions {
    workerUrl?: string | URL;
    getWorker?: () => Worker;
    createClient?: (worker: Worker) => unknown;
  }

  export class Archive {
    static init(options?: ArchiveOptions | null): ArchiveOptions;
    static open(file: File): Promise<ArchiveReader>;
  }
}

// Export types for local imports
export interface ArchiveEntry {
  name: string;
  size: number;
  lastModified: number;
  extract(): Promise<File>;
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
