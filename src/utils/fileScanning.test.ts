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
});
