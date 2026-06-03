import { afterEach, describe, expect, it, vi } from 'vitest';
import { unzipSync } from 'fflate';
import {
  buildAnchorElement,
  buildReadableBinaryBlob,
  buildReadableBinaryFile,
  buildSetTimeoutImplementation,
  readBlobAsArrayBuffer,
} from '../test/builders';
import { __resetDownloadSchedulerForTests } from '../utils/download';
import {
  downloadImagesZip,
  exportImagesZip,
  isJpegFile,
  normalizeImageZipPath,
  toJpegZipPath,
} from './imageZipExport';

const jpegBytes = new Uint8Array([255, 216, 255, 224, 1, 2, 3, 255, 217]);

function makeMockFile(data: Uint8Array, name: string, type = 'image/png'): File {
  return buildReadableBinaryFile({ contents: data, name, type });
}

function makeMockBlob(data: Uint8Array, type = 'image/jpeg'): Blob {
  return buildReadableBinaryBlob({ contents: data, type });
}

function installImageConversionMocks() {
  const convertOptions: Array<{ type?: string; quality?: number }> = [];
  const close = vi.fn();
  const drawImage = vi.fn();
  const createImageBitmap = vi.fn().mockResolvedValue({
    width: 4,
    height: 3,
    close,
  });

  class MockOffscreenCanvas {
    constructor(
      readonly width: number,
      readonly height: number
    ) {}

    getContext() {
      return { drawImage };
    }

    async convertToBlob(options: ImageEncodeOptions): Promise<Blob> {
      convertOptions.push({ type: options.type, quality: options.quality });
      return makeMockBlob(jpegBytes);
    }
  }

  vi.stubGlobal('createImageBitmap', createImageBitmap);
  vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);

  return {
    close,
    convertOptions,
    createImageBitmap,
    drawImage,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('image ZIP path helpers', () => {
  it('normalizes image paths and converts extensions to JPEG paths', () => {
    expect(normalizeImageZipPath('cam1\\photo.png')).toBe('images/cam1/photo.png');
    expect(normalizeImageZipPath('images/cam1/photo.png')).toBe('images/cam1/photo.png');
    expect(toJpegZipPath('cam1\\photo.png')).toBe('images/cam1/photo.jpg');
    expect(toJpegZipPath('images/cam1/photo.jpeg')).toBe('images/cam1/photo.jpg');
  });
});

describe('isJpegFile', () => {
  it('detects JPEG files by MIME type or extension', () => {
    expect(isJpegFile(makeMockFile(jpegBytes, 'photo.bin', 'image/jpeg'))).toBe(true);
    expect(isJpegFile(makeMockFile(jpegBytes, 'photo.JPG', ''))).toBe(true);
    expect(isJpegFile(makeMockFile(jpegBytes, 'photo.png', 'image/png'))).toBe(false);
  });
});

describe('exportImagesZip', () => {
  it('converts fetched images to JPEG entries under images/', async () => {
    const mocks = installImageConversionMocks();
    const file = makeMockFile(new Uint8Array([1, 2, 3]), 'photo.png', 'image/png');
    const fetchImage = vi.fn().mockResolvedValue(file);

    const blob = await exportImagesZip(['cam1\\photo.png'], fetchImage, { jpegQuality: 0.72 });
    const entries = unzipSync(new Uint8Array(await readBlobAsArrayBuffer(blob)));

    expect(Object.keys(entries)).toEqual(['images/cam1/photo.jpg']);
    expect(entries['images/cam1/photo.jpg']).toEqual(jpegBytes);
    expect(mocks.createImageBitmap).toHaveBeenCalledWith(file);
    expect(mocks.drawImage).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.convertOptions).toEqual([{ type: 'image/jpeg', quality: 0.72 }]);
  });

  it('caps JPEG source quality at 0.85', async () => {
    const mocks = installImageConversionMocks();
    const fetchImage = vi.fn().mockResolvedValue(makeMockFile(jpegBytes, 'photo.jpg', 'image/jpeg'));

    await exportImagesZip(['images/photo.jpg'], fetchImage, { jpegQuality: 1 });

    expect(mocks.convertOptions).toEqual([{ type: 'image/jpeg', quality: 0.85 }]);
  });

  it('reports skipped images and still returns a valid ZIP', async () => {
    installImageConversionMocks();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const onProgress = vi.fn();
    const fetchImage = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeMockFile(new Uint8Array([4, 5, 6]), 'ok.png'));

    const blob = await exportImagesZip(['missing.png', 'ok.png'], fetchImage, { jpegQuality: 0.8 }, onProgress);
    const entries = unzipSync(new Uint8Array(await readBlobAsArrayBuffer(blob)));

    expect(Object.keys(entries)).toEqual(['images/ok.jpg']);
    expect(onProgress).toHaveBeenCalledWith(50, 'Skipped: missing.png');
    expect(onProgress).toHaveBeenLastCalledWith(100);
    expect(warn).toHaveBeenCalledWith('[Image Export] 1/2 images failed to export');
  });
});

describe('downloadImagesZip', () => {
  it('triggers a download with filename images.zip', async () => {
    __resetDownloadSchedulerForTests();
    installImageConversionMocks();
    const fetchImage = vi.fn().mockResolvedValue(makeMockFile(new Uint8Array([7, 8, 9]), 'photo.png'));

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
      await downloadImagesZip(['photo.png'], fetchImage, { jpegQuality: 0.8 });

      expect(createElementSpy).toHaveBeenCalledWith('a');
      expect(clickSpy).toHaveBeenCalledOnce();
      expect(anchor.download).toBe('images.zip');
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
