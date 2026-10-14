import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bucketAccess, isInternalHost } from './publicAccess';

beforeEach(() => vi.stubGlobal('Blob', NodeBlob));
afterEach(() => vi.unstubAllGlobals());
const viewer = (source: string) => `https://colmapview.opsiclear.com/?url=${encodeURIComponent(source)}`;
const manifest = { version: 1, baseUrl: 'https://public.example/scene/', files: { cameras: 'cameras.bin', images: 'images.bin', points3D: 'points3D.bin' },
  viewerStatePath: 'colmapview.yaml', imageNameToPath: { photo: 'images/photo.jpg' } };

describe('bucketAccess', () => {
  it('confirms public access to the manifest, model, settings and a sample image without credentials', async () => {
    const request = vi.fn(async (url: string, init: RequestInit) => {
      expect(init.credentials).toBe('omit');
      expect(new Headers(init.headers).has('Authorization')).toBe(false);
      return url.endsWith('manifest.json') ? Response.json(manifest) : new Response(new Uint8Array([1, 2, 3, 4]), { status: 206 });
    });
    vi.stubGlobal('fetch', request);
    expect(await bucketAccess(viewer('https://public.example/scene/manifest.json'))).toBe('public');
    expect(request.mock.calls.map(([url]) => url)).toContain('https://public.example/scene/images/photo.jpg');
    expect(request).toHaveBeenCalledTimes(6);
  });

  it.each([
    ['a refused model file', (url: string) => url.endsWith('manifest.json') ? Response.json(manifest) : new Response('Forbidden', { status: 403 }), 'private'],
    ['a refused manifest', () => new Response('Forbidden', { status: 401 }), 'private'],
    ['a sign-in page with status 200', (url: string) => url.endsWith('manifest.json') ? Response.json(manifest) : new Response('<html>Sign in</html>', { headers: { 'Content-Type': 'text/html' } }), 'private'],
    ['a missing manifest', () => new Response('Not found', { status: 404 }), 'unknown'],
    ['a failing file', (url: string) => url.endsWith('manifest.json') ? Response.json(manifest) : new Response('Error', { status: 500 }), 'unknown'],
    ['a CORS or network failure', () => { throw new TypeError('Failed to fetch'); }, 'unknown'],
  ] as const)('answers %s with %s', async (_name, respond, expected) => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => respond(url)));
    expect(await bucketAccess(viewer('https://public.example/scene/manifest.json'))).toBe(expected);
  });

  it('recognizes a public ZIP header, also split across chunks, and cancels the rest of the body', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([80, 75])); controller.enqueue(new Uint8Array([3, 4])); }, cancel });
    const request = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    vi.stubGlobal('fetch', request);
    expect(await bucketAccess(viewer('https://public.example/dataset.zip'))).toBe('public');
    expect(cancel).toHaveBeenCalledOnce();
    expect(new Headers(request.mock.calls[0][1].headers).get('Range')).toBe('bytes=0-3');
  });

  it('treats internal hosts as private without any request', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    for (const host of ['localhost', '127.0.0.1', '10.1.2.3', '192.168.1.20', 'minio', 'nas.local', '[fd12:3456::1]', '[::ffff:127.0.0.1]', '[::ffff:c0a8:114]']) {
      expect(await bucketAccess(viewer(`http://${host}:9000/bucket/scene.zip`)), host).toBe('private');
    }
    expect(request).not.toHaveBeenCalled();
  });

  it('answers unknown for a viewer link without a source', async () => {
    expect(await bucketAccess('https://colmapview.opsiclear.com/')).toBe('unknown');
  });
});

describe('isInternalHost', () => {
  it.each([
    ['localhost', true], ['127.0.0.1', true], ['10.0.0.1', true], ['172.16.0.1', true], ['172.31.255.255', true], ['192.168.0.1', true],
    ['169.254.1.1', true], ['100.64.0.1', true], ['0.0.0.0', true], ['minio', true], ['bucket.local', true], ['s3.internal', true], ['nas.lan', true],
    ['printer.home.arpa', true], ['[::1]', true], ['[fd00::1]', true], ['[fe80::1]', true], ['host.localhost', true],
    ['[::ffff:127.0.0.1]', true], ['[::ffff:7f00:1]', true], ['[::ffff:c0a8:1]', true], ['[::ffff:a9fe:101]', true],
    ['172.32.0.1', false], ['8.8.8.8', false], ['bucket.s3.amazonaws.com', false], ['example.com', false], ['[2001:db8::1]', false],
    ['[::ffff:808:808]', false],
  ])('%s is internal: %s', (host, internal) => expect(isInternalHost(host)).toBe(internal));
});
