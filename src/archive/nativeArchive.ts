import type { ArchiveBackend } from './backend';
import { archiveFileType } from './byteSource';
import { ARCHIVE_ENTRY_COUNT_LIMIT, ARCHIVE_ENTRY_SIZE_LIMIT, type ArchiveMetadata } from './protocol';

export interface NativeWasmModule {
  HEAPU8: Uint8Array<ArrayBuffer>;
  initFunctions(): void;
  runCode: {
    openArchive(ptr: number, size: number, password: string | null, locale: string): number;
    getNextEntry(archive: number): number;
    getEntryType(entry: number): number;
    getEntryName(entry: number): string;
    getEntrySize(entry: number): number;
    getEntryLastModified(entry: number): number;
    skipEntry(archive: number): void;
    getFileData(archive: number, size: number): number;
    getError(archive: number): string;
    closeArchive(archive: number): void;
    malloc(size: number): number;
    free(ptr: number): void;
  };
}

/** Compatibility codecs run in the same session worker; each scan closes its native handle. */
export class NativeArchiveBackend implements ArchiveBackend {
  private wasm: NativeWasmModule;
  private ptr: number;
  private size: number;
  private constructor(wasm: NativeWasmModule, ptr: number, size: number) { this.wasm = wasm; this.ptr = ptr; this.size = size; }

  static async open(file: File, wasmUrl: string): Promise<NativeArchiveBackend> {
    if (file.size >= ARCHIVE_ENTRY_SIZE_LIMIT) throw new Error('This archive format requires the compatibility decoder and must be smaller than 2 GiB.');
    const [{ default: createLibarchive }, { WasmModule }] = await Promise.all([
      import('libarchive.js/src/webworker/wasm-gen/libarchive.js'), import('libarchive.js/src/webworker/wasm-module.js'),
    ]);
    const options = new WasmModule();
    options.locateFile = () => wasmUrl;
    const wasm = await createLibarchive(options);
    wasm.initFunctions();
    const data = new Uint8Array(await file.arrayBuffer());
    const ptr = wasm.runCode.malloc(data.length);
    if (!ptr) throw new Error('There is not enough memory to open this archive.');
    try { wasm.HEAPU8.set(data, ptr); }
    catch (error) { wasm.runCode.free(ptr); throw error; }
    return new NativeArchiveBackend(wasm, ptr, file.size);
  }

  private scan(signal: AbortSignal, target?: string): ArchiveMetadata[] | File {
    const code = this.wasm.runCode;
    const archive = code.openArchive(this.ptr, this.size, null, 'en_US.UTF-8');
    if (!archive) throw new Error('Could not open the archive.');
    const entries: ArchiveMetadata[] = [];
    const paths = new Set<string>();
    try {
      for (;;) {
        signal.throwIfAborted();
        const entry = code.getNextEntry(archive);
        if (!entry) break;
        const path = code.getEntryName(entry), size = code.getEntrySize(entry);
        if (!Number.isSafeInteger(size) || size < 0) throw new Error('Archive entry has an invalid size.');
        if (code.getEntryType(entry) === 32768) {
          if (paths.has(path)) throw new Error(`Archive contains duplicate file path: ${path}`);
          paths.add(path);
          if (target === path) {
            if (size >= ARCHIVE_ENTRY_SIZE_LIMIT) throw new Error('An archive entry exceeds the compatibility decoder memory limit.');
            const ptr = code.getFileData(archive, size);
            if (ptr < 0 || !ptr && size > 0) throw new Error(code.getError(archive) || 'Archive extraction failed.');
            try { return new File([this.wasm.HEAPU8.slice(ptr, ptr + size)], path.split('/').pop() ?? path, { type: archiveFileType(path) }); }
            finally { if (ptr) code.free(ptr); }
          }
          entries.push({ path, size, lastModified: code.getEntryLastModified(entry) / 1_000_000 });
          if (entries.length > ARCHIVE_ENTRY_COUNT_LIMIT) throw new Error('Archive file index is too large.');
        }
        code.skipEntry(archive);
      }
      if (target) throw new Error('Archive entry is unavailable.');
      return entries;
    } finally { code.closeArchive(archive); }
  }

  async list(signal: AbortSignal): Promise<ArchiveMetadata[]> { return this.scan(signal) as ArchiveMetadata[]; }
  async extract(path: string, signal: AbortSignal): Promise<File> { return this.scan(signal, path) as File; }
  async close(): Promise<void> { if (this.ptr) this.wasm.runCode.free(this.ptr); this.ptr = 0; }
}
