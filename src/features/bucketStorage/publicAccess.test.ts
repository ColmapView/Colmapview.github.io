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

  it('requests raw manifest paths encoded, as viewers load them', async () => {
    const scene = { ...manifest, splats: ['5x5#-5.ply'], imageNameToPath: { photo: 'images/50% off?.jpg' } };
    const keys = ['manifest.json', 'cameras.bin', 'images.bin', 'points3D.bin', 'colmapview.yaml', '5x5%23-5.ply', 'images/50%25%20off%3F.jpg'];
    // Like an S3 bucket that allows GetObject but not ListBucket: a key that doesn't exist is refused.
    const request = vi.fn(async (url: string) => !keys.some(key => url === `https://public.example/scene/${key}`) ? new Response('Forbidden', { status: 403 })
      : url.endsWith('manifest.json') ? Response.json(scene) : new Response(new Uint8Array([1, 2, 3, 4]), { status: 206 }));
    vi.stubGlobal('fetch', request);
    expect(await bucketAccess(viewer('https://public.example/scene/manifest.json'))).toBe('public');
    expect(request.mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining(['https://public.example/scene/5x5%23-5.ply', 'https://public.example/scene/images/50%25%20off%3F.jpg']));
  });

  it('requests files below a base URL without a trailing slash, as viewers do', async () => {
    const request = vi.fn(async (url: string) => url.endsWith('manifest.json') ? Response.json({ ...manifest, baseUrl: 'https://public.example/scene' })
      : new Response(new Uint8Array([1, 2, 3, 4]), { status: 206 }));
    vi.stubGlobal('fetch', request);
    expect(await bucketAccess(viewer('https://public.example/scene/manifest.json'))).toBe('public');
    expect(request.mock.calls.map(([url]) => url)).toContain('https://public.example/scene/cameras.bin');
  });

  it.each([
    ['a refused model file', 'private', (url: string) => url.endsWith('manifest.json') ? Response.json(manifest) : new Response('Forbidden', { status: 403 })],
    ['a refused manifest', 'private', () => new Response('Forbidden', { status: 401 })],
    ['a sign-in page with status 200', 'private', (url: string) => url.endsWith('manifest.json') ? Response.json(manifest) : new Response('<html>Sign in</html>', { headers: { 'Content-Type': 'text/html' } })],
    ['a sign-in page with an upper-case media type', 'private', (url: string) => url.endsWith('manifest.json') ? Response.json(manifest) : new Response('<html>Sign in</html>', { headers: { 'Content-Type': 'Text/HTML; charset=UTF-8' } })],
    ['an XHTML sign-in page', 'private', (url: string) => url.endsWith('manifest.json') ? Response.json(manifest) : new Response('<html>Sign in</html>', { headers: { 'Content-Type': 'application/xhtml+xml' } })],
    ['a sign-in page instead of the manifest', 'private', () => new Response('<html>Sign in</html>', { headers: { 'Content-Type': 'text/html' } })],
    ['a missing manifest', 'unknown', () => new Response('Not found', { status: 404 })],
    ['an HTML 404 page instead of the manifest', 'unknown', () => new Response('<html>Not found</html>', { status: 404, headers: { 'Content-Type': 'text/html' } })],
    ['a failing file', 'unknown', (url: string) => url.endsWith('manifest.json') ? Response.json(manifest) : new Response('Error', { status: 500 })],
    ['an HTML 502 error page', 'unknown', (url: string) => url.endsWith('manifest.json') ? Response.json(manifest) : new Response('<html>Bad gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8' } })],
    ['a CORS or network failure', 'unknown', () => { throw new TypeError('Failed to fetch'); }],
  ] as const)('answers %s with %s', async (_name, expected, respond) => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => respond(url)));
    expect(await bucketAccess(viewer('https://public.example/scene/manifest.json'))).toBe(expected);
  });

  it.each([
    ['a refusal and failed checks on the other files', 'private', (url: string) => {
      if (url.endsWith('cameras.bin')) return new Response('Forbidden', { status: 403 });
      throw new TypeError('Failed to fetch');
    }],
    ['public files and one failed check', 'unknown', (url: string) => {
      if (url.endsWith('cameras.bin')) throw new TypeError('Failed to fetch');
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 206 });
    }],
  ] as const)('answers %s with %s: private outweighs unknown, which outweighs public', async (_name, expected, respond) => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('manifest.json') ? Response.json(manifest) : respond(url)));
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

  it.each([
    ['a ZIP with a wrong signature', 'unknown', () => new Response(new Uint8Array([1, 2, 3, 4]), { status: 206 })],
    ['a refused ZIP', 'private', () => new Response('Forbidden', { status: 403 })],
    ['a sign-in page instead of a ZIP', 'private', () => new Response('<html>Sign in</html>', { headers: { 'Content-Type': 'text/html' } })],
  ] as const)('answers %s with %s', async (_name, expected, respond) => {
    vi.stubGlobal('fetch', vi.fn(async () => respond()));
    expect(await bucketAccess(viewer('https://public.example/dataset.zip'))).toBe(expected);
  });

  it('keeps a refusal private when the rest of its body cannot be cancelled', async () => {
    const refusal = () => new Response(new ReadableStream({ cancel() { throw new Error('Connection reset'); } }), { status: 403 });
    vi.stubGlobal('fetch', vi.fn(async () => refusal()));
    expect(await bucketAccess(viewer('https://public.example/dataset.zip'))).toBe('private');
    expect(await bucketAccess(viewer('https://public.example/scene/manifest.json'))).toBe('private');
  });

  it('treats internal hosts as private without any request', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    for (const host of ['localhost', '127.0.0.1', '127.1', '0x7f.1', '10.1.2.3', '192.168.1.20', 'minio', 'nas.local', '[fd12:3456::1]', '[::ffff:127.0.0.1]', '[::ffff:c0a8:114]']) {
      expect(await bucketAccess(viewer(`http://${host}:9000/bucket/scene.zip`)), host).toBe('private');
    }
    expect(request).not.toHaveBeenCalled();
  });

  it('treats files the manifest places on an internal host as private without requesting them', async () => {
    const request = vi.fn(async () => Response.json({ ...manifest, baseUrl: 'http://10.0.0.5/scene/' }));
    vi.stubGlobal('fetch', request);
    expect(await bucketAccess(viewer('https://public.example/scene/manifest.json'))).toBe('private');
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([
    ['the manifest', 'manifest.json'],
    ['a model file', 'cameras.bin'],
  ] as const)('treats a redirect of %s to an internal host as private', async (_name, file) => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const response = url.endsWith('manifest.json') ? Response.json(manifest) : new Response(new Uint8Array([1, 2, 3, 4]), { status: 206 });
      // fetch follows redirects and reports where it ended in response.url.
      return url.endsWith(file) ? Object.defineProperty(response, 'url', { value: `http://192.168.1.20/bucket/${file}` }) : response;
    }));
    expect(await bucketAccess(viewer('https://public.example/scene/manifest.json'))).toBe('private');
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
    ['127.1', true], ['0x7f.1', true], ['0177.0.0.1', true], ['0:0:0:0:0:0:0:1', true], ['[::]', true], ['fc00::1', true],
    ['localhost.', true], ['10.0.0.1.', true], ['NAS.Local.', true],
    ['172.32.0.1', false], ['8.8.8.8', false], ['bucket.s3.amazonaws.com', false], ['example.com', false], ['[2001:db8::1]', false],
    ['[::ffff:808:808]', false], ['example.com.', false],
  ])('%s is internal: %s', (host, internal) => expect(isInternalHost(host)).toBe(internal));
});
