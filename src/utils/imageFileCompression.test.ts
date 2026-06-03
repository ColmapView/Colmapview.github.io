import { describe, expect, it, vi } from 'vitest';
import { buildImageBitmap } from '../test/builders';
import {
  compressAndResizeToJpeg,
  type ImageCompressionCanvas,
} from './imageFileCompression';

describe('image file compression', () => {
  it('resizes images to cache bounds and returns JPEG files', async () => {
    const sourceBlob = new Blob(['source'], { type: 'image/png' });
    const jpegBlob = new Blob(['jpeg'], { type: 'image/jpeg' });
    const bitmap = buildImageBitmap({ width: 4000, height: 2000, close: vi.fn() });
    const drawImage = vi.fn();
    const toBlob = vi.fn().mockResolvedValue(jpegBlob);
    const createCanvas = vi.fn((_width: number, _height: number): ImageCompressionCanvas => ({
      drawImage,
      toBlob,
    }));

    const file = await compressAndResizeToJpeg(sourceBlob, 'cam/photo.png', {
      decode: vi.fn().mockResolvedValue(bitmap),
      createCanvas,
      getBounds: () => ({ maxWidth: 1000, maxHeight: 1000 }),
    });

    expect(createCanvas).toHaveBeenCalledWith(1000, 500);
    expect(drawImage).toHaveBeenCalledWith(bitmap, 1000, 500);
    expect(toBlob).toHaveBeenCalledWith('image/jpeg', 0.75);
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(file.name).toBe('cam/photo.jpg');
    expect(file.type).toBe('image/jpeg');
    expect(file.size).toBe(jpegBlob.size);
  });

  it('returns the original blob when no drawing context is available', async () => {
    const sourceBlob = new Blob(['source'], { type: 'image/png' });
    const bitmap = buildImageBitmap({ width: 100, height: 100, close: vi.fn() });

    const file = await compressAndResizeToJpeg(sourceBlob, 'photo.png', {
      decode: vi.fn().mockResolvedValue(bitmap),
      createCanvas: () => null,
      getBounds: () => ({ maxWidth: 1000, maxHeight: 1000 }),
    });

    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(file.name).toBe('photo.png');
    expect(file.type).toBe('image/png');
    expect(file.size).toBe(sourceBlob.size);
  });

  it('falls back to the original blob when compression fails', async () => {
    const sourceBlob = new Blob(['source'], { type: 'image/webp' });
    const warn = vi.fn();

    const file = await compressAndResizeToJpeg(sourceBlob, 'photo.webp', {
      decode: vi.fn().mockRejectedValue(new Error('decode failed')),
      warn,
    });

    expect(warn).toHaveBeenCalledWith(
      '[URL Image] Compression failed, using original:',
      expect.any(Error)
    );
    expect(file.name).toBe('photo.webp');
    expect(file.type).toBe('image/webp');
    expect(file.size).toBe(sourceBlob.size);
  });
});
