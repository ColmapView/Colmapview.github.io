import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { createArchiveImagePreview } from './imagePreview';
import { jpegExifHeader, jpegHeader, pngHeader, webpHeader } from '../test/imageHeaders';

let bitmap: { width: number; height: number; close: ReturnType<typeof vi.fn> };
const encode = vi.fn(), draw = vi.fn(), pixels = vi.fn();
beforeEach(() => {
  vi.stubGlobal('Blob', NodeBlob); vi.stubGlobal('File', NodeFile);
  bitmap = { width: 1600, height: 800, close: vi.fn() };
  vi.stubGlobal('createImageBitmap', vi.fn(async (_file: Blob, options?: ImageBitmapOptions) => {
    if (options?.resizeWidth) { bitmap.height = Math.round(bitmap.height * options.resizeWidth / bitmap.width); bitmap.width = options.resizeWidth; }
    return bitmap;
  }));
  vi.stubGlobal('OffscreenCanvas', class {
    getContext() { return { drawImage: draw, getImageData: pixels }; }
    convertToBlob = encode;
  });
  pixels.mockReturnValue({ data: new Uint8ClampedArray([10, 20, 30, 255]) });
  encode.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
const bounds = { maxWidth: 800, maxHeight: 800 };
describe('worker image previews', () => {
  it('resizes opaque images and encodes JPEG at the shared quality setting', async () => {
    const original = new File([pngHeader(1600, 800)], 'photo.png', { type: 'image/png', lastModified: 123 });
    const preview = await createArchiveImagePreview(original, bounds);
    expect(preview).toMatchObject({ name: 'photo.jpg', type: 'image/jpeg', lastModified: 123 });
    expect(draw).toHaveBeenCalledWith(bitmap, 0, 0, 800, 400);
    expect(createImageBitmap).toHaveBeenCalledWith(original, { resizeWidth: 800, resizeQuality: 'high' });
    expect(encode).toHaveBeenCalledWith({ type: 'image/jpeg', quality: 0.75 });
    expect(bitmap.close).toHaveBeenCalledOnce(); expect(original.size).toBe(pngHeader(1600, 800).length);
  });
  it('reuses suitable JPEGs without recompression', async () => {
    bitmap.width = 640; bitmap.height = 480;
    const file = new File([jpegHeader(640, 480)], 'photo.jpg', { type: 'image/jpeg' });
    expect(await createArchiveImagePreview(file, bounds)).toBe(file);
    expect(encode).not.toHaveBeenCalled(); expect(createImageBitmap).not.toHaveBeenCalled();
  });
  it('preserves alpha with lossless PNG and avoids an encoding larger than an unchanged original', async () => {
    pixels.mockReturnValue({ data: new Uint8ClampedArray([10, 20, 30, 0]) });
    encode.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
    const file = new File([webpHeader('VP8X', 1600, 800)], 'photo.webp', { type: 'image/webp' });
    expect(await createArchiveImagePreview(file, bounds)).toMatchObject({ type: 'image/png', name: 'photo.png' });
    expect(encode).toHaveBeenCalledWith({ type: 'image/png', quality: 0.75 });
    bitmap.width = 100; bitmap.height = 100;
    encode.mockResolvedValue(new Blob(['larger-than-source'.repeat(10)], { type: 'image/png' }));
    const small = new File([webpHeader('VP8X', 100, 100)], 'photo.webp', { type: 'image/webp' });
    expect(await createArchiveImagePreview(small, bounds)).toBe(small);
  });
  it('releases the decoded bitmap and falls back to the original on encoding failure', async () => {
    encode.mockRejectedValue(new Error('encoder unavailable'));
    const file = new File([pngHeader(1600, 800)], 'photo.png', { type: 'image/png' });
    expect(await createArchiveImagePreview(file, bounds)).toBe(file);
    expect(bitmap.close).toHaveBeenCalledOnce();
    vi.stubGlobal('OffscreenCanvas', undefined);
    expect(await createArchiveImagePreview(file, bounds)).toBe(file);
  });
  it('rejects oversized or unreadable image dimensions before the browser decodes any pixels', async () => {
    const huge = new File([pngHeader(30_000, 20_000)], 'huge.png', { type: 'image/png' });
    await expect(createArchiveImagePreview(huge, bounds)).rejects.toThrow('64 megapixels');
    const unknown = new File(['unknown bytes'], 'unknown.png', { type: 'image/png' });
    await expect(createArchiveImagePreview(unknown, bounds)).rejects.toThrow('dimensions');
    expect(createImageBitmap).not.toHaveBeenCalled(); expect(encode).not.toHaveBeenCalled();
  });
  it('requests a bounded portrait bitmap without changing its aspect ratio', async () => {
    bitmap.width = 800; bitmap.height = 1600;
    const portrait = new File([pngHeader(800, 1600)], 'portrait.png', { type: 'image/png' });
    await createArchiveImagePreview(portrait, { maxWidth: 800, maxHeight: 600 });
    expect(createImageBitmap).toHaveBeenCalledWith(portrait, { resizeWidth: 300, resizeQuality: 'high' });
    expect(draw).toHaveBeenCalledWith(bitmap, 0, 0, 300, 600);
  });
  it('keeps Exif-rotated JPEG proportions when requesting a resized decode', async () => {
    bitmap.width = 800; bitmap.height = 1600;
    const file = new File([jpegExifHeader(1600, 800, 6)], 'rotated.jpg', { type: 'image/jpeg' });
    await createArchiveImagePreview(file, { maxWidth: 800, maxHeight: 600 });
    expect(createImageBitmap).toHaveBeenCalledWith(file, { resizeWidth: 300, resizeQuality: 'high' });
    expect(draw).toHaveBeenCalledWith(bitmap, 0, 0, 300, 600);
  });
  it('fits the decoder aspect ratio when browser orientation differs from optional metadata', async () => {
    bitmap.width = 800; bitmap.height = 1600;
    const file = new File([webpHeader('VP8X', 1600, 800)], 'oriented.webp', { type: 'image/webp' });
    await createArchiveImagePreview(file, { maxWidth: 800, maxHeight: 600 });
    expect(draw).toHaveBeenCalledWith(bitmap, 0, 0, 300, 600);
  });
  it('avoids a resized decode that could upscale an extreme aspect ratio beyond the bitmap budget', async () => {
    bitmap.width = 32_000; bitmap.height = 1;
    const file = new File([pngHeader(32_000, 1)], 'panorama.png', { type: 'image/png' });
    await createArchiveImagePreview(file, bounds);
    expect(createImageBitmap).toHaveBeenCalledWith(file, {});
    expect(draw).toHaveBeenCalledWith(bitmap, 0, 0, 800, 1);
  });
  it('rejects an unexpectedly oversized bitmap instead of bypassing the guard through the original fallback', async () => {
    bitmap.width = 30_000; bitmap.height = 20_000;
    vi.mocked(createImageBitmap).mockResolvedValueOnce(bitmap as unknown as ImageBitmap);
    const file = new File([pngHeader(1600, 800)], 'photo.png', { type: 'image/png' });
    await expect(createArchiveImagePreview(file, bounds)).rejects.toThrow('limit');
    expect(bitmap.close).toHaveBeenCalledOnce(); expect(encode).not.toHaveBeenCalled();
  });
});
