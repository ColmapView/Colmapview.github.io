import { describe, expect, it, vi } from 'vitest';
import { createVideoFrameMedia, prepareManifestVideoImages, rememberManifestVideoImages, type DecodeVideoFrame } from './videoFrameMedia';
import type { VideoImageBinding } from './types';
import type { Camera, Image } from '../../types/colmap';

const binding: VideoImageBinding = { url: 'https://media.test/camera.mp4', bytes: 1000, timestamp: 2, width: 10, height: 10 };
const bindings = new Map([['a.png', binding], ['b.png', { ...binding, timestamp: 3 }]]);
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const frame = (name = 'a.png') => new File(['12345678'], name, { type: 'image/png' });

describe('camera video frame ownership', () => {
  it('loads only on demand, coalesces consumers and keeps a shared decode when one consumer cancels', async () => {
    const pending = deferred<File>(), decode = vi.fn<DecodeVideoFrame>(() => pending.promise);
    const media = createVideoFrameMedia(bindings, true, decode);
    expect(decode).not.toHaveBeenCalled();
    const controller = new AbortController();
    const cancelled = media.getImage('a.png', { signal: controller.signal });
    const retained = media.getImage('a.png');
    controller.abort();
    expect(await cancelled).toBeNull();
    expect(decode.mock.calls[0][2].aborted).toBe(false);
    pending.resolve(frame());
    expect(await retained).toBe(media.getImageSync('a.png'));
    expect(await media.getImage('a.png')).toBe(media.getImageSync('a.png'));
    expect(decode).toHaveBeenCalledTimes(1);
    media.dispose();
  });

  it('aborts the last consumer, never caches an obsolete result and permits a fresh read', async () => {
    const first = deferred<File>(), second = frame('fresh.png');
    const decode = vi.fn<DecodeVideoFrame>().mockImplementationOnce(() => first.promise).mockResolvedValueOnce(second);
    const media = createVideoFrameMedia(bindings, true, decode);
    const controller = new AbortController();
    const old = media.getImage('a.png', { signal: controller.signal });
    controller.abort();
    expect(await old).toBeNull();
    expect(decode.mock.calls[0][2].aborted).toBe(true);
    const next = media.getImage('a.png');
    first.resolve(frame('obsolete.png'));
    expect(await next).toBe(second);
    expect(media.getImageSync('a.png')).toBe(second);
    media.dispose();
  });

  it('evicts to its byte budget and clears pending work when the scene is replaced', async () => {
    const decode = vi.fn<DecodeVideoFrame>(async name => frame(name));
    const media = createVideoFrameMedia(bindings, true, decode, 10);
    await media.getImage('a.png'); await media.getImage('b.png');
    expect(media.getStats()).toEqual({ count: 1, sizeBytes: 8 });
    expect(media.getImageSync('a.png')).toBeUndefined();
    media.clear();
    expect(media.getStats().count).toBe(0);
    await media.getImage('a.png');
    media.dispose();
    expect(await media.getImage('a.png')).toBeNull();
    expect(media.getStats().count).toBe(0);
  });

  it('keeps read budgets per consumer and settles even if the error observer throws', async () => {
    const media = createVideoFrameMedia(bindings, true, async () => frame());
    expect(await media.getImage('a.png', { maxBytes: 1, onError() { throw new Error('observer'); } })).toBeNull();
    expect((await media.getImage('a.png'))?.size).toBe(8);
    expect(await media.getImage('missing.png')).toBeNull();
    media.dispose();
  });
});

describe('manifest video bindings', () => {
  const camera: Camera = { cameraId: 1, modelId: 1, width: 10, height: 10, params: [10, 10, 5, 5] };
  const image: Image = { imageId: 1, name: 'a.png', cameraId: 1, qvec: [1, 0, 0, 0], tvec: [0, 0, 0], points2D: [] };
  const images = new Map([[1, image], [2, { ...image, imageId: 2, name: 'b.png' }]]);
  const prepare = (videoImages: Record<string, { url: string; bytes: number; timestamp: number }>, cameras = new Map([[1, camera]])) => {
    const files = new Map<string, File>();
    rememberManifestVideoImages(files, { version: 4, baseUrl: 'https://media.test/scene/', files: { cameras: 'cameras.bin', images: 'images.bin' }, videoImages });
    return prepareManifestVideoImages(files, cameras, images);
  };

  it('resolves exact registered names without inventing bindings for other cameras', () => {
    const media = prepare({ 'a.png': { url: 'a.mp4', bytes: 1000, timestamp: 2 } })!;
    expect(media.size).toBe(1);
    expect(media.exclusive).toBe(true);
    expect(media.has('a.png')).toBe(true);
    expect(media.has('b.png')).toBe(false);
    media.dispose();
  });

  it('rejects unmatched names, conflicting source lengths, credentials and oversized calibration', () => {
    const source = { url: 'a.mp4', bytes: 1000, timestamp: 2 };
    expect(() => prepare({ 'unknown.png': source })).toThrow('no registered camera');
    expect(() => prepare({ 'a.png': source, 'b.png': { ...source, bytes: 2000 } })).toThrow('Conflicting byte sizes');
    expect(() => prepare({ 'a.png': { ...source, url: 'https://user:secret@media.test/a.mp4' } })).toThrow('credential-free');
    expect(() => prepare({ 'a.png': source }, new Map([[1, { ...camera, width: 2000000 }]]))).toThrow('pixel decode budget');
  });
});
