import { afterEach, describe, expect, it, vi } from 'vitest';
import { unzipSync } from 'fflate';
import {
  buildAnchorElement,
  buildReadableBinaryFile,
  buildSetTimeoutImplementation,
  readBlobAsArrayBuffer,
} from '../test/builders';
import { __resetDownloadSchedulerForTests } from '../utils/download';
import * as downloads from '../utils/download';
import { compressZip } from './zipCompression';
import {
  downloadReconstructionZipFromWriters,
  exportReconstructionZipFromWriters,
  normalizeReconstructionZipImagePath,
  normalizeZipCompressionLevel,
  type ReconstructionZipFileWriters,
} from './reconstructionZipExport';

vi.mock('./zipCompression', async () => {
  const { zipSync } = await import('fflate');
  const { createZipBlob, normalizeZipCompressionLevel } = await import('./zipExportPolicy');
  return { compressZip: vi.fn(async (files, options) => createZipBlob(zipSync(files, { level: normalizeZipCompressionLevel(options?.level) }))) };
});

const encoder = new TextEncoder();

function makeMockFile(data: Uint8Array, name: string, type = 'image/jpeg'): File {
  return buildReadableBinaryFile({ contents: data, name, type });
}

function makeWriters(overrides: Partial<ReconstructionZipFileWriters> = {}): ReconstructionZipFileWriters {
  return {
    writeCameras: vi.fn(() => encoder.encode('cameras')),
    writeImages: vi.fn(() => encoder.encode('images')),
    writePoints3D: vi.fn(() => encoder.encode('points3D')),
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('reconstruction ZIP helpers', () => {
  it('normalizes image paths and compression levels', () => {
    expect(normalizeReconstructionZipImagePath('cam1\\photo.jpg')).toBe('images/cam1/photo.jpg');
    expect(normalizeReconstructionZipImagePath('images/cam1/photo.jpg')).toBe('images/cam1/photo.jpg');
    expect(normalizeZipCompressionLevel()).toBe(6);
    expect(normalizeZipCompressionLevel(Number.NaN)).toBe(6);
    expect(normalizeZipCompressionLevel(-3)).toBe(0);
    expect(normalizeZipCompressionLevel(12)).toBe(9);
    expect(normalizeZipCompressionLevel(4.8)).toBe(4);
  });
});

describe('exportReconstructionZipFromWriters', () => {
  it('hands owned copies to compression and preserves the requested compression level', async () => {
    const source = new Uint8Array([9, 1, 2, 3, 9]);
    const signal = new AbortController().signal;
    const blob = await exportReconstructionZipFromWriters(
      makeWriters({ writePoints3D: () => source.subarray(1, 4) }),
      { format: 'binary', compressionLevel: 0, signal },
    );
    const [files, options] = vi.mocked(compressZip).mock.calls[0];
    expect(options).toEqual({ level: 0, signal });
    expect(files['sparse/0/points3D.bin'].buffer).not.toBe(source.buffer);
    expect(source).toEqual(new Uint8Array([9, 1, 2, 3, 9]));
    expect(unzipSync(new Uint8Array(await readBlobAsArrayBuffer(blob)))['sparse/0/points3D.bin']).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('settles cancellation while reading an image and ignores its late bytes', async () => {
    let finish!: (buffer: ArrayBuffer) => void;
    const file = makeMockFile(new Uint8Array([1]), 'photo.jpg');
    vi.spyOn(file, 'arrayBuffer').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const controller = new AbortController();
    const onProgress = vi.fn();
    const download = vi.spyOn(downloads, 'downloadBlob');
    const pending = downloadReconstructionZipFromWriters(
      makeWriters(), { format: 'binary', includeImages: true, signal: controller.signal },
      new Map([['photo.jpg', file]]), onProgress,
    );
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    finish(new ArrayBuffer(1));
    await Promise.resolve();
    expect(compressZip).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalledWith(100, 'Done');
    expect(download).not.toHaveBeenCalled();
  });

  it('prevents downloading when cancellation races with completed compression', async () => {
    const controller = new AbortController();
    const download = vi.spyOn(downloads, 'downloadBlob');
    vi.mocked(compressZip).mockImplementationOnce(async () => { controller.abort(); return new Blob([]); });
    await expect(downloadReconstructionZipFromWriters(makeWriters(), { format: 'binary', signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(download).not.toHaveBeenCalled();
  });

  it('writes text sparse entries and reports major progress steps', async () => {
    const onProgress = vi.fn();

    const blob = await exportReconstructionZipFromWriters(
      makeWriters(),
      { format: 'text' },
      null,
      onProgress
    );
    const entries = unzipSync(new Uint8Array(await readBlobAsArrayBuffer(blob)));

    expect(Object.keys(entries)).toEqual([
      'sparse/0/cameras.txt',
      'sparse/0/images.txt',
      'sparse/0/points3D.txt',
    ]);
    expect(new TextDecoder().decode(entries['sparse/0/cameras.txt'])).toBe('cameras');
    expect(onProgress.mock.calls).toEqual([
      [5, 'Exporting cameras...'],
      [10, 'Exporting images...'],
      [15, 'Exporting points3D...'],
      [20, 'Exporting rig data...'],
      [85, 'Compressing...'],
      [100, 'Done'],
    ]);
  });

  it('writes binary sparse entries with optional rig and frame files', async () => {
    const blob = await exportReconstructionZipFromWriters(
      makeWriters({
        writeRigs: vi.fn(() => new Uint8Array([1, 2, 3])),
        writeFrames: vi.fn(() => new Uint8Array([4, 5, 6])),
      }),
      { format: 'binary' }
    );
    const entries = unzipSync(new Uint8Array(await readBlobAsArrayBuffer(blob)));

    expect(Object.keys(entries)).toEqual([
      'sparse/0/cameras.bin',
      'sparse/0/images.bin',
      'sparse/0/points3D.bin',
      'sparse/0/rigs.bin',
      'sparse/0/frames.bin',
    ]);
    expect(entries['sparse/0/rigs.bin']).toEqual(new Uint8Array([1, 2, 3]));
    expect(entries['sparse/0/frames.bin']).toEqual(new Uint8Array([4, 5, 6]));
  });

  it('includes image files once, prefers real paths over lookup aliases, and normalizes Windows paths', async () => {
    const imageA = makeMockFile(new Uint8Array([10, 11]), 'photo-a.jpg');
    const imageB = makeMockFile(new Uint8Array([20, 21]), 'photo-b.jpg');
    const imageC = makeMockFile(new Uint8Array([30, 31]), 'photo-c.jpg');
    const imageFiles = new Map<string, File>([
      ['lookup-photo-a', imageA],
      ['cam1\\photo-a.jpg', imageA],
      ['photo-b.jpg', imageB],
      ['alias-photo-c', imageC],
    ]);
    const onProgress = vi.fn();

    const blob = await exportReconstructionZipFromWriters(
      makeWriters(),
      { format: 'text', includeImages: true },
      imageFiles,
      onProgress
    );
    const entries = unzipSync(new Uint8Array(await readBlobAsArrayBuffer(blob)));

    expect(entries['images/cam1/photo-a.jpg']).toEqual(new Uint8Array([10, 11]));
    expect(entries['images/photo-b.jpg']).toEqual(new Uint8Array([20, 21]));
    expect(entries['images/alias-photo-c']).toBeUndefined();
    expect(onProgress).toHaveBeenCalledWith(25, 'Adding images...');
  });
});

describe('downloadReconstructionZipFromWriters', () => {
  it('triggers a download with the requested filename', async () => {
    __resetDownloadSchedulerForTests();

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
      await downloadReconstructionZipFromWriters(
        makeWriters(),
        { format: 'text' },
        null,
        undefined,
        'custom-reconstruction.zip'
      );

      expect(createElementSpy).toHaveBeenCalledWith('a');
      expect(clickSpy).toHaveBeenCalledOnce();
      expect(anchor.download).toBe('custom-reconstruction.zip');
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
