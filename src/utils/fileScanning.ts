import { appLogger } from './logger';
import { awaitWithAbort } from './awaitWithAbort';

const DIRECTORY_ENTRY_BATCH_SIZE = 50;

function isFileSystemFileEntry(entry: FileSystemEntry): entry is FileSystemFileEntry {
  return entry.isFile;
}

function isFileSystemDirectoryEntry(entry: FileSystemEntry): entry is FileSystemDirectoryEntry {
  return entry.isDirectory;
}

function isFileSystemFileHandle(entry: FileSystemHandle): entry is FileSystemFileHandle {
  return entry.kind === 'file';
}

function isFileSystemDirectoryHandle(entry: FileSystemHandle): entry is FileSystemDirectoryHandle {
  return entry.kind === 'directory';
}

/**
 * Recursively scan drag/drop FileSystemEntry trees from webkitGetAsEntry().
 */
export async function scanEntry(
  entry: FileSystemEntry,
  path: string,
  files: Map<string, File>,
  signal?: AbortSignal
): Promise<void> {
  signal?.throwIfAborted();
  const fullPath = path ? `${path}/${entry.name}` : entry.name;

  try {
    if (isFileSystemFileEntry(entry)) {
      const file = await awaitWithAbort(new Promise<File>((resolve, reject) => {
        entry.file(resolve, reject);
      }), signal);
      signal?.throwIfAborted();
      files.set(fullPath, file);
    } else if (isFileSystemDirectoryEntry(entry)) {
      const dirReader = entry.createReader();

      let allEntries: FileSystemEntry[] = [];
      let entries: FileSystemEntry[];

      do {
        entries = await awaitWithAbort(new Promise<FileSystemEntry[]>((resolve, reject) => {
          dirReader.readEntries(resolve, reject);
        }), signal);
        signal?.throwIfAborted();
        allEntries = allEntries.concat(entries);
      } while (entries.length > 0);

      for (let i = 0; i < allEntries.length; i += DIRECTORY_ENTRY_BATCH_SIZE) {
        const batch = allEntries.slice(i, i + DIRECTORY_ENTRY_BATCH_SIZE);
        signal?.throwIfAborted();
        await Promise.all(batch.map((childEntry) => scanEntry(childEntry, fullPath, files, signal)));
      }
    }
  } catch (err) {
    if (signal?.aborted) throw err;
    appLogger.warn(`Failed to scan entry: ${fullPath}`, err);
  }
}

/**
 * Recursively scan File System Access API directory handles from showDirectoryPicker().
 */
export async function scanDirectoryHandle(
  dirHandle: FileSystemDirectoryHandle,
  path: string,
  files: Map<string, File>,
  signal?: AbortSignal
): Promise<void> {
  signal?.throwIfAborted();
  try {
    for await (const entry of dirHandle.values()) {
      signal?.throwIfAborted();
      const fullPath = path ? `${path}/${entry.name}` : entry.name;
      if (isFileSystemFileHandle(entry)) {
        const file = await awaitWithAbort(entry.getFile(), signal);
        signal?.throwIfAborted();
        files.set(fullPath, file);
      } else if (isFileSystemDirectoryHandle(entry)) {
        await scanDirectoryHandle(entry, fullPath, files, signal);
      }
    }
  } catch (err) {
    if (signal?.aborted) throw err;
    appLogger.warn(`Failed to scan directory: ${path}`, err);
  }
}
