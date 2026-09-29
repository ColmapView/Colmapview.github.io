import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPublicationPreview, MAX_PREVIEW_INPUT_BYTES, normalizePublicationPreview } from './publicationPreview';
import { jpegHeader, pngHeader } from '../../test/imageHeaders';

const png = (width = 4000, height = 2000) => new File([pngHeader(width, height)], 'preview.png', { type: 'image/png' });
const signal = () => new AbortController().signal;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => { vi.stubGlobal('Blob', NodeBlob); vi.stubGlobal('File', NodeFile); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('publication preview normalization', () => {
  const drawImage = vi.fn();
  const close = vi.fn();
  let encodedSize: number[];
  beforeEach(() => {
    encodedSize = [];
    drawImage.mockClear(); close.mockClear();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 4000, height: 2000, close }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback) {
      encodedSize = [this.width, this.height];
      callback(png());
    });
  });

  it('converts custom images to a bounded PNG while preserving their aspect ratio', async () => {
    const output = await normalizePublicationPreview(new Blob([jpegHeader(4000, 2000)], { type: 'image/jpeg' }), signal());
    expect(output.name).toBe('colmapview-preview.png');
    expect(output.type).toBe('image/png');
    expect(encodedSize).toEqual([1600, 800]);
    expect(close).toHaveBeenCalledOnce();
  });

  it('does not upscale small images', async () => {
    vi.mocked(createImageBitmap).mockResolvedValue({ width: 100, height: 200, close } as unknown as ImageBitmap);
    await normalizePublicationPreview(png(), signal());
    expect(encodedSize).toEqual([100, 200]);
  });

  it('rejects empty, unsupported, oversized, and corrupt images', async () => {
    await expect(normalizePublicationPreview(new Blob([], { type: 'image/png' }), signal())).rejects.toThrow('PNG');
    await expect(normalizePublicationPreview(new Blob(['<svg/>'], { type: 'image/svg+xml' }), signal())).rejects.toThrow('PNG');
    await expect(normalizePublicationPreview({ type: 'image/png', size: MAX_PREVIEW_INPUT_BYTES + 1 } as Blob, signal())).rejects.toThrow('32 MiB');
    expect(createImageBitmap).not.toHaveBeenCalled();
    vi.mocked(createImageBitmap).mockRejectedValue(new Error('decode failed'));
    await expect(normalizePublicationPreview(png(), signal())).rejects.toThrow('could not be opened');
  });

  it('releases decoded images on cancellation and encoding errors', async () => {
    const controller = new AbortController();
    vi.mocked(createImageBitmap).mockImplementation(async () => {
      controller.abort();
      return { width: 100, height: 100, close } as unknown as ImageBitmap;
    });
    await expect(normalizePublicationPreview(png(), controller.signal)).rejects.toThrow();
    expect(drawImage).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
    vi.mocked(createImageBitmap).mockResolvedValue({ width: 100, height: 100, close } as unknown as ImageBitmap);
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(callback => callback(null));
    await expect(normalizePublicationPreview(png(), signal())).rejects.toThrow('could not be created');
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('refuses a small file declaring a huge image before decoding any pixels', async () => {
    await expect(normalizePublicationPreview(png(30_000, 30_000), signal())).rejects.toThrow('64 megapixels');
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('refuses an image whose header cannot be read before decoding it', async () => {
    await expect(normalizePublicationPreview(new Blob(['not a png'], { type: 'image/png' }), signal())).rejects.toThrow('could not be opened');
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('rejects excessive decoded dimensions and releases the bitmap', async () => {
    vi.mocked(createImageBitmap).mockResolvedValue({ width: 10000, height: 10000, close } as unknown as ImageBitmap);
    await expect(normalizePublicationPreview(png(), signal())).rejects.toThrow('64 megapixels');
    expect(close).toHaveBeenCalledOnce();
  });
});

describe('publication preview lifecycle', () => {
  it('keeps a custom image when an older automatic capture completes later', async () => {
    const normalize = vi.fn(async (blob: Blob) => blob as File);
    const resource = createPublicationPreview(normalize);
    resource.syncSource('first');
    const capture = deferred<Blob>();
    const pending = resource.capture(() => capture.promise);
    const custom = png();
    await resource.replace(custom);
    capture.resolve(png());
    await pending;
    expect(resource.getSnapshot()).toMatchObject({ file: custom, kind: 'custom', busy: false });
    expect(normalize).toHaveBeenCalledOnce();
  });

  it('discards a preview being normalized when the source changes', async () => {
    const normalized = deferred<File>();
    const resource = createPublicationPreview(() => normalized.promise);
    resource.syncSource('first');
    const pending = resource.replace(png());
    await Promise.resolve();
    resource.syncSource('second');
    normalized.resolve(png());
    await pending;
    expect(resource.getSnapshot()).toMatchObject({ sourceKey: 'second', file: null, busy: false, error: null, kind: 'view' });
  });

  it('keeps the previous preview with an explicit error when a replacement fails', async () => {
    const normalize = vi.fn(async (blob: Blob) => blob as File);
    const resource = createPublicationPreview(normalize);
    const custom = png();
    await resource.replace(custom);
    normalize.mockRejectedValueOnce(new Error('Invalid image.'));
    await resource.replace(png());
    expect(resource.getSnapshot()).toMatchObject({ file: custom, kind: 'custom', busy: false });
    expect(resource.getSnapshot().error).toContain('previous preview is unchanged');
    await resource.capture(async () => png());
    expect(resource.getSnapshot()).toMatchObject({ kind: 'view', error: null });
  });

  it('reports a failed capture and ignores captures cancelled when the dialog closes', async () => {
    const resource = createPublicationPreview(async blob => blob as File);
    await resource.capture(async () => null);
    expect(resource.getSnapshot().error).toContain('custom image');
    const capture = deferred<Blob>();
    const pending = resource.capture(() => capture.promise);
    resource.cancel();
    capture.resolve(png());
    await pending;
    expect(resource.getSnapshot()).toMatchObject({ file: null, busy: false, error: null });
  });
});
