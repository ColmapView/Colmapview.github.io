import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildReadableBinaryFile } from '../test/builders';
import * as downloads from '../utils/download';
import { convertToJpeg, downloadImagesZip } from './imageZipExport';
import { downloadMasksZip } from './maskZipExport';
import { compressZip } from './zipCompression';

vi.mock('./zipCompression', () => ({ compressZip: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('media export cancellation', () => {
  it.each(['images', 'masks'] as const)('cancels a pending %s fetch without progressing, warning, or downloading', async kind => {
    const controller = new AbortController();
    let finish!: (file: File) => void;
    const fetchFile = vi.fn(() => new Promise<File>(resolve => { finish = resolve; }));
    const progress = vi.fn();
    const download = vi.spyOn(downloads, 'downloadBlob');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pending = kind === 'images'
      ? downloadImagesZip(['a.jpg', 'b.jpg'], fetchFile, { jpegQuality: 1 }, progress, controller.signal)
      : downloadMasksZip(['a.jpg', 'b.jpg'], fetchFile, progress, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchFile).toHaveBeenCalledWith('a.jpg', controller.signal);
    controller.abort();
    await rejected;
    finish(buildReadableBinaryFile({ name: 'late.jpg', contents: new Uint8Array([1]) }));
    await Promise.resolve();
    expect(fetchFile).toHaveBeenCalledOnce();
    expect(progress).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(compressZip).not.toHaveBeenCalled();
  });

  it('closes a bitmap that finishes decoding after cancellation', async () => {
    let finish!: (bitmap: ImageBitmap) => void;
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise<ImageBitmap>(resolve => { finish = resolve; })));
    const controller = new AbortController();
    const pending = convertToJpeg(new File([], 'a.jpg'), 1, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    finish({ width: 1, height: 1, close } as unknown as ImageBitmap);
    await Promise.resolve();
    expect(close).toHaveBeenCalledOnce();
  });

  it('closes the bitmap and settles while native JPEG encoding is still pending', async () => {
    const close = vi.fn();
    const encode = vi.fn(() => new Promise<Blob>(() => {}));
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 1, height: 1, close }));
    vi.stubGlobal('OffscreenCanvas', class {
      getContext() { return { drawImage() {} }; }
      convertToBlob = encode;
    });
    const controller = new AbortController();
    const pending = convertToJpeg(new File([], 'a.jpg'), 1, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(encode).toHaveBeenCalledOnce());
    controller.abort();
    await rejected;
    expect(close).toHaveBeenCalledOnce();
  });

  it('does not download a ZIP when cancellation races with compression completion', async () => {
    const controller = new AbortController();
    const file = buildReadableBinaryFile({ name: 'mask.png', contents: new Uint8Array([1]) });
    const download = vi.spyOn(downloads, 'downloadBlob');
    vi.mocked(compressZip).mockImplementationOnce(async () => {
      controller.abort();
      return new Blob([]);
    });
    await expect(downloadMasksZip(['a.jpg'], async () => file, undefined, controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(download).not.toHaveBeenCalled();
  });
});
