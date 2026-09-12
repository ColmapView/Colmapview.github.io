import { describe, expect, it, vi } from 'vitest';
import { buildImageBitmap, buildReadableBinaryFile, readBlobAsArrayBuffer } from '../test/builders';
import { createSolidTrainingMask, encodeTrainingJpeg, normalizeTrainingMask, TRAINING_JPEG_QUALITY } from './trainingImageEncoding';
import type { RasterEncodingCanvas } from '../utils/imageRasterEncoding';

function encoder(blob: Blob, bitmap = buildImageBitmap({ width: 4032, height: 3024, close: vi.fn() })) {
  const drawImage = vi.fn();
  const fill = vi.fn();
  const toBlob = vi.fn().mockResolvedValue(blob);
  const createCanvas = vi.fn((_width: number, _height: number): RasterEncodingCanvas => ({ drawImage, fill, toBlob }));
  const decode = vi.fn().mockResolvedValue(bitmap);
  return { bitmap, createCanvas, decode, drawImage, fill, toBlob };
}

describe('training image encoding', () => {
  it('fully materializes a full-resolution JPEG at quality 0.90', async () => {
    const source = buildReadableBinaryFile({ contents: new Uint8Array([1, 2, 3]), name: 'photo.png', type: 'image/png' });
    const encoded = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });
    const mocks = encoder(encoded);

    const result = await encodeTrainingJpeg(source, 'nested/photo.jpg', undefined, mocks);

    expect(mocks.decode).toHaveBeenCalledWith(source, { imageOrientation: 'none', premultiplyAlpha: 'none' });
    expect(mocks.createCanvas).toHaveBeenCalledWith(4032, 3024);
    expect(mocks.drawImage).toHaveBeenCalledWith(mocks.bitmap, 4032, 3024);
    expect(mocks.toBlob).toHaveBeenCalledWith('image/jpeg', TRAINING_JPEG_QUALITY);
    expect(mocks.bitmap.close).toHaveBeenCalledOnce();
    expect(result.name).toBe('nested/photo.jpg');
    expect(result.type).toBe('image/jpeg');
    expect(new Uint8Array(await readBlobAsArrayBuffer(result))).toEqual(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
  });

  it('fails closed when the browser substitutes another output format', async () => {
    const source = buildReadableBinaryFile({ contents: new Uint8Array([1]), name: 'photo.png', type: 'image/png' });
    const mocks = encoder(new Blob(['not jpeg'], { type: 'image/png' }));

    await expect(encodeTrainingJpeg(source, 'photo.jpg', undefined, mocks)).rejects.toThrow('did not produce');
    expect(mocks.bitmap.close).toHaveBeenCalledOnce();
  });

  it('honors cancellation before allocating a decode', async () => {
    const source = buildReadableBinaryFile({ contents: new Uint8Array([1]), name: 'photo.png', type: 'image/png' });
    const mocks = encoder(new Blob(['jpeg'], { type: 'image/jpeg' }));
    const abort = new AbortController();
    abort.abort();

    await expect(encodeTrainingJpeg(source, 'photo.jpg', abort.signal, mocks)).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.decode).not.toHaveBeenCalled();
  });

  it('retains verified PNG mask bytes without a lossy canvas round trip', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const source = buildReadableBinaryFile({ contents: png, name: 'mask.bin', type: 'application/octet-stream' });
    const mocks = encoder(new Blob(['unused'], { type: 'image/png' }));

    const result = await normalizeTrainingMask(source, 'photo.jpg.png', undefined, mocks);

    expect(mocks.decode).not.toHaveBeenCalled();
    expect(result.name).toBe('photo.jpg.png');
    expect(result.type).toBe('image/png');
    expect(new Uint8Array(await readBlobAsArrayBuffer(result))).toEqual(png);
  });

  it('normalizes non-PNG masks losslessly to PNG', async () => {
    const source = buildReadableBinaryFile({ contents: new Uint8Array([1, 2, 3]), name: 'mask.webp', type: 'image/webp' });
    const encoded = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });
    const mocks = encoder(encoded, buildImageBitmap({ width: 2, height: 3, close: vi.fn() }));

    const result = await normalizeTrainingMask(source, 'photo.jpg.png', undefined, mocks);

    expect(mocks.createCanvas).toHaveBeenCalledWith(2, 3);
    expect(mocks.toBlob).toHaveBeenCalledWith('image/png', undefined);
    expect(result.type).toBe('image/png');
  });

  it.each([[true, '#fff'], [false, '#000']] as const)('creates a full-size solid fallback mask (%s)', async (foreground, color) => {
    const encoded = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });
    const mocks = encoder(encoded);

    const result = await createSolidTrainingMask(640, 480, foreground, 'photo.jpg.png', undefined, mocks);

    expect(mocks.createCanvas).toHaveBeenCalledWith(640, 480);
    expect(mocks.fill).toHaveBeenCalledWith(color);
    expect(mocks.decode).not.toHaveBeenCalled();
    expect(result).toMatchObject({ name: 'photo.jpg.png', type: 'image/png' });
  });
});
