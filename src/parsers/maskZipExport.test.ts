import { afterEach, describe, expect, it, vi } from 'vitest';
import { unzipSync } from 'fflate';
import {
  buildReadableBinaryFile,
  readBlobAsArrayBuffer,
} from '../test/builders';
import {
  exportMasksZip,
  normalizeMaskPath,
} from './maskZipExport';

const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function makeMockFile(data: Uint8Array, name: string, type = 'image/png'): File {
  return buildReadableBinaryFile({ contents: data, name, type });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('normalizeMaskPath', () => {
  it('normalizes image and Windows paths to COLMAP mask ZIP paths', () => {
    expect(normalizeMaskPath('photo.jpg')).toBe('masks/photo.jpg.png');
    expect(normalizeMaskPath('images/cam1/photo.jpg')).toBe('masks/cam1/photo.jpg.png');
    expect(normalizeMaskPath('images\\cam1\\photo.jpg')).toBe('masks/cam1/photo.jpg.png');
  });
});

describe('exportMasksZip', () => {
  it('stores raw mask bytes without re-encoding', async () => {
    const fetchMask = vi.fn().mockResolvedValue(makeMockFile(pngBytes, 'mask.png'));

    const blob = await exportMasksZip(['images/photo.jpg'], fetchMask);
    const entries = unzipSync(new Uint8Array(await readBlobAsArrayBuffer(blob)));

    expect(entries['masks/photo.jpg.png']).toEqual(pngBytes);
  });

  it('reports skipped masks and still returns a valid ZIP', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const onProgress = vi.fn();
    const fetchMask = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeMockFile(pngBytes, 'mask.png'));

    const blob = await exportMasksZip(['missing.jpg', 'present.jpg'], fetchMask, onProgress);
    const entries = unzipSync(new Uint8Array(await readBlobAsArrayBuffer(blob)));

    expect(Object.keys(entries)).toEqual(['masks/present.jpg.png']);
    expect(onProgress).toHaveBeenCalledWith(50, 'Skipped: missing.jpg');
    expect(onProgress).toHaveBeenLastCalledWith(100);
    expect(warn).toHaveBeenCalledWith('[Mask Export] 1/2 masks failed to export');
  });
});
