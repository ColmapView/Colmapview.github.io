import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createArchiveImagePreview } from './imagePreview';

let bitmap: { width: number; height: number; close: ReturnType<typeof vi.fn> };
const encode = vi.fn(), draw = vi.fn(), pixels = vi.fn();
beforeEach(() => {
  bitmap = { width: 1600, height: 800, close: vi.fn() };
  vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
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
    const original = new File(['original bytes'], 'photo.png', { type: 'image/png', lastModified: 123 });
    const preview = await createArchiveImagePreview(original, bounds);
    expect(preview).toMatchObject({ name: 'photo.jpg', type: 'image/jpeg', lastModified: 123 });
    expect(draw).toHaveBeenCalledWith(bitmap, 0, 0, 800, 400);
    expect(encode).toHaveBeenCalledWith({ type: 'image/jpeg', quality: 0.75 });
    expect(bitmap.close).toHaveBeenCalledOnce(); expect(original.size).toBe(14);
  });
  it('reuses suitable JPEGs without recompression', async () => {
    bitmap.width = 640; bitmap.height = 480;
    const file = new File(['jpeg'], 'photo.jpg', { type: 'image/jpeg' });
    expect(await createArchiveImagePreview(file, bounds)).toBe(file);
    expect(encode).not.toHaveBeenCalled(); expect(bitmap.close).toHaveBeenCalledOnce();
  });
  it('preserves alpha with lossless PNG and avoids an encoding larger than an unchanged original', async () => {
    pixels.mockReturnValue({ data: new Uint8ClampedArray([10, 20, 30, 0]) });
    encode.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
    const file = new File(['original'], 'photo.webp', { type: 'image/webp' });
    expect(await createArchiveImagePreview(file, bounds)).toMatchObject({ type: 'image/png', name: 'photo.png' });
    expect(encode).toHaveBeenCalledWith({ type: 'image/png', quality: 0.75 });
    bitmap.width = 100; bitmap.height = 100;
    encode.mockResolvedValue(new Blob(['larger-than-source'], { type: 'image/png' }));
    expect(await createArchiveImagePreview(file, bounds)).toBe(file);
  });
  it('releases the decoded bitmap and falls back to the original on encoding failure', async () => {
    encode.mockRejectedValue(new Error('encoder unavailable'));
    const file = new File(['original'], 'photo.png', { type: 'image/png' });
    expect(await createArchiveImagePreview(file, bounds)).toBe(file);
    expect(bitmap.close).toHaveBeenCalledOnce();
    vi.stubGlobal('OffscreenCanvas', undefined);
    expect(await createArchiveImagePreview(file, bounds)).toBe(file);
  });
});
