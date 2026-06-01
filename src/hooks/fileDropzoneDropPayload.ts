import { appLogger } from '../utils/logger';

export interface FileDropPayload {
  singleFile: File | null;
  entries: FileSystemEntry[];
  fallbackFiles: File[];
}

type ScanDropEntry = (
  entry: FileSystemEntry,
  path: string,
  files: Map<string, File>
) => Promise<void>;

export function isFileDrop(dataTransfer: DataTransfer | null | undefined): dataTransfer is DataTransfer {
  return dataTransfer?.types.includes('Files') ?? false;
}

export function collectFileDropPayload(dataTransfer: DataTransfer): FileDropPayload {
  const fallbackFiles: File[] = [];
  for (let i = 0; i < dataTransfer.files.length; i++) {
    fallbackFiles.push(dataTransfer.files[i]);
  }

  const entries: FileSystemEntry[] = [];
  for (let i = 0; i < dataTransfer.items.length; i++) {
    const item = dataTransfer.items[i];
    if (item.kind !== 'file') {
      continue;
    }

    const entry = item.webkitGetAsEntry();
    if (entry) {
      entries.push(entry);
    }
  }

  return {
    singleFile: fallbackFiles.length === 1 ? fallbackFiles[0] : null,
    entries,
    fallbackFiles,
  };
}

export async function collectDroppedFiles(
  { entries, fallbackFiles }: Pick<FileDropPayload, 'entries' | 'fallbackFiles'>,
  scanEntry: ScanDropEntry,
  log: (message: string) => void = appLogger.info
): Promise<Map<string, File>> {
  const files = new Map<string, File>();

  log(`[Drop] Scanning ${entries.length} entries...`);
  for (const entry of entries) {
    await scanEntry(entry, '', files);
  }

  if (files.size === 0 && fallbackFiles.length > 0) {
    log(`[Drop] Fallback: using ${fallbackFiles.length} files from dataTransfer.files`);
    for (const file of fallbackFiles) {
      files.set(file.name, file);
    }
  }

  log(`[Drop] Found ${files.size} files`);
  return files;
}
