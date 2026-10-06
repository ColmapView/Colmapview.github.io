import { describe, expect, it, vi } from 'vitest';
import {
  buildFile,
  buildFileSystemDirectoryEntry,
  buildFileSystemDirectoryHandle,
  buildFileSystemFileEntry,
  buildFileSystemFileHandle,
} from '../test/builders';
import { scanDirectoryHandle, scanEntry } from './fileScanning';

describe('file scanning helpers', () => {
  it('scans drag/drop entry trees across repeated readEntries batches', async () => {
    const rootFile = buildFile('root.jpg');
    const nestedFile = buildFile('nested.jpg');
    const root = buildFileSystemDirectoryEntry({
      name: 'dataset',
      entryBatches: [
        [buildFileSystemFileEntry({ name: 'root.jpg', file: rootFile })],
        [
          buildFileSystemDirectoryEntry({
            name: 'images',
            entryBatches: [[buildFileSystemFileEntry({ name: 'nested.jpg', file: nestedFile })], []],
          }),
        ],
        [],
      ],
    });
    const files = new Map<string, File>();

    await scanEntry(root, '', files);

    expect(files).toEqual(new Map([
      ['dataset/root.jpg', rootFile],
      ['dataset/images/nested.jpg', nestedFile],
    ]));
  });

  it('logs entry scan errors without rejecting the whole scan', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const files = new Map<string, File>();

    try {
      await scanEntry(buildFileSystemFileEntry({ name: 'broken.jpg', error: new Error('denied') }), '', files);

      expect(files.size).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(
        'Failed to scan entry: broken.jpg',
        expect.any(DOMException)
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('scans File System Access directory handles recursively', async () => {
    const rootFile = buildFile('root.png');
    const nestedFile = buildFile('nested.png');
    const root = buildFileSystemDirectoryHandle({
      name: 'root',
      entries: [
        buildFileSystemFileHandle({
          name: 'root.png',
          file: rootFile,
          getFile: vi.fn().mockResolvedValue(rootFile),
        }),
        buildFileSystemDirectoryHandle({
          name: 'subdir',
          entries: [
            buildFileSystemFileHandle({
              name: 'nested.png',
              file: nestedFile,
              getFile: vi.fn().mockResolvedValue(nestedFile),
            }),
          ],
        }),
      ],
    });
    const files = new Map<string, File>();

    await scanDirectoryHandle(root, '', files);

    expect(files).toEqual(new Map([
      ['root.png', rootFile],
      ['subdir/nested.png', nestedFile],
    ]));
  });

  it('rejects a cancelled drag/drop scan without adding a late file', async () => {
    const controller = new AbortController();
    const entry = buildFileSystemFileEntry({ name: 'late.jpg' });
    let resolve!: FileCallback;
    vi.spyOn(entry, 'file').mockImplementation(done => { resolve = done; });
    const files = new Map<string, File>();
    const pending = scanEntry(entry, '', files, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    resolve(buildFile('late.jpg'));
    await Promise.resolve();
    expect(files.size).toBe(0);
  });

  it('stops a cancelled directory-handle scan before reading additional files', async () => {
    const controller = new AbortController();
    let resolve!: (file: File) => void;
    const getFirst = vi.fn(() => new Promise<File>(done => { resolve = done; }));
    const getSecond = vi.fn(async () => buildFile('second.jpg'));
    const root = buildFileSystemDirectoryHandle({ entries: [
      buildFileSystemFileHandle({ name: 'first.jpg', getFile: getFirst }),
      buildFileSystemFileHandle({ name: 'second.jpg', getFile: getSecond }),
    ] });
    const files = new Map<string, File>();
    const pending = scanDirectoryHandle(root, '', files, controller.signal);
    await vi.waitFor(() => expect(getFirst).toHaveBeenCalledOnce());
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    resolve(buildFile('first.jpg'));
    await Promise.resolve();
    expect(getSecond).not.toHaveBeenCalled();
    expect(files.size).toBe(0);
  });
});
