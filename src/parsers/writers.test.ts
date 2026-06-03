import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  __resetDownloadSchedulerForTests,
  downloadMasksZip,
  exportMasksZip,
  exportReconstructionZip,
} from './writers';
import { unzipSync } from 'fflate';
import {
  buildAnchorElement,
  buildReadableBinaryFile,
  buildPoint3D,
  buildReconstruction,
  buildSetTimeoutImplementation,
  readBlobAsArrayBuffer,
} from '../test/builders';

/**
 * Create a File with a working arrayBuffer() method for jsdom.
 */
function makeMockFile(data: Uint8Array, name: string, type = 'image/png'): File {
  return buildReadableBinaryFile({ contents: data, name, type });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('exportMasksZip', () => {
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG header

  it('creates ZIP with correct mask paths from plain image names', async () => {
    const fetchMask = vi.fn()
      .mockResolvedValueOnce(makeMockFile(pngBytes, 'photo1.jpg.png'))
      .mockResolvedValueOnce(makeMockFile(pngBytes, 'photo2.jpg.png'));

    const blob = await exportMasksZip(
      ['photo1.jpg', 'photo2.jpg'],
      fetchMask,
    );

    const zipData = new Uint8Array(await readBlobAsArrayBuffer(blob));
    const entries = unzipSync(zipData);

    expect(Object.keys(entries)).toEqual([
      'masks/photo1.jpg.png',
      'masks/photo2.jpg.png',
    ]);
  });

  it('strips images/ prefix and prepends masks/', async () => {
    const fetchMask = vi.fn().mockResolvedValue(makeMockFile(pngBytes, 'mask.png'));

    const blob = await exportMasksZip(
      ['images/cam1/photo.jpg'],
      fetchMask,
    );

    const zipData = new Uint8Array(await readBlobAsArrayBuffer(blob));
    const entries = unzipSync(zipData);

    expect(Object.keys(entries)).toEqual(['masks/cam1/photo.jpg.png']);
  });

  it('handles backslash paths', async () => {
    const fetchMask = vi.fn().mockResolvedValue(makeMockFile(pngBytes, 'mask.png'));

    const blob = await exportMasksZip(
      ['images\\cam1\\photo.jpg'],
      fetchMask,
    );

    const zipData = new Uint8Array(await readBlobAsArrayBuffer(blob));
    const entries = unzipSync(zipData);

    expect(Object.keys(entries)).toEqual(['masks/cam1/photo.jpg.png']);
  });

  it('preserves raw file bytes (no re-encoding)', async () => {
    const customBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const fetchMask = vi.fn().mockResolvedValue(makeMockFile(customBytes, 'mask.png'));

    const blob = await exportMasksZip(['photo.jpg'], fetchMask);

    const zipData = new Uint8Array(await readBlobAsArrayBuffer(blob));
    const entries = unzipSync(zipData);
    const stored = entries['masks/photo.jpg.png'];

    expect(stored).toEqual(customBytes);
  });

  it('skips images with no mask (null return)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchMask = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeMockFile(pngBytes, 'mask.png'));

    const blob = await exportMasksZip(
      ['no-mask.jpg', 'has-mask.jpg'],
      fetchMask,
    );

    const zipData = new Uint8Array(await readBlobAsArrayBuffer(blob));
    const entries = unzipSync(zipData);

    expect(Object.keys(entries)).toEqual(['masks/has-mask.jpg.png']);
    expect(warn).toHaveBeenCalledWith('[Mask Export] 1/2 masks failed to export');
  });

  it('reports progress', async () => {
    const fetchMask = vi.fn()
      .mockResolvedValueOnce(makeMockFile(pngBytes, 'm1.png'))
      .mockResolvedValueOnce(makeMockFile(pngBytes, 'm2.png'));

    const progress: number[] = [];

    await exportMasksZip(
      ['a.jpg', 'b.jpg'],
      fetchMask,
      (percent) => progress.push(percent),
    );

    expect(progress).toEqual([50, 100]);
  });

  it('reports progress for skipped masks', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchMask = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeMockFile(pngBytes, 'm.png'));

    const progress: Array<{ percent: number; message?: string }> = [];

    await exportMasksZip(
      ['skip.jpg', 'ok.jpg'],
      fetchMask,
      (percent, message) => progress.push({ percent, message }),
    );

    expect(progress[0]).toEqual({ percent: 50, message: 'Skipped: skip.jpg' });
    expect(progress[1]).toEqual({ percent: 100, message: undefined });
    expect(warn).toHaveBeenCalledWith('[Mask Export] 1/2 masks failed to export');
  });

  it('handles fetch errors gracefully', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = new Error('network error');
    const fetchMask = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(makeMockFile(pngBytes, 'm.png'));

    const blob = await exportMasksZip(
      ['bad.jpg', 'good.jpg'],
      fetchMask,
    );

    const zipData = new Uint8Array(await readBlobAsArrayBuffer(blob));
    const entries = unzipSync(zipData);

    expect(Object.keys(entries)).toEqual(['masks/good.jpg.png']);
    expect(warn).toHaveBeenCalledWith('[Mask Export] Failed to process bad.jpg:', error);
    expect(warn).toHaveBeenCalledWith('[Mask Export] 1/2 masks failed to export');
  });

  it('produces valid ZIP with zero entries when all masks missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchMask = vi.fn().mockResolvedValue(null);

    const blob = await exportMasksZip(['a.jpg'], fetchMask);

    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('application/zip');
    const zipData = new Uint8Array(await readBlobAsArrayBuffer(blob));
    const entries = unzipSync(zipData);
    expect(Object.keys(entries)).toEqual([]);
    expect(warn).toHaveBeenCalledWith('[Mask Export] 1/1 masks failed to export');
  });
});

describe('downloadMasksZip', () => {
  it('triggers a download with filename masks.zip', async () => {
    __resetDownloadSchedulerForTests();

    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const fetchMask = vi.fn().mockResolvedValue(makeMockFile(pngBytes, 'mask.png'));

    // Mock DOM download mechanism
    const clickSpy = vi.fn();
    const anchor = buildAnchorElement({ click: clickSpy });
    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(anchor);
    const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    let scheduledRevoke: TimerHandler | undefined;
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(buildSetTimeoutImplementation({
      onSchedule: (handler) => {
        scheduledRevoke = handler;
      },
    }));

    try {
      await downloadMasksZip(['img.jpg'], fetchMask);

      expect(createElementSpy).toHaveBeenCalledWith('a');
      expect(clickSpy).toHaveBeenCalledOnce();
      expect(anchor.download).toBe('masks.zip');
      expect(revokeObjectURLSpy).not.toHaveBeenCalled();

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);
      expect(typeof scheduledRevoke).toBe('function');
      if (typeof scheduledRevoke === 'function') scheduledRevoke();
      expect(revokeObjectURLSpy).toHaveBeenCalledOnce();
    } finally {
      createElementSpy.mockRestore();
      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
      revokeObjectURLSpy.mockRestore();
      setTimeoutSpy.mockRestore();
    }
  });
});

describe('exportReconstructionZip', () => {
  it('exports text COLMAP files through the writers facade', async () => {
    const reconstruction = buildReconstruction({
      points3D: [buildPoint3D()],
    });

    const blob = await exportReconstructionZip(reconstruction, { format: 'text' });
    const entries = unzipSync(new Uint8Array(await readBlobAsArrayBuffer(blob)));

    expect(Object.keys(entries)).toEqual([
      'sparse/0/cameras.txt',
      'sparse/0/images.txt',
      'sparse/0/points3D.txt',
    ]);
    expect(new TextDecoder().decode(entries['sparse/0/cameras.txt'])).toContain('PINHOLE');
    expect(new TextDecoder().decode(entries['sparse/0/images.txt'])).toContain('image.jpg');
    expect(new TextDecoder().decode(entries['sparse/0/points3D.txt'])).toContain('# Number of points: 1');
  });
});
