import { afterEach, describe, expect, it, vi } from 'vitest';
import { unzipSync } from 'fflate';
import * as downloads from '../utils/download';
import {
  buildReadableBinaryFile,
  readBlobAsArrayBuffer,
} from '../test/builders';
import {
  downloadMasksZip,
  exportMasksZip,
  normalizeMaskPath,
} from './maskZipExport';

vi.mock('./zipCompression', async () => {
  const { zipSync } = await import('fflate');
  const { createZipBlob, normalizeZipCompressionLevel } = await import('./zipExportPolicy');
  return { compressZip: vi.fn(async (data, options) => createZipBlob(zipSync(data, { level: normalizeZipCompressionLevel(options?.level) }))) };
});

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
  it('propagates progress callback errors without counting them as failed masks', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = new Error('progress consumer failed');
    const fetchMask = vi.fn().mockResolvedValue(null);
    const onProgress = vi.fn(() => { throw error; });

    await expect(exportMasksZip(['missing.jpg', 'next.jpg'], fetchMask, onProgress)).rejects.toBe(error);

    expect(fetchMask).toHaveBeenCalledExactlyOnceWith('missing.jpg', undefined);
    expect(onProgress).toHaveBeenCalledExactlyOnceWith(50, 'Skipped: missing.jpg');
    expect(warn).not.toHaveBeenCalled();
  });

  it('rejects colliding normalized mask paths before fetching files', async () => {
    const fetchMask = vi.fn().mockResolvedValue(makeMockFile(pngBytes, 'mask.png'));

    await expect(exportMasksZip(['photo.jpg', 'images/photo.jpg'], fetchMask))
      .rejects.toThrow('Multiple files would be exported as "masks/photo.jpg.png".');

    expect(fetchMask).not.toHaveBeenCalled();
  });

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

describe('downloadMasksZip', () => {
  it('continues after a mask read fails and keeps progress and counts accurate', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => undefined);
    const unreadableFile = makeMockFile(pngBytes, 'bad.png');
    vi.spyOn(unreadableFile, 'arrayBuffer').mockRejectedValue(new Error('file read failed'));
    const fetchMask = vi.fn()
      .mockResolvedValueOnce(unreadableFile)
      .mockResolvedValueOnce(makeMockFile(pngBytes, 'ok.png'));
    const onProgress = vi.fn();

    const summary = await downloadMasksZip(['bad.jpg', 'ok.jpg'], fetchMask, onProgress);

    expect(summary).toEqual({ total: 2, exported: 1, failed: 1 });
    expect(onProgress.mock.calls).toEqual([[50], [100]]);
    const [blob] = download.mock.calls[0];
    expect(Object.keys(unzipSync(new Uint8Array(await readBlobAsArrayBuffer(blob)))))
      .toEqual(['masks/ok.jpg.png']);
  });

  it('returns accurate counts and downloads the masks that succeeded', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => undefined);
    const fetchMask = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeMockFile(pngBytes, 'mask.png'))
      .mockRejectedValueOnce(new Error('network failed'));

    const summary = await downloadMasksZip(['missing.jpg', 'ok.jpg', 'bad.jpg'], fetchMask);

    expect(summary).toEqual({ total: 3, exported: 1, failed: 2 });
    expect(download).toHaveBeenCalledOnce();
    const [blob, filename] = download.mock.calls[0];
    expect(filename).toBe('masks.zip');
    expect(Object.keys(unzipSync(new Uint8Array(await readBlobAsArrayBuffer(blob)))))
      .toEqual(['masks/ok.jpg.png']);
  });

  it('does not download an empty ZIP when no masks could be exported', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => undefined);

    const summary = await downloadMasksZip(['missing.jpg'], async () => null);

    expect(summary).toEqual({ total: 1, exported: 0, failed: 1 });
    expect(download).not.toHaveBeenCalled();
  });
});
