import { Blob as NodeBlob } from 'node:buffer';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { packageDriveArchive, prepareDriveArchive } from './prepareArchive';
import type { PreparedPublication, PublishAsset } from '../datasetPublishing/types';
import { buildImage, buildReconstruction, buildCamera, buildDatasetState, buildLoadedFiles } from '../../test/builders';
import { preparePublication } from '../datasetPublishing/preparePublication';
import { createIdentityEuler } from '../../utils/sim3dTransforms';
import { parseDatasetViewerSettings } from '../../utils/datasetViewerSettings';
import { hfAuth } from '../huggingface/auth';
import { ARCHIVE_SIZE_LIMIT } from '../../utils/zipValidation';

vi.mock('../huggingface/auth', () => ({ hfAuth: { getReadAccessToken: vi.fn(), getSnapshot: vi.fn(), expire: vi.fn() } }));

beforeEach(() => { vi.stubGlobal('Blob', NodeBlob); });
afterEach(() => { vi.unstubAllGlobals(); });
const asset = (path: string, text: string, kind: PublishAsset['kind'] = 'colmap'): PublishAsset => ({ path, kind, size: text.length, open: async () => new Blob([text]) });
const prepared = (assets: PublishAsset[]): PreparedPublication => ({ operationId: 'operation', sourceKey: 'source', modelRevision: 0,
  assets, viewerState: { version: 1, viewerVersion: 'test', viewState: null, config: {} }, counts: { cameras: 1, images: 1, points: 1 },
  imageNameToPath: {}, splatPaths: [], viewerBaseUrl: 'https://viewer.example/latest/' });

describe('Drive dataset ZIP packaging', () => {
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
    expect(authorized).toHaveLength(4);
    expect(authorized.every(([, init]) => new Headers(init?.headers).get('Authorization') === 'Bearer private-source-read-fixture')).toBe(true);
    expect(authorized.filter(([url]) => url.includes('/resolve/')).every(([url]) => url.includes(`/resolve/${sha}/`))).toBe(true);
    expect(request.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
  });
  it('round-trips binary, image, mask, splat and YAML entries and matches Drive’s MD5 checksum', async () => {
    const paths = ['sparse/0/cameras.bin', 'sparse/0/images.bin', 'sparse/0/points3D.bin', 'images/nested/photo.jpg', 'masks/nested/photo.jpg.png', 'splats/scene.sog', 'colmapview.yaml'];
    const progress = vi.fn();
    const result = await packageDriveArchive(prepared(paths.map(path => asset(path, path))), new AbortController().signal, progress, () => {});
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    const files = unzipSync(bytes);
    expect(Object.keys(files)).toEqual(paths);
    for (const path of paths) expect(strFromU8(files[path])).toBe(path);
    expect(result.md5).toBe(createHash('md5').update(bytes).digest('hex'));
    expect(result.blob.type).toBe('application/zip');
    expect(progress).toHaveBeenLastCalledWith('Packaged colmapview.yaml', paths.length, paths.length);
  });
  it('rejects known oversized datasets before opening any file and also counts ZIP overhead', async () => {
    const open = vi.fn().mockResolvedValue(new Blob(['data']));
    await expect(packageDriveArchive(prepared([{ path: 'large.sog', kind: 'splat', size: 1000, open }]), new AbortController().signal, () => {}, () => {}, 100)).rejects.toThrow('2 GiB');
    expect(open).not.toHaveBeenCalled();
    await expect(packageDriveArchive(prepared([asset('tiny.bin', 'x')]), new AbortController().signal, () => {}, () => {}, 5)).rejects.toThrow('2 GiB');
  });
  it('rejects source size changes and stops an aborted reader before packaging the next asset', async () => {
    const source = asset('file.bin', 'data'); source.size = 1;
    await expect(packageDriveArchive(prepared([source]), new AbortController().signal, () => {}, () => {})).rejects.toThrow('changed');
    const controller = new AbortController();
    const next = { ...asset('next.bin', 'next'), open: vi.fn() };
    await expect(packageDriveArchive(prepared([asset('first.bin', 'data'), next]), controller.signal,
      message => { if (message.startsWith('Packaged')) controller.abort(); }, () => {})).rejects.toThrow();
    expect(next.open).not.toHaveBeenCalled();
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
