import { describe, it, expect, vi } from 'vitest';
import { exportMasksZip, downloadMasksZip } from './writers';
import { unzipSync } from 'fflate';

/**
 * jsdom's Blob/File don't implement arrayBuffer(). Use FileReader as a polyfill.
 */
async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Create a File with a working arrayBuffer() method for jsdom.
 */
function makeMockFile(data: Uint8Array, name: string, type = 'image/png'): File {
  const file = new File([data], name, { type });
  // Polyfill arrayBuffer for jsdom
  file.arrayBuffer = () => blobToArrayBuffer(file);
  return file;
}

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

    const zipData = new Uint8Array(await blobToArrayBuffer(blob));
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

    const zipData = new Uint8Array(await blobToArrayBuffer(blob));
    const entries = unzipSync(zipData);

    expect(Object.keys(entries)).toEqual(['masks/cam1/photo.jpg.png']);
  });

  it('handles backslash paths', async () => {
    const fetchMask = vi.fn().mockResolvedValue(makeMockFile(pngBytes, 'mask.png'));

    const blob = await exportMasksZip(
      ['images\\cam1\\photo.jpg'],
      fetchMask,
    );

    const zipData = new Uint8Array(await blobToArrayBuffer(blob));
    const entries = unzipSync(zipData);

    expect(Object.keys(entries)).toEqual(['masks/cam1/photo.jpg.png']);
  });

  it('preserves raw file bytes (no re-encoding)', async () => {
    const customBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const fetchMask = vi.fn().mockResolvedValue(makeMockFile(customBytes, 'mask.png'));

    const blob = await exportMasksZip(['photo.jpg'], fetchMask);

    const zipData = new Uint8Array(await blobToArrayBuffer(blob));
    const entries = unzipSync(zipData);
    const stored = entries['masks/photo.jpg.png'];

    expect(stored).toEqual(customBytes);
  });

  it('skips images with no mask (null return)', async () => {
    const fetchMask = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeMockFile(pngBytes, 'mask.png'));

    const blob = await exportMasksZip(
      ['no-mask.jpg', 'has-mask.jpg'],
      fetchMask,
    );

    const zipData = new Uint8Array(await blobToArrayBuffer(blob));
    const entries = unzipSync(zipData);

    expect(Object.keys(entries)).toEqual(['masks/has-mask.jpg.png']);
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
  });

  it('handles fetch errors gracefully', async () => {
    const fetchMask = vi.fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(makeMockFile(pngBytes, 'm.png'));

    const blob = await exportMasksZip(
      ['bad.jpg', 'good.jpg'],
      fetchMask,
    );

    const zipData = new Uint8Array(await blobToArrayBuffer(blob));
    const entries = unzipSync(zipData);

    expect(Object.keys(entries)).toEqual(['masks/good.jpg.png']);
  });

  it('produces valid ZIP with zero entries when all masks missing', async () => {
    const fetchMask = vi.fn().mockResolvedValue(null);

    const blob = await exportMasksZip(['a.jpg'], fetchMask);

    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('application/zip');
    const zipData = new Uint8Array(await blobToArrayBuffer(blob));
    const entries = unzipSync(zipData);
    expect(Object.keys(entries)).toEqual([]);
  });
});

describe('downloadMasksZip', () => {
  it('triggers a download with filename masks.zip', async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const fetchMask = vi.fn().mockResolvedValue(makeMockFile(pngBytes, 'mask.png'));

    // Mock DOM download mechanism
    let capturedDownload = '';
    const clickSpy = vi.fn();
    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue({
      set href(_: string) {},
      set download(v: string) { capturedDownload = v; },
      get download() { return capturedDownload; },
      click: clickSpy,
    } as unknown as HTMLAnchorElement);
    const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    await downloadMasksZip(['img.jpg'], fetchMask);

    expect(createElementSpy).toHaveBeenCalledWith('a');
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(capturedDownload).toBe('masks.zip');
    expect(revokeObjectURLSpy).toHaveBeenCalledOnce();

    createElementSpy.mockRestore();
    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });
});
