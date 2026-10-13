import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isPublishedBucketPublic } from './publicAccess';

beforeEach(() => vi.stubGlobal('Blob', NodeBlob));
afterEach(() => vi.unstubAllGlobals());
const viewer = (source: string) => `https://colmapview.opsiclear.com/?url=${encodeURIComponent(source)}`;

describe('bucket public access after upload', () => {
  it('confirms a public manifest, model, settings and sample image without credentials', async () => {
    const manifest = { version: 1, baseUrl: 'https://public.example/scene/', files: {
      cameras: 'cameras.bin', images: 'images.bin', points3D: 'points3D.bin',
    }, viewerStatePath: 'colmapview.yaml', imageNameToPath: { photo: 'images/photo.jpg' } };
    const request = vi.fn(async (url: string, init: RequestInit) => {
      expect(init.credentials).toBe('omit');
      expect(new Headers(init.headers).has('Authorization')).toBe(false);
      return url.endsWith('manifest.json') ? Response.json(manifest) : new Response(new Uint8Array([1, 2, 3, 4]), { status: 206 });
    });
    vi.stubGlobal('fetch', request);
    expect(await isPublishedBucketPublic(viewer('https://public.example/scene/manifest.json'))).toBe(true);
    expect(request.mock.calls.map(([url]) => url)).toContain('https://public.example/scene/images/photo.jpg');
    expect(request).toHaveBeenCalledTimes(6);
  });

  it.each(['private-model', 'private-manifest', 'cors'])('skips shortening when the recipient cannot load %s', async failure => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (failure === 'cors') throw new TypeError('Failed to fetch');
      if (url.endsWith('manifest.json') && failure !== 'private-manifest') return Response.json({
        version: 1, baseUrl: 'https://public.example/', files: { cameras: 'cameras.bin', images: 'images.bin', points3D: 'points.bin' },
      });
      return new Response('Forbidden', { status: 403 });
    }));
    expect(await isPublishedBucketPublic(viewer('https://public.example/manifest.json'))).toBe(false);
  });

  it('recognizes a public ZIP header and rejects HTML login responses with status 200', async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response(new Uint8Array([80, 75, 3, 4]), { status: 206 }))
      .mockResolvedValueOnce(new Response('<html>Sign in</html>', { headers: { 'Content-Type': 'text/html' } }));
    vi.stubGlobal('fetch', request);
    expect(await isPublishedBucketPublic(viewer('https://public.example/dataset.zip'))).toBe(true);
    expect(await isPublishedBucketPublic(viewer('https://private.example/dataset.zip'))).toBe(false);
    expect(request.mock.calls.every(([, init]) => init.credentials === 'omit' && new Headers(init.headers).get('Range') === 'bytes=0-3')).toBe(true);
  });

  it('handles a ZIP header split across network chunks and cancels the remaining body', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([80, 75]));
        controller.enqueue(new Uint8Array([3, 4]));
      }, cancel,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
    expect(await isPublishedBucketPublic(viewer('https://public.example/dataset.zip'))).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
  });
});
