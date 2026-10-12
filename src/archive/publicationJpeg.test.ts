import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jpegExifHeader, pngHeader } from '../test/imageHeaders';
import { encodePublicationJpeg } from './publicationJpeg';

const draw = vi.fn(), fill = vi.fn(), transform = vi.fn(), encode = vi.fn();
let bitmap: { width: number; height: number; close: ReturnType<typeof vi.fn> };
let canvases: Array<{ width: number; height: number }>;
beforeEach(() => {
  vi.stubGlobal('Blob', NodeBlob); vi.stubGlobal('File', NodeFile);
  bitmap = { width: 800, height: 600, close: vi.fn() }; canvases = [];
  vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
  vi.stubGlobal('OffscreenCanvas', class {
    width: number; height: number;
    constructor(width: number, height: number) { this.width = width; this.height = height; canvases.push(this); }
    getContext() { return { drawImage: draw, fillRect: fill, setTransform: transform, fillStyle: '' }; }
    convertToBlob = encode;
  });
  encode.mockResolvedValue(new Blob(['encoded jpeg'], { type: 'image/jpeg' }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
const signal = () => new AbortController().signal;
const original = () => new Blob([pngHeader(800, 600)], { type: 'image/png' });

describe('full-resolution publication JPEGs', () => {
  it('encodes at the requested quality, flattens alpha on white, and releases full-size pixel buffers', async () => {
    const blob = original();
    encode.mockImplementationOnce(async options => {
      expect(canvases[0]).toMatchObject({ width: 800, height: 600 });
      expect(options).toEqual({ type: 'image/jpeg', quality: 0.85 });
      return new Blob(['jpeg'], { type: 'image/jpeg' });
    });
    expect(await encodePublicationJpeg(blob, 0.85, signal())).toMatchObject({ name: 'image.jpg', type: 'image/jpeg' });
    expect(createImageBitmap).toHaveBeenCalledWith(expect.any(Blob), { imageOrientation: 'from-image' });
    const decodedInput = vi.mocked(createImageBitmap).mock.calls[0][0] as Blob;
    expect(new Uint8Array(await decodedInput.arrayBuffer())).toEqual(new Uint8Array(await blob.arrayBuffer()));
    expect(decodedInput).not.toBe(blob);
    expect(fill).toHaveBeenCalledWith(0, 0, 800, 600);
    expect(draw).toHaveBeenCalledWith(bitmap, 0, 0);
    expect(bitmap.close).toHaveBeenCalledOnce(); expect(canvases[0]).toMatchObject({ width: 0, height: 0 });
    expect(blob.size).toBe(pngHeader(800, 600).length);
  });
  it.each([
    { orientation: 1, matrix: undefined }, { orientation: 2, matrix: [-1, 0, 0, 1, 800, 0] },
    { orientation: 3, matrix: [-1, 0, 0, -1, 800, 600] }, { orientation: 4, matrix: [1, 0, 0, -1, 0, 600] },
    { orientation: 5, matrix: [0, 1, 1, 0, 0, 0] }, { orientation: 6, matrix: [0, -1, 1, 0, 0, 600] },
    { orientation: 7, matrix: [0, -1, -1, 0, 800, 600] }, { orientation: 8, matrix: [0, 1, -1, 0, 800, 0] },
  ])('undoes Exif orientation $orientation without changing the model dimensions', async ({ orientation, matrix }) => {
    bitmap.width = orientation >= 5 ? 600 : 800; bitmap.height = orientation >= 5 ? 800 : 600;
    const blob = new Blob([jpegExifHeader(800, 600, orientation)], { type: 'image/jpeg' });
    await encodePublicationJpeg(blob, 0.85, signal());
    if (matrix) expect(transform).toHaveBeenCalledWith(...matrix); else expect(transform).not.toHaveBeenCalled();
    expect(draw).toHaveBeenCalledWith(bitmap, 0, 0); expect(bitmap.close).toHaveBeenCalledOnce();
  });
  it('rejects unknown or oversized rasters before allocating decoded pixels', async () => {
    await expect(encodePublicationJpeg(new Blob(['not an image']), 0.85, signal())).rejects.toThrow('Original images');
    await expect(encodePublicationJpeg(new Blob([pngHeader(30_000, 20_000)]), 0.85, signal())).rejects.toThrow('64 megapixels');
    expect(createImageBitmap).not.toHaveBeenCalled(); expect(canvases).toHaveLength(0);
  });
  it('refuses an unbounded image byte buffer before reading it', async () => {
    const blob = original(); Object.defineProperty(blob, 'size', { value: 128 * 1024 * 1024 + 1 });
    const read = vi.spyOn(blob, 'arrayBuffer');
    await expect(encodePublicationJpeg(blob, 0.85, signal())).rejects.toThrow('128 MiB');
    expect(read).not.toHaveBeenCalled(); expect(createImageBitmap).not.toHaveBeenCalled();
  });
  it('fails on an unexpected decoded size and releases the bitmap', async () => {
    bitmap.width = 799;
    await expect(encodePublicationJpeg(original(), 0.85, signal())).rejects.toThrow('dimensions');
    expect(bitmap.close).toHaveBeenCalledOnce(); expect(canvases).toHaveLength(0);
  });
  it.each(['decode', 'encode'] as const)('cancels during %s and releases any pixels', async stage => {
    const controller = new AbortController();
    if (stage === 'decode') vi.mocked(createImageBitmap).mockImplementationOnce(async () => { controller.abort(); return bitmap as ImageBitmap; });
    else encode.mockImplementationOnce(async () => { controller.abort(); return new Blob(['jpeg'], { type: 'image/jpeg' }); });
    await expect(encodePublicationJpeg(original(), 0.85, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(bitmap.close).toHaveBeenCalledOnce();
    canvases.forEach(canvas => expect(canvas).toMatchObject({ width: 0, height: 0 }));
  });
  it('refuses a PNG fallback and tells unsupported browsers to choose originals', async () => {
    encode.mockResolvedValueOnce(new Blob(['png'], { type: 'image/png' }));
    await expect(encodePublicationJpeg(original(), 0.85, signal())).rejects.toThrow('did not produce a JPEG');
    vi.stubGlobal('OffscreenCanvas', undefined);
    await expect(encodePublicationJpeg(original(), 0.85, signal())).rejects.toThrow('Original images');
  });
});
