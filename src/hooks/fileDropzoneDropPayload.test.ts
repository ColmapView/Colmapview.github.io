import { describe, expect, it, vi } from 'vitest';
import {
  buildDataTransfer,
  buildDataTransferItem,
  buildFile,
  buildFileSystemEntry,
} from '../test/builders';
import {
  collectDroppedFiles,
  collectFileDropPayload,
  isFileDrop,
} from './fileDropzoneDropPayload';

function fileItem(entry: FileSystemEntry | null): DataTransferItem {
  return buildDataTransferItem({
    kind: 'file',
    webkitGetAsEntry: vi.fn(() => entry),
  });
}

function stringItem(): DataTransferItem {
  return buildDataTransferItem({
    kind: 'string',
  });
}

describe('file dropzone drop payload helpers', () => {
  it('recognizes actual file drops only', () => {
    expect(isFileDrop(null)).toBe(false);
    expect(isFileDrop(buildDataTransfer({ types: ['text/plain'] }))).toBe(false);
    expect(isFileDrop(buildDataTransfer({ types: ['Files'] }))).toBe(true);
  });

  it('collects the single file, fallback files, and file-system entries synchronously', () => {
    const archive = buildFile('scene.zip', 'zip', 'application/zip');
    const entry = buildFileSystemEntry({ name: 'dataset' });
    const payload = collectFileDropPayload(buildDataTransfer({
      files: [archive],
      items: [
        fileItem(entry),
        fileItem(null),
        stringItem(),
      ],
    }));

    expect(payload.singleFile).toBe(archive);
    expect(payload.fallbackFiles).toEqual([archive]);
    expect(payload.entries).toEqual([entry]);
  });

  it('does not mark multi-file drops as single-archive candidates', () => {
    const first = buildFile('cameras.bin');
    const second = buildFile('images.bin');
    const payload = collectFileDropPayload(buildDataTransfer({
      files: [first, second],
      items: [],
    }));

    expect(payload.singleFile).toBeNull();
    expect(payload.fallbackFiles).toEqual([first, second]);
    expect(payload.entries).toEqual([]);
  });

  it('scans dropped entries into the file map', async () => {
    const entry = buildFileSystemEntry({ name: 'dataset' });
    const scannedFile = buildFile('cameras.bin');
    const scanEntry = vi.fn(async (
      scannedEntry: FileSystemEntry,
      path: string,
      files: Map<string, File>
    ) => {
      files.set(`${scannedEntry.name}/cameras.bin`, scannedFile);
      expect(path).toBe('');
    });
    const log = vi.fn();

    const files = await collectDroppedFiles({
      entries: [entry],
      fallbackFiles: [buildFile('fallback.jpg')],
    }, scanEntry, log);

    expect(files).toEqual(new Map([['dataset/cameras.bin', scannedFile]]));
    expect(scanEntry).toHaveBeenCalledWith(entry, '', expect.any(Map));
    expect(log).toHaveBeenNthCalledWith(1, '[Drop] Scanning 1 entries...');
    expect(log).toHaveBeenNthCalledWith(2, '[Drop] Found 1 files');
  });

  it('uses fallback files when entry scanning produces no files', async () => {
    const first = buildFile('cameras.bin');
    const second = buildFile('images.bin');
    const log = vi.fn();

    const files = await collectDroppedFiles({
      entries: [],
      fallbackFiles: [first, second],
    }, vi.fn(async () => {}), log);

    expect(files).toEqual(new Map([
      ['cameras.bin', first],
      ['images.bin', second],
    ]));
    expect(log).toHaveBeenNthCalledWith(1, '[Drop] Scanning 0 entries...');
    expect(log).toHaveBeenNthCalledWith(2, '[Drop] Fallback: using 2 files from dataTransfer.files');
    expect(log).toHaveBeenNthCalledWith(3, '[Drop] Found 2 files');
  });

  it('does not overwrite scanned files with fallback files', async () => {
    const scannedFile = buildFile('images/root.jpg');
    const fallbackFile = buildFile('root.jpg');
    const scanEntry = vi.fn(async (
      _entry: FileSystemEntry,
      _path: string,
      files: Map<string, File>
    ) => {
      files.set('images/root.jpg', scannedFile);
    });

    const files = await collectDroppedFiles({
      entries: [buildFileSystemEntry({ name: 'images' })],
      fallbackFiles: [fallbackFile],
    }, scanEntry, vi.fn());

    expect(files).toEqual(new Map([['images/root.jpg', scannedFile]]));
  });
});
