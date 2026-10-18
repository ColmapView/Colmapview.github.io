import { awaitWithAbort } from './awaitWithAbort';

type SaveFilePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle>;

function saveFilePicker(): SaveFilePicker | undefined {
  return typeof window === 'undefined' ? undefined
    : (window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
}

export function canSaveZipToFile(): boolean {
  return typeof saveFilePicker() === 'function';
}

export class ZipFilePickerCancelledError extends Error {
  constructor() { super('Export cancelled.'); this.name = 'ZipFilePickerCancelledError'; }
}

/** Call during the export button's user activation, before any asynchronous preparation. */
export async function requestZipFile(filename: string, signal?: AbortSignal): Promise<FileSystemFileHandle> {
  signal?.throwIfAborted();
  const picker = saveFilePicker();
  if (!picker) throw new Error('Direct saving is unavailable in this browser. Use Download COLMAP.');
  try {
    return await awaitWithAbort(picker.call(window, {
      suggestedName: filename,
      types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }],
    }), signal);
  } catch (error) {
    signal?.throwIfAborted();
    // Platform DOMExceptions need not inherit this realm's Error constructor.
    if ((error as { name?: unknown } | null)?.name === 'AbortError') throw new ZipFilePickerCancelledError();
    throw error;
  }
}
