import { Blob as NodeBlob } from 'node:buffer';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { packageDriveArchive, prepareDriveArchive } from './prepareArchive';
import type { PreparedPublication, PublishAsset } from '../datasetPublishing/types';
import { buildImage, buildPoint3D, buildReconstruction, buildCamera, buildDatasetState, buildLoadedFiles } from '../../test/builders';
import { preparePublication } from '../datasetPublishing/preparePublication';
import { createIdentityEuler } from '../../utils/sim3dTransforms';
import { parseDatasetViewerSettings } from '../../utils/datasetViewerSettings';
import { hfAuth } from '../huggingface/auth';
import { ARCHIVE_SIZE_LIMIT } from '../../utils/zipValidation';
import { appLogger } from '../../utils/logger';
// prepareDriveArchive imports the Hub SDK lazily; load it with the file so the first test's budget
// does not absorb a cold module load under parallel runs.
import '@huggingface/hub';

vi.mock('../huggingface/auth', () => ({ hfAuth: { getReadAccessToken: vi.fn(), getSnapshot: vi.fn(), expire: vi.fn() } }));

beforeEach(() => { vi.stubGlobal('Blob', NodeBlob); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const asset = (path: string, text: string, kind: PublishAsset['kind'] = 'colmap'): PublishAsset => ({ path, kind, size: text.length, open: async () => new Blob([text]) });
const prepared = (assets: PublishAsset[]): PreparedPublication => ({ operationId: 'operation', sourceKey: 'source', modelRevision: 0,
  assets, viewerState: { version: 1, viewerVersion: 'test', viewState: null, config: {} }, counts: { cameras: 1, images: 1, points: 1 },
  imageNameToPath: {}, splatPaths: [], viewerBaseUrl: 'https://viewer.example/latest/' });

describe('Drive dataset ZIP packaging', () => {
  // The fixture reconstructions have no 3D points, which the COLMAP export notes as a warning.
  beforeEach(() => { vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined); });

  it('rejects a catalogued oversized active remote splat before any download', async () => {
    const request = vi.fn(); vi.stubGlobal('fetch', request);
    await expect(prepareDriveArchive({ sourceKey: 'large', modelRevision: 0, source: null,
      reconstruction: buildReconstruction({ cameras: [buildCamera()], images: [] }),
      dataset: buildDatasetState({ sourceType: 'url', loadedFiles: buildLoadedFiles({ splatFileSources: [
        { id: 'active', path: 'active.sog', url: 'https://example.test/active.sog', size: ARCHIVE_SIZE_LIMIT + 1 },
      ] }) }), activeSplatId: 'active', transform: createIdentityEuler(), splatTransform: createIdentityEuler(), config: {},
      viewState: null, appVersion: 'test', viewerBaseUrl: 'https://viewer.example/',
    }, new AbortController().signal, () => {}, () => {})).rejects.toThrow('2 GiB');
    expect(request).not.toHaveBeenCalled();
  });
  it('copies private Hub images and masks using read authorization and a pinned revision', async () => {
    const sha = 'b'.repeat(40);
    const root = 'https://huggingface.co/datasets/owner/private/resolve/';
    const connection = { status: 'connected' as const, identity: { username: 'owner' }, error: null };
    vi.mocked(hfAuth.getSnapshot).mockReturnValue(connection);
    vi.mocked(hfAuth.getReadAccessToken).mockReturnValue('private-source-read-fixture');
    const request = vi.fn(async (url: string, init?: RequestInit) => {
      if (!new Headers(init?.headers).has('Authorization')) return new Response(null, { status: 401 });
      if (url.includes('/revision/main')) return Response.json({ id: 'owner/private', _id: 'repo-id', sha, private: true, gated: 'auto' });
      if (url.includes(`/tree/${sha}/images/nested?`)) return Response.json([{ type: 'file', path: 'images/nested/photo.jpg', size: 8 }]);
      if (url.includes(`/tree/${sha}/masks`)) return Response.json([{ type: 'file', path: 'masks/nested/photo.jpg.png', size: 4 }]);
      if (url === root + sha + '/images/nested/photo.jpg') return new Response('original');
      if (url === root + sha + '/masks/nested/photo.jpg.png') return new Response('mask');
      throw new Error('Unexpected source request');
    });
    vi.stubGlobal('fetch', request);
    const reconstruction = buildReconstruction({ cameras: [buildCamera()], images: [buildImage({ name: 'nested/photo.jpg' })] });
    const result = await prepareDriveArchive({ sourceKey: 'remote', modelRevision: 0, reconstruction, source: null,
      dataset: buildDatasetState({ sourceType: 'url', imageUrlBase: root + 'main/images/', maskUrlBase: root + 'main/masks/' }),
      activeSplatId: null, transform: createIdentityEuler(), splatTransform: createIdentityEuler(), config: {}, viewState: null,
      appVersion: 'test', viewerBaseUrl: 'https://viewer.example/',
    }, new AbortController().signal, () => {}, () => {});
    const entries = unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
    expect(strFromU8(entries['images/nested/photo.jpg'])).toBe('original');
    expect(strFromU8(entries['masks/nested/photo.jpg.png'])).toBe('mask');
    const authorized = request.mock.calls.filter(([, init]) => new Headers(init?.headers).has('Authorization'));
    expect(authorized).toHaveLength(5);
    expect(authorized.every(([, init]) => new Headers(init?.headers).get('Authorization') === 'Bearer private-source-read-fixture')).toBe(true);
    expect(authorized.filter(([url]) => url.includes('/resolve/')).every(([url]) => url.includes(`/resolve/${sha}/`))).toBe(true);
    expect(request.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
  });
  it('round-trips binary, image, mask, splat and YAML entries and matches Drive’s MD5 checksum', async () => {
    const paths = ['sparse/0/cameras.bin', 'sparse/0/images.bin', 'sparse/0/points3D.bin', 'images/nested/photo.jpg', 'masks/nested/photo.jpg.png', 'splats/scene.sog', 'colmapview.yaml'];
    const progress = vi.fn();
    const kinds: PublishAsset['kind'][] = ['colmap', 'colmap', 'colmap', 'image', 'mask', 'splat', 'viewer-state'];
    const result = await packageDriveArchive(prepared(paths.map((path, index) => asset(path, path, kinds[index]))), new AbortController().signal, progress, () => {});
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    const files = unzipSync(bytes);
    expect(Object.keys(files)).toEqual(paths);
    for (const path of paths) expect(strFromU8(files[path])).toBe(path);
    expect(result.md5).toBe(createHash('md5').update(bytes).digest('hex'));
    expect(result.blob.type).toBe('application/zip');
    expect(result.assets).toEqual({ format: 'zip', imageFormat: 'original', colmap: { files: 3, cameras: 1, points: 1 },
      images: 1, masks: 1, splats: 1, viewerSettings: true, preview: false });
    expect(progress).toHaveBeenLastCalledWith('Packaged colmapview.yaml', paths.length, paths.length);
  });
  it('releases transient buffers after each ZIP entry, before packaging the next file', async () => {
    const buffers: Array<Blob | null> = [new Blob(['first mask']), new Blob(['second mask'])];
    const assets = buffers.map((buffer, index): PublishAsset => ({
      path: `masks/${index}.png`, kind: 'mask', size: buffer!.size,
      open: async () => buffers[index]!, release: vi.fn(() => { buffers[index] = null; }),
    }));
    const releases = assets.map(asset => asset.release!);
    const progress = (message: string) => {
      if (message.startsWith('Packaged masks/0.png')) {
        expect(buffers[0]).toBeNull();
        expect(buffers[1]).not.toBeNull();
      }
    };
    const archive = await packageDriveArchive(prepared(assets), new AbortController().signal, progress, () => {});
    const entries = unzipSync(new Uint8Array(await archive.blob.arrayBuffer()));
    expect(strFromU8(entries['masks/0.png'])).toBe('first mask');
    expect(strFromU8(entries['masks/1.png'])).toBe('second mask');
    expect(buffers).toEqual([null, null]);
    releases.forEach(release => expect(release).toHaveBeenCalledOnce());
  });
  it.each(['cancelled', 'read failed', 'too large'] as const)('releases all transient buffers when packaging is %s', async outcome => {
    const releases = [vi.fn(), vi.fn()];
    const assets = [asset('masks/first.png', 'first'), asset('masks/second.png', 'second')]
      .map((item, index) => ({ ...item, open: vi.fn(item.open), release: releases[index] }));
    const controller = new AbortController();
    if (outcome === 'read failed') assets[0].open.mockRejectedValueOnce(new Error('Source unavailable'));
    const progress = (message: string) => {
      if (outcome === 'cancelled' && message.startsWith('Packaged masks/first.png')) controller.abort();
    };
    await expect(packageDriveArchive(prepared(assets), controller.signal, progress, () => {}, outcome === 'too large' ? 1 : 1000)).rejects.toThrow();
    releases.forEach(release => expect(release).toHaveBeenCalledOnce());
    expect(assets[1].open).not.toHaveBeenCalled();
  });
  it('rejects known oversized datasets before opening any file and also counts ZIP overhead, without offering a retry', async () => {
    const limit = { message: expect.stringContaining('2 GiB'), permanent: true };
    const open = vi.fn().mockResolvedValue(new Blob(['data']));
    await expect(packageDriveArchive(prepared([{ path: 'large.sog', kind: 'splat', size: 1000, open }]), new AbortController().signal, () => {}, () => {}, 100)).rejects.toMatchObject(limit);
    expect(open).not.toHaveBeenCalled();
    await expect(packageDriveArchive(prepared([asset('tiny.bin', 'x')]), new AbortController().signal, () => {}, () => {}, 5)).rejects.toMatchObject(limit);
  });
  it('rejects more than 60,000 files before opening any, without offering a retry', async () => {
    const open = vi.fn();
    const assets = Array.from({ length: 60_001 }, (_, index): PublishAsset => ({ path: `images/${index}.jpg`, kind: 'image', size: 1, open }));
    await expect(packageDriveArchive(prepared(assets), new AbortController().signal, () => {}, () => {}))
      .rejects.toMatchObject({ message: 'This dataset has too many files for a ZIP archive.', permanent: true });
    expect(open).not.toHaveBeenCalled();
  });
  it('rejects source size changes and stops an aborted reader before packaging the next asset', async () => {
    const source = asset('file.bin', 'data'); source.size = 1;
    await expect(packageDriveArchive(prepared([source]), new AbortController().signal, () => {}, () => {}))
      .rejects.toMatchObject({ message: 'The source file file.bin changed. Publish again.', permanent: true });
    const controller = new AbortController();
    const next = { ...asset('next.bin', 'next'), open: vi.fn() };
    await expect(packageDriveArchive(prepared([asset('first.bin', 'data'), next]), controller.signal,
      message => { if (message.startsWith('Packaged')) controller.abort(); }, () => {})).rejects.toThrow();
    expect(next.open).not.toHaveBeenCalled();
  });
  it('names the 2 GiB limit, not a source change, when a changed source also overflows the ZIP', async () => {
    // The declared size passes the early check; the 4 bytes read both differ from it and exceed the limit.
    const source = asset('file.bin', 'data'); source.size = 1;
    await expect(packageDriveArchive(prepared([source]), new AbortController().signal, () => {}, () => {}, 3))
      .rejects.toMatchObject({ message: 'The dataset ZIP exceeds the 2 GiB archive limit. Use a smaller dataset or splat.', permanent: true });
  });
  it('packages only the active splat and restores its saved transform and selection', async () => {
    const photo = new File(['photo'], 'photo.jpg');
    const active = new File(['sog bytes'], 'active.sog');
    const unused = { id: 'unused', path: 'unused.ply', size: 1_240_001_532, url: 'https://example.test/unused.ply' };
    const reconstruction = buildReconstruction({ cameras: [buildCamera()], images: [buildImage({ name: 'photo.jpg' })] });
    const result = await preparePublication({ sourceKey: 'local', modelRevision: 0, reconstruction, source: null,
      dataset: buildDatasetState({ sourceType: 'local', loadedFiles: buildLoadedFiles({ imageFiles: new Map([['photo.jpg', photo]]),
        splatFileSources: [unused, { id: 'active', path: 'active.sog', file: active }] }) }),
      activeSplatId: 'active', splats: 'active', transform: createIdentityEuler(), splatTransform: { ...createIdentityEuler(), translationX: 2 },
      config: {}, viewState: null, appVersion: 'test', viewerBaseUrl: 'https://viewer.example/',
    }, new AbortController().signal, { resolveRevision: vi.fn(), listFiles: vi.fn(), assertCurrent: () => {}, progress: () => {} });
    expect(result.assets.filter(file => file.kind === 'splat').map(file => file.path)).toEqual(['splats/active.sog']);
    const settings = parseDatasetViewerSettings(await (await result.assets.find(file => file.kind === 'viewer-state')!.open(new AbortController().signal)).text());
    expect(settings.config.splat?.activeSourceId).toBe('splats/active.sog');
    expect(settings.config.splat?.transform?.translationX).toBe(2);
  });
});

describe('Drive remote sources', () => {
  const bucket = 'https://bucket.s3.amazonaws.com/scene/';
  // One point keeps preparation from warning that there are no points to export.
  const remoteInput = (dataset: Parameters<typeof buildDatasetState>[0], images = [buildImage({ name: 'photo.jpg' })]) => ({
    sourceKey: 'remote', modelRevision: 0, source: null, reconstruction: buildReconstruction({ cameras: [buildCamera()], images, points3D: [buildPoint3D()] }),
    dataset: buildDatasetState({ sourceType: 'url', ...dataset }), activeSplatId: null as string | null,
    transform: createIdentityEuler(), splatTransform: createIdentityEuler(), config: {}, viewState: null,
    appVersion: 'test', viewerBaseUrl: 'https://viewer.example/' });
  const s3Input = () => remoteInput({ imageUrlBase: bucket + 'images/', maskUrlBase: bucket + 'masks/' });
  const entries = async (archive: { blob: Blob }) => unzipSync(new Uint8Array(await archive.blob.arrayBuffer()));
  const original = (url: string) => url === bucket + 'images/photo.jpg' ? new Response('original') : null;

  it('packages an active remote splat whose catalogued size is unknown', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url === bucket + 'tile.ply' ? new Response('splat bytes') : new Response(null, { status: 404 })));
    const source = remoteInput({ loadedFiles: buildLoadedFiles({ splatFileSources: [{ id: 'tile', path: 'tile.ply', url: bucket + 'tile.ply', size: 0 }] }) }, []);
    source.activeSplatId = 'tile';
    const archive = await prepareDriveArchive(source, new AbortController().signal, () => {}, () => {});
    expect(strFromU8((await entries(archive))['splats/tile.ply'])).toBe('splat bytes');
  });
  it.each(['OpsiClear/NGS', 'lab/renamed-scene'])('pins a Hub source loaded as opsiclear/ngs that the Hub now names %s', async canonical => {
    const sha = 'e'.repeat(40);
    const root = 'https://huggingface.co/datasets/opsiclear/ngs/resolve/';
    // fetch follows the Hub's 307 to the canonical repository, which answers with its own id.
    const request = vi.fn(async (url: string) => url.startsWith('https://huggingface.co/api/datasets/opsiclear/ngs/revision/main?')
      ? Response.json({ _id: 'repo-object-id', id: canonical, sha })
      : url === `${root}${sha}/images/photo.jpg` ? new Response('original') : new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', request);
    const archive = await prepareDriveArchive(remoteInput({ imageUrlBase: `${root}main/images/` }), new AbortController().signal, () => {}, () => {});
    expect(strFromU8((await entries(archive))['images/photo.jpg'])).toBe('original');
  });
  it('refuses a Hub revision that does not resolve to a commit', async () => {
    const request = vi.fn(async (url: string) => url.includes('/revision/main?') ? Response.json({ _id: 'repo-object-id', id: 'owner/scene', sha: 'main' })
      : new Response('original'));
    vi.stubGlobal('fetch', request);
    await expect(prepareDriveArchive(remoteInput({ imageUrlBase: 'https://huggingface.co/datasets/owner/scene/resolve/main/images/' }),
      new AbortController().signal, () => {}, () => {})).rejects.toMatchObject({ message: 'Could not pin the source dataset revision.' });
    expect(request.mock.calls.filter(([url]) => url.includes('/resolve/'))).toEqual([]);
  });
  it('skips a forbidden mask name like the viewer, as S3 answers missing keys without ListBucket', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => original(url)
      ?? (url === bucket + 'masks/photo.jpg' ? new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 })
        : url === bucket + 'masks/photo.jpg.png' ? new Response('mask') : new Response(null, { status: 500 }))));
    const files = await entries(await prepareDriveArchive(s3Input(), new AbortController().signal, () => {}, () => {}));
    expect(strFromU8(files['images/photo.jpg'])).toBe('original');
    expect(strFromU8(files['masks/photo.jpg.png'])).toBe('mask');
  });
  it('publishes without a mask when every mask name is forbidden', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => original(url) ?? new Response(null, { status: 403 })));
    const files = await entries(await prepareDriveArchive(s3Input(), new AbortController().signal, () => {}, () => {}));
    expect(Object.keys(files).filter(path => path.startsWith('masks/'))).toEqual([]);
  });
  it.each([429, 503])('retries a %i mask response before packaging the mask', async status => {
    let limited = false;
    const request = vi.fn(async (url: string) => {
      if (original(url)) return original(url)!;
      if (url === bucket + 'masks/photo.jpg') return new Response(null, { status: 404 });
      if (!limited) { limited = true; return new Response(null, { status, headers: { 'Retry-After': '0' } }); }
      return new Response('mask');
    });
    vi.stubGlobal('fetch', request);
    const files = await entries(await prepareDriveArchive(s3Input(), new AbortController().signal, () => {}, () => {}));
    expect(strFromU8(files['masks/photo.jpg.png'])).toBe('mask');
    expect(request.mock.calls.filter(([url]) => url === bucket + 'masks/photo.jpg.png')).toHaveLength(2);
  });
  it('names the mask and status once retries are exhausted', async () => {
    const request = vi.fn(async (url: string) => original(url) ?? new Response(null, { status: 503, headers: { 'Retry-After': '0' } }));
    vi.stubGlobal('fetch', request);
    await expect(prepareDriveArchive(s3Input(), new AbortController().signal, () => {}, () => {}))
      .rejects.toMatchObject({ message: 'Could not read the mask for photo.jpg (HTTP 503). Retry the publication.', permanent: false });
    expect(request.mock.calls.filter(([url]) => url === bucket + 'masks/photo.jpg')).toHaveLength(3);
  });
  it('fails in a way no retry can fix on a Hugging Face dataset download link, which cannot be pinned', async () => {
    const request = vi.fn(); vi.stubGlobal('fetch', request);
    await expect(prepareDriveArchive(remoteInput({ imageNameToUrl: { 'photo.jpg': 'https://huggingface.co/datasets/owner/scene/resolve/main/images/photo.jpg?download=true' } }),
      new AbortController().signal, () => {}, () => {})).rejects.toMatchObject({
      message: 'Copy these remote assets locally before publishing. Only public Hugging Face asset URLs can be pinned.', permanent: true });
    expect(request).not.toHaveBeenCalled();
  });
  it('copies images and masks from Hugging Face model and Space repositories unpinned, like any other host', async () => {
    const model = 'https://huggingface.co/owner/scene/resolve/main/';
    const space = 'https://huggingface.co/spaces/owner/app/resolve/main/';
    const request = vi.fn(async (url: string) => url === `${model}images/photo.jpg` ? new Response('original')
      : url === `${space}masks/photo.jpg.png` ? new Response('mask') : new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', request);
    const files = await entries(await prepareDriveArchive(remoteInput({ imageUrlBase: `${model}images/`, maskUrlBase: `${space}masks/` }),
      new AbortController().signal, () => {}, () => {}));
    expect(strFromU8(files['images/photo.jpg'])).toBe('original');
    expect(strFromU8(files['masks/photo.jpg.png'])).toBe('mask');
    expect(request.mock.calls.filter(([url]) => url.includes('/api/'))).toEqual([]);
  });
  it.each(['ftp://files.example/scene/images/', 'https://reader:secret@bucket.example/scene/images/'])(
    'fails in a way no retry can fix on the unsupported image location %s', async imageUrlBase => {
      const request = vi.fn(); vi.stubGlobal('fetch', request);
      await expect(prepareDriveArchive(remoteInput({ imageUrlBase }), new AbortController().signal, () => {}, () => {}))
        .rejects.toMatchObject({ message: 'The dataset has an unsupported remote file URL.', permanent: true });
      expect(request).not.toHaveBeenCalled();
    });
  it.each([
    ['a relative image URL', { imageNameToUrl: { 'photo.jpg': 'images/photo.jpg' } }, 'The dataset has an invalid remote file URL.'],
    ['a relative mask folder', { imageUrlBase: bucket + 'images/', maskUrlBase: 'masks/' }, 'The dataset has an invalid remote file URL.'],
    ['a broken escape in a Hugging Face file path', { imageNameToUrl: { 'photo.jpg': 'https://huggingface.co/datasets/owner/scene/resolve/main/images/%E0%A4%A.jpg' } },
      'The dataset has an invalid Hugging Face file URL.'],
    ['a broken escape in a Hugging Face revision', { imageUrlBase: 'https://huggingface.co/datasets/owner/scene/resolve/v%ZZ/images/' },
      'The dataset has an invalid Hugging Face file URL.'],
    ['a broken escape in a Hugging Face mask folder', { imageUrlBase: bucket + 'images/', maskUrlBase: 'https://huggingface.co/datasets/owner/scene/resolve/main/m%Zasks/' },
      'The dataset has an invalid Hugging Face file URL.'],
  ])('fails in a way no retry can fix on %s', async (_, dataset, message) => {
    const request = vi.fn(); vi.stubGlobal('fetch', request);
    await expect(prepareDriveArchive(remoteInput(dataset), new AbortController().signal, () => {}, () => {}))
      .rejects.toMatchObject({ message, permanent: true });
    expect(request).not.toHaveBeenCalled();
  });
  const numbered = (count: number) => Array.from({ length: count }, (_, index) => buildImage({ imageId: index + 1, name: `photo${index}.jpg` }));
  const masked = (images: ReturnType<typeof numbered>) => remoteInput({ imageUrlBase: bucket + 'images/', maskUrlBase: bucket + 'masks/' }, images);
  it('stops probing a mask folder after 8 images without a mask, like the viewer', async () => {
    const request = vi.fn(async (url: string) => url.startsWith(bucket + 'images/') ? new Response('original') : new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', request);
    const files = await entries(await prepareDriveArchive(masked(numbered(20)), new AbortController().signal, () => {}, () => {}));
    expect(Object.keys(files).filter(path => path.startsWith('images/'))).toHaveLength(20);
    expect(Object.keys(files).filter(path => path.startsWith('masks/'))).toEqual([]);
    expect(request.mock.calls.filter(([url]) => url.startsWith(bucket + 'masks/'))).toHaveLength(16);
  });
  it('keeps probing every image once the folder has produced a mask', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.startsWith(bucket + 'images/') ? new Response('original')
      : [bucket + 'masks/photo0.jpg.png', bucket + 'masks/photo11.jpg.png'].includes(url) ? new Response('mask') : new Response(null, { status: 403 })));
    const files = await entries(await prepareDriveArchive(masked(numbered(12)), new AbortController().signal, () => {}, () => {}));
    expect(Object.keys(files).filter(path => path.startsWith('masks/')).sort()).toEqual(['masks/photo0.jpg.png', 'masks/photo11.jpg.png']);
  });
  // A 404 without CORS headers (nginx add_header without `always`) reaches the browser as a network error.
  const unreadable = () => Promise.reject(new TypeError('Failed to fetch'));
  it('publishes a mask-less dataset whose host answers missing masks without CORS headers, as the viewer loads it', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.startsWith(bucket + 'images/') ? new Response('original') : unreadable()));
    const files = await entries(await prepareDriveArchive(masked(numbered(3)), new AbortController().signal, () => {}, () => {}));
    expect(Object.keys(files).filter(path => path.startsWith('images/'))).toHaveLength(3);
    expect(Object.keys(files).filter(path => path.startsWith('masks/'))).toEqual([]);
  });
  it.each([
    ['forbidden (S3 without ListBucket)', () => new Response(null, { status: 403 })],
    ['unreadable', unreadable],
  ])('keeps probing past 8 images whose mask names are %s, as only a 404 proves absence to the viewer', async (_, missing) => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.startsWith(bucket + 'images/') ? new Response('original')
      : url === bucket + 'masks/photo11.jpg.png' ? new Response('mask') : missing()));
    const files = await entries(await prepareDriveArchive(masked(numbered(12)), new AbortController().signal, () => {}, () => {}));
    expect(Object.keys(files).filter(path => path.startsWith('masks/'))).toEqual(['masks/photo11.jpg.png']);
  });
  it('still fails a mask read that times out, which a retry can fix', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.startsWith(bucket + 'images/') ? new Response('original')
      : Promise.reject(new DOMException('Request timed out', 'TimeoutError'))));
    await expect(prepareDriveArchive(masked(numbered(1)), new AbortController().signal, () => {}, () => {}))
      .rejects.toMatchObject({ name: 'TimeoutError' });
  });
  it('stops downloading masks once they alone exceed the archive limit', async () => {
    const request = vi.fn(async (url: string) => url.startsWith(bucket + 'images/') ? new Response('original')
      : url.endsWith('.png') ? new Response('mask bytes') : new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', request);
    await expect(prepareDriveArchive(masked(numbered(5)), new AbortController().signal, () => {}, () => {}, 25))
      .rejects.toMatchObject({ message: expect.stringContaining('2 GiB archive limit'), permanent: true });
    expect(request.mock.calls.filter(([url]) => url.endsWith('.png'))).toHaveLength(3);
  });
  it('downloads Hub masks while packaging, as it does images, instead of holding them from preparation', async () => {
    const sha = 'f'.repeat(40);
    const root = 'https://huggingface.co/datasets/owner/scene/resolve/';
    const request = vi.fn(async (url: string) => {
      if (url.includes('/revision/main?')) return Response.json({ _id: 'repo-object-id', id: 'owner/scene', sha });
      if (url.includes(`/tree/${sha}/masks`)) return Response.json([{ type: 'file', path: 'masks/a.jpg.png', size: 6 }, { type: 'file', path: 'masks/b.jpg.png', size: 6 }]);
      if (url.startsWith(`${root}${sha}/`)) return new Response(url.endsWith('.png') ? 'mask!!' : 'original');
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', request);
    const archive = await prepareDriveArchive(remoteInput({ imageUrlBase: `${root}main/images/`, maskUrlBase: `${root}main/masks/` },
      [buildImage({ imageId: 1, name: 'a.jpg' }), buildImage({ imageId: 2, name: 'b.jpg' })]), new AbortController().signal, () => {}, () => {});
    expect(request.mock.calls.map(([url]) => url).filter(url => url.includes('/resolve/')).map(url => url.slice(`${root}${sha}/`.length)))
      .toEqual(['images/a.jpg', 'masks/a.jpg.png', 'images/b.jpg', 'masks/b.jpg.png']);
    expect(strFromU8((await entries(archive))['masks/b.jpg.png'])).toBe('mask!!');
  });
  const hubSha = 'c'.repeat(40);
  const hubRoot = 'https://huggingface.co/datasets/owner/scene/resolve/';
  const hubRevision = (url: string) => url.includes('/revision/main?') ? Response.json({ _id: 'repo-object-id', id: 'owner/scene', sha: hubSha }) : null;
  it.each([
    // 20 images of 120 MiB each fit the per-file limit but not the ZIP.
    ['whose listed images exceed the ZIP limit', 20, 120 * 1024 * 1024, '2 GiB archive limit'],
    ['with a listed image over the per-file limit', 1, 128 * 1024 * 1024 + 1, '128 MiB publication limit'],
  ])('refuses a Hub dataset %s before downloading any image', async (_, count, size, limit) => {
    const images = numbered(count);
    const request = vi.fn(async (url: string) => hubRevision(url)
      ?? (url.includes(`/tree/${hubSha}/images?`) ? Response.json(images.map(image => ({ type: 'file', path: `images/${image.name}`, size })))
        : new Response('original')));
    vi.stubGlobal('fetch', request);
    await expect(prepareDriveArchive(remoteInput({ imageUrlBase: `${hubRoot}main/images/` }, images), new AbortController().signal, () => {}, () => {}))
      .rejects.toMatchObject({ message: expect.stringContaining(limit), permanent: true });
    expect(request.mock.calls.filter(([url]) => url.includes('/resolve/'))).toEqual([]);
  });
  it('lists a Hub image folder once and checks each image against its listed size', async () => {
    const images = numbered(3);
    const request = vi.fn(async (url: string) => hubRevision(url)
      ?? (url.includes(`/tree/${hubSha}/images?`) ? Response.json(images.map(image => ({ type: 'file', path: `images/${image.name}`, size: 8 })))
        : url.startsWith(`${hubRoot}${hubSha}/images/`) ? new Response('original') : new Response(null, { status: 404 })));
    vi.stubGlobal('fetch', request);
    const files = await entries(await prepareDriveArchive(remoteInput({ imageUrlBase: `${hubRoot}main/images/` }, images), new AbortController().signal, () => {}, () => {}));
    expect(Object.keys(files).filter(path => path.startsWith('images/'))).toHaveLength(3);
    expect(request.mock.calls.filter(([url]) => url.includes('/tree/'))).toHaveLength(1);
  });
  it('still publishes Hub images whose folder listing fails, checking the ZIP limit while packaging', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => hubRevision(url)
      ?? (url.includes('/tree/') ? new Response(null, { status: 500 }) : new Response('original'))));
    const files = await entries(await prepareDriveArchive(remoteInput({ imageUrlBase: `${hubRoot}main/images/` }, numbered(2)), new AbortController().signal, () => {}, () => {}));
    expect(Object.keys(files).filter(path => path.startsWith('images/'))).toHaveLength(2);
  });
  it('retries throttled Hub revision reads and folder listings, like other Hub reads', async () => {
    const throttled = new Set<string>();
    const request = vi.fn(async (url: string) => {
      const read = url.includes('/revision/main?') ? 'revision' : url.includes('/tree/') ? url.split('?')[0] : null;
      if (read && !throttled.has(read)) {
        throttled.add(read);
        return new Response(null, { status: read === 'revision' ? 429 : 503, headers: { 'Retry-After': '0' } });
      }
      return hubRevision(url) ?? (read ? Response.json(read.endsWith('/masks') ? [{ type: 'file', path: 'masks/photo.jpg.png', size: 4 }] : [])
        : new Response(url.endsWith('.png') ? 'mask' : 'original'));
    });
    vi.stubGlobal('fetch', request);
    const files = await entries(await prepareDriveArchive(remoteInput({ imageUrlBase: `${hubRoot}main/images/`, maskUrlBase: `${hubRoot}main/masks/` }),
      new AbortController().signal, () => {}, () => {}));
    expect(strFromU8(files['images/photo.jpg'])).toBe('original');
    expect(strFromU8(files['masks/photo.jpg.png'])).toBe('mask');
    expect(request.mock.calls.filter(([url]) => url.includes('/revision/main?'))).toHaveLength(2);
    // The image folder and the mask folder are each listed after one retry.
    expect(request.mock.calls.filter(([url]) => url.includes('/tree/'))).toHaveLength(4);
  });
  it('names an oversized mask and the limit, and does not offer a retry', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => original(url)
      ?? (url === bucket + 'masks/photo.jpg.png'
        ? new Response('mask', { headers: { 'content-length': String(128 * 1024 * 1024 + 1) } })
        : new Response(null, { status: 404 }))));
    await expect(prepareDriveArchive(s3Input(), new AbortController().signal, () => {}, () => {})).rejects.toMatchObject({
      message: 'The mask for photo.jpg (photo.jpg.png) exceeds the 128 MiB publication limit for non-splat files. Shrink it in the source dataset, then publish again.',
      permanent: true });
  });
  const activeTile = (url: string, size: number) => {
    const source = remoteInput({ loadedFiles: buildLoadedFiles({ splatFileSources: [{ id: 'tile', path: 'tile.ply', url, size }] }) }, []);
    source.activeSplatId = 'tile';
    return source;
  };
  it('packages an active remote splat that changed since the dataset loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url === bucket + 'tile.ply' ? new Response('splat bytes') : new Response(null, { status: 404 })));
    const archive = await prepareDriveArchive(activeTile(bucket + 'tile.ply', 5), new AbortController().signal, () => {}, () => {});
    expect(strFromU8((await entries(archive))['splats/tile.ply'])).toBe('splat bytes');
  });
  it('checks an active Hub splat against its size at the pinned revision rather than the size seen at load', async () => {
    const request = vi.fn(async (url: string) => hubRevision(url)
      ?? (url.includes(`/tree/${hubSha}?`) ? Response.json([{ type: 'file', path: 'tile.ply', size: ARCHIVE_SIZE_LIMIT + 1 }]) : new Response('splat bytes')));
    vi.stubGlobal('fetch', request);
    await expect(prepareDriveArchive(activeTile(`${hubRoot}main/tile.ply`, 10), new AbortController().signal, () => {}, () => {}))
      .rejects.toMatchObject({ message: expect.stringContaining('2 GiB archive limit'), permanent: true });
    expect(request.mock.calls.filter(([url]) => url.includes('/resolve/'))).toEqual([]);
  });
});
