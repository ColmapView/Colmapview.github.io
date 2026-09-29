import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCamera, buildImage, buildPoint3D, buildReconstruction, buildLoadedFiles, buildDatasetState, buildRigData,
  buildArchiveEntry, buildArchiveReader } from '../../test/builders';
import { setActiveZipArchive } from '../../utils/zipArchiveState';
import { clearZipCache } from '../../utils/zipImageFiles';
import { createIdentityEuler, createSim3dFromEuler, transformPoint } from '../../utils/sim3dTransforms';
import { parsePoints3DBinary } from '../../parsers/points3d';
import { parseImagesBinary } from '../../parsers/images';
import { checkAssetSize, preparePublication, type PublicationInput } from './preparePublication';
import { MAX_BUFFERED_PUBLICATION_FILE_BYTES } from './types';
import { publicationManifest, publicationMetadata } from './publicationMetadata';
import { publicationPath } from './publicationPaths';
import { parseDatasetViewerSettings } from '../../utils/datasetViewerSettings';
import { getManifestLoadSourceInfo } from '../../hooks/urlLoaderPolicy';
import { buildImageUrl, buildMaskUrlCandidates } from '../../utils/imageFileLookupPolicy';

function input(): PublicationInput {
  const original = new File(['original png bytes'], 'nested/photo.png', { type: 'image/png' });
  const image = buildImage({ name: 'nested/photo.png', points2D: [{ xy: [12, 13], point3DId: 1n }] });
  const reconstruction = buildReconstruction({ cameras: [buildCamera({ params: [600, 601, 320, 240] })], images: [image],
    points3D: [buildPoint3D({ xyz: [1, 2, 3], track: [{ imageId: 1, point2DIdx: 0 }] })], rigData: buildRigData() });
  return { reconstruction, source: null, sourceKey: 'local', modelRevision: 2,
    dataset: buildDatasetState({ sourceType: 'local', loadedFiles: buildLoadedFiles({ imageFiles: new Map([['nested/photo.png', original], ['photo.png', original]]) }) }),
    transform: { ...createIdentityEuler(), rotationZ: Math.PI / 2, translationX: 3 },
    splatTransform: { ...createIdentityEuler(), translationY: 4 }, config: {}, viewState: null, activeSplatId: null,
    appVersion: 'test', viewerBaseUrl: 'https://viewer.example/' };
}
const deps = () => ({ assertCurrent: vi.fn(), progress: vi.fn(), resolveRevision: vi.fn().mockResolvedValue('d'.repeat(40)),
  listFiles: vi.fn().mockResolvedValue([]) });
beforeEach(() => { vi.stubGlobal('Blob', NodeBlob); vi.stubGlobal('File', NodeFile); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('publication snapshot preparation', () => {
  it.each([MAX_BUFFERED_PUBLICATION_FILE_BYTES + 1, 1_240_001_532, 5 * 1024 ** 3])('keeps a %i-byte PLY as its original File without reading or copying it', async size => {
    const source = input();
    const file = new File(['ply'], 'large.ply');
    Object.defineProperty(file, 'size', { value: size });
    const read = vi.spyOn(file, 'arrayBuffer');
    const stream = vi.spyOn(file, 'stream');
    source.dataset.loadedFiles!.splatFileSources = [{ id: 'large', path: 'large.ply', file }];
    const prepared = await preparePublication(source, new AbortController().signal, deps());
    const asset = prepared.assets.find(asset => asset.kind === 'splat')!;
    expect(asset.size).toBe(size);
    expect(await asset.open(new AbortController().signal)).toBe(file);
    expect(read).not.toHaveBeenCalled();
    expect(stream).not.toHaveBeenCalled();
  });

  it('retains size validation and the buffering limit for other assets', () => {
    for (const size of [-1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => checkAssetSize(size, 'large.ply', 'splat')).toThrow('invalid size');
    }
    expect(() => checkAssetSize(MAX_BUFFERED_PUBLICATION_FILE_BYTES + 1, 'photo.png', 'image')).toThrow('128 MiB');
  });

  it('freezes the reviewed preview bytes and embeds their data revision in the README', async () => {
    const source = input();
    const reviewed = new Blob(['reviewed PNG'], { type: 'image/png' });
    source.preview = reviewed;
    const prepared = await preparePublication(source, new AbortController().signal, deps());
    source.preview = new Blob(['different PNG'], { type: 'image/png' });
    const asset = prepared.assets.find(asset => asset.kind === 'preview')!;
    expect(asset.path).toBe('colmapview-preview.png');
    expect(asset.size).toBe(reviewed.size);
    expect(await asset.open(new AbortController().signal)).toBe(reviewed);
    const inventory = prepared.assets.map(asset => ({ path: asset.path, size: asset.size! }));
    const files = publicationMetadata(prepared, { name: 'scene', title: 'Scene', description: '', license: 'cc0-1.0' }, 'owner/scene', 'd'.repeat(40), inventory);
    const readme = await files.find(file => file.path === 'README.md')!.content.text();
    expect(readme).toContain(`![Dataset preview](https://huggingface.co/datasets/owner/scene/resolve/${'d'.repeat(40)}/colmapview-preview.png)`);
    expect(readme).not.toContain('/resolve/main/');
    const listing = JSON.parse(await files.find(file => file.path === 'colmapview-inventory.json')!.content.text());
    expect(listing.files).toContainEqual({ path: 'colmapview-preview.png', size: reviewed.size });
    const controller = new AbortController(); controller.abort();
    await expect(asset.open(controller.signal)).rejects.toThrow();
  });

  it('refuses a preview that was not normalized to a nonempty PNG', async () => {
    const source = input();
    source.preview = new Blob(['image'], { type: 'image/jpeg' });
    await expect(preparePublication(source, new AbortController().signal, deps())).rejects.toThrow('preview image');
    source.preview = new Blob([], { type: 'image/png' });
    await expect(preparePublication(source, new AbortController().signal, deps())).rejects.toThrow('preview image');
  });

  it.each(['photo#1.jpg', 'photo?1.jpg', 'literal%20.jpg', 'images/nested/photo.jpg'])(
    'maps the original COLMAP name to the uploaded asset: %s', async name => {
      const source = input();
      source.reconstruction.images.get(1)!.name = name;
      source.dataset.loadedFiles!.imageFiles = new Map([[name, new File(['original bytes'], name)]]);
      const prepared = await preparePublication(source, new AbortController().signal, deps());
      const manifest = publicationManifest(prepared, 'owner/scene', 'd'.repeat(40), 'Scene');
      const loaded = getManifestLoadSourceInfo(manifest, { type: 'manifest' });
      // Resolve as the viewer does: an explicit mapping, otherwise imagesPath.
      const url = new URL(loaded.imageNameToUrl?.[name] || buildImageUrl(loaded.imageUrlBase!, name).url);
      expect(url.hash).toBe('');
      expect(url.search).toBe('');
      expect(decodeURIComponent(url.pathname)).toBe('/datasets/owner/scene/resolve/' + 'd'.repeat(40) + '/images/' + name);
      expect(prepared.assets.some(asset => asset.path === 'images/' + name)).toBe(true);
    },
  );
  it('preserves original bytes and observations while exporting edited geometry and rigs', async () => {
    const source = input();
    const prepared = await preparePublication(source, new AbortController().signal, deps());
    const assets = new Map(prepared.assets.map(asset => [asset.path, asset]));
    expect(prepared.assets.filter(asset => asset.kind === 'image')).toHaveLength(1);
    expect(await (await assets.get('images/nested/photo.png')!.open(new AbortController().signal)).text()).toBe('original png bytes');
    expect(assets.has('sparse/0/rigs.bin')).toBe(true);
    expect(assets.has('sparse/0/frames.bin')).toBe(true);
    const points = parsePoints3DBinary(await (await assets.get('sparse/0/points3D.bin')!.open(new AbortController().signal)).arrayBuffer());
    const expected = transformPoint(createSim3dFromEuler(source.transform), [1, 2, 3]);
    points.get(1n)!.xyz.forEach((value, index) => expect(value).toBeCloseTo(expected[index]));
    expect(points.get(1n)!.track).toEqual([{ imageId: 1, point2DIdx: 0 }]);
    const images = parseImagesBinary(await (await assets.get('sparse/0/images.bin')!.open(new AbortController().signal)).arrayBuffer());
    expect(images.get(1)!.points2D).toEqual([{ xy: [12, 13], point3DId: 1n }]);
    expect(prepared.viewerState.config.transform).toEqual(createIdentityEuler());
    const splatPosition = transformPoint(createSim3dFromEuler(prepared.viewerState.config.splat!.transform!), [0, 0, 0]);
    expect(splatPosition[0]).toBeCloseTo(-1);
    expect(source.reconstruction.points3D!.get(1n)!.xyz).toEqual([1, 2, 3]);
    const yaml = await (await assets.get('colmapview.yaml')!.open(new AbortController().signal)).text();
    expect(parseDatasetViewerSettings(yaml)).toEqual(prepared.viewerState);
    expect(prepared.assets.filter(asset => asset.kind === 'viewer-state').map(asset => asset.path)).toEqual(['colmapview.yaml']);
  });

  it('publishes the valid viewer settings when one saved setting no longer validates', async () => {
    const source = input();
    source.config = { pointCloud: { pointSize: 2, colorMode: 'retired-mode' } };
    const prepared = await preparePublication(source, new AbortController().signal, deps());
    expect(prepared.viewerState.config.pointCloud).toEqual({ pointSize: 2 });
  });

  it('requires every original image instead of silently publishing an incomplete dataset', async () => {
    const source = input(); source.dataset.loadedFiles!.imageFiles.clear();
    await expect(preparePublication(source, new AbortController().signal, deps())).rejects.toThrow('Could not retrieve');
  });

  it('includes available masks and every splat, preserving the active selection and original bytes', async () => {
    const source = input();
    const mask = new File(['mask'], 'photo.png.png');
    const first = new File(['first splat'], 'first.ply');
    const second = new File(['second splat'], 'second.ply');
    source.dataset.loadedFiles!.imageFiles.set('masks/nested/photo.png.png', mask);
    source.dataset.loadedFiles!.splatFileSources = [
      { id: 'first', path: first.name, file: first }, { id: 'second', path: second.name, file: second },
    ];
    source.activeSplatId = 'second';
    const signal = new AbortController().signal;
    const prepared = await preparePublication(source, signal, deps());
    const assets = new Map(prepared.assets.map(asset => [asset.path, asset]));
    expect(await assets.get('masks/nested/photo.png.png')!.open(signal)).toBe(mask);
    expect(await assets.get('splats/first.ply')!.open(signal)).toBe(first);
    expect(await assets.get('splats/second.ply')!.open(signal)).toBe(second);
    expect(prepared.splatPaths).toEqual(['splats/first.ply', 'splats/second.ply']);
    expect(prepared.viewerState.config.splat?.activeSourceId).toBe('splats/second.ply');
    expect(publicationManifest(prepared, 'owner/scene', 'd'.repeat(40), 'Scene').skipImages).toBe(false);
  });

  it('publishes masks where the viewer looks for them, even for names under images/', async () => {
    const source = input();
    const name = 'images/nested/photo.png';
    source.reconstruction.images.get(1)!.name = name;
    source.dataset.loadedFiles!.imageFiles = new Map([[name, new File(['original'], name)], ['masks/nested/photo.png.png', new File(['mask'], 'photo.png.png')]]);
    const prepared = await preparePublication(source, new AbortController().signal, deps());
    const mask = prepared.assets.find(asset => asset.kind === 'mask')!;
    const { maskUrlBase } = getManifestLoadSourceInfo(publicationManifest(prepared, 'owner/scene', 'd'.repeat(40), 'Scene'), { type: 'manifest' });
    expect(buildMaskUrlCandidates(maskUrlBase!, name).map(candidate => candidate.url))
      .toContain(`https://huggingface.co/datasets/owner/scene/resolve/${'d'.repeat(40)}/${mask.path}`);
  });

  const remoteSource = () => {
    const source = input(); source.dataset.sourceType = 'url';
    source.dataset.imageUrlBase = 'https://huggingface.co/datasets/owner/source/resolve/main/images/';
    source.dataset.maskUrlBase = 'https://huggingface.co/datasets/owner/source/resolve/main/masks/';
    return source;
  };

  it('finds a remote mask under any name the viewer accepts', async () => {
    const source = remoteSource();
    const hooks = deps(); hooks.listFiles.mockResolvedValue([{ path: 'masks/nested/photo.png', size: 10 }]);
    const maskUrl = `https://huggingface.co/datasets/owner/source/resolve/${'d'.repeat(40)}/masks/nested/photo.png`;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url === maskUrl ? new Response('mask bytes') : new Response(null, { status: 404 })));
    const prepared = await preparePublication(source, new AbortController().signal, hooks);
    const mask = prepared.assets.find(asset => asset.kind === 'mask');
    expect(mask).toMatchObject({ path: 'masks/nested/photo.png.png', size: 10 });
    expect(await (await mask!.open(new AbortController().signal)).text()).toBe('mask bytes');
  });

  it('checks remote masks with one folder listing instead of a request per image', async () => {
    const source = remoteSource();
    source.reconstruction.images.set(2, buildImage({ imageId: 2, name: 'b.jpg' }));
    source.reconstruction.images.set(3, buildImage({ imageId: 3, name: 'c.jpg' }));
    const hooks = deps();
    hooks.listFiles.mockResolvedValue([{ path: 'masks/nested/photo.png.png', size: 4 }, { path: 'masks/b.jpg.png', size: 5 }]);
    const request = vi.fn(); vi.stubGlobal('fetch', request);
    const prepared = await preparePublication(source, new AbortController().signal, hooks);
    expect(request).not.toHaveBeenCalled();
    expect(hooks.listFiles).toHaveBeenCalledOnce();
    expect(hooks.listFiles).toHaveBeenCalledWith('owner/source', 'd'.repeat(40), 'masks', expect.any(AbortSignal));
    expect(prepared.assets.filter(asset => asset.kind === 'mask').map(({ path, size }) => ({ path, size }))).toEqual([
      { path: 'masks/nested/photo.png.png', size: 4 }, { path: 'masks/b.jpg.png', size: 5 },
    ]);
  });

  it('extracts archive masks only when uploading them', async () => {
    const source = input(); source.dataset.sourceType = 'zip';
    const mask = new File(['mask'], 'photo.png.png');
    const extractMask = vi.fn().mockResolvedValue(mask);
    const index = new Map([
      ['nested/photo.png', buildArchiveEntry({ name: 'nested/photo.png', size: 8, extract: async () => new File(['original'], 'photo.png') })],
      ['masks/nested/photo.png.png', buildArchiveEntry({ name: 'masks/nested/photo.png.png', size: mask.size, extract: extractMask })],
    ]);
    setActiveZipArchive(buildArchiveReader(), index);
    try {
      const prepared = await preparePublication(source, new AbortController().signal, deps());
      expect(extractMask).not.toHaveBeenCalled();
      const asset = prepared.assets.find(item => item.kind === 'mask')!;
      expect(asset.size).toBe(mask.size);
      expect(await asset.open(new AbortController().signal)).toBe(mask);
      expect(extractMask).toHaveBeenCalledOnce();
    } finally { clearZipCache(); }
  });

  it('downloads a remote original from the URL the viewer uses for names under images/', async () => {
    const source = input(); source.dataset.sourceType = 'url';
    source.dataset.imageUrlBase = 'https://huggingface.co/datasets/owner/source/resolve/main/images/';
    source.reconstruction.images.get(1)!.name = 'images/nested/photo.png';
    const prepared = await preparePublication(source, new AbortController().signal, deps());
    const request = vi.fn().mockResolvedValue(new Response('remote original')); vi.stubGlobal('fetch', request);
    await prepared.assets.find(asset => asset.kind === 'image')!.open(new AbortController().signal);
    expect(request.mock.calls[0][0]).toBe(`https://huggingface.co/datasets/owner/source/resolve/${'d'.repeat(40)}/images/nested/photo.png`);
  });

  it('stops when the live reconstruction changes during preparation', async () => {
    const hooks = deps(); hooks.assertCurrent.mockImplementationOnce(() => undefined).mockImplementation(() => { throw new Error('changed'); });
    await expect(preparePublication(input(), new AbortController().signal, hooks)).rejects.toThrow('changed');
  });

  it('pins supported remote originals and refuses arbitrary source hosts', async () => {
    const source = input(); source.dataset.sourceType = 'url'; source.dataset.imageUrlBase = 'https://huggingface.co/datasets/owner/source/resolve/main/images/';
    const hooks = deps();
    const prepared = await preparePublication(source, new AbortController().signal, hooks);
    const request = vi.fn().mockResolvedValue(new Response('remote original')); vi.stubGlobal('fetch', request);
    await prepared.assets.find(asset => asset.kind === 'image')!.open(new AbortController().signal);
    expect(request.mock.calls[0][0]).toContain('/resolve/' + 'd'.repeat(40) + '/images/nested/photo.png');
    expect(request.mock.calls[0][1].credentials).toBe('omit');
    source.dataset.imageUrlBase = 'https://arbitrary.example/images/';
    await expect(preparePublication(source, new AbortController().signal, deps())).rejects.toThrow('locally');
  });

  it('keeps downloading a slow remote original while bytes keep arriving', async () => {
    const source = input(); source.dataset.sourceType = 'url'; source.dataset.imageUrlBase = 'https://huggingface.co/datasets/owner/source/resolve/main/images/';
    const prepared = await preparePublication(source, new AbortController().signal, deps());
    vi.useFakeTimers();
    // Route timeout signals through the fake clock.
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('The operation timed out.', 'TimeoutError')), ms);
      return controller.signal;
    });
    // Like fetch, an aborted request errors its body. Ten bytes arrive every 30 seconds for two minutes.
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        init.signal!.addEventListener('abort', () => controller.error(init.signal!.reason));
        let sent = 0;
        const next = () => {
          if (init.signal!.aborted) return;
          controller.enqueue(new Uint8Array(10));
          if (++sent < 4) setTimeout(next, 30_000); else controller.close();
        };
        setTimeout(next, 30_000);
      },
    }))));
    const settled = prepared.assets.find(asset => asset.kind === 'image')!.open(new AbortController().signal)
      .then(blob => blob.size, (error: unknown) => error);
    await vi.advanceTimersByTimeAsync(150_000);
    expect(await settled).toBe(40);
  });

  it('pins the manifest to D while the README links the viewer to the dataset page', async () => {
    const prepared = await preparePublication(input(), new AbortController().signal, deps());
    const files = publicationMetadata(prepared, { name: 'scene', title: 'Scene', description: 'Example', license: 'cc-by-4.0' }, 'owner/scene', 'd'.repeat(40), []);
    const manifest = JSON.parse(await files.find(file => file.path === 'colmapview.json')!.content.text());
    expect(manifest.baseUrl).toContain('/resolve/' + 'd'.repeat(40) + '/');
    expect(manifest.viewerStatePath).toBe('colmapview.yaml');
    const readme = await files.find(file => file.path === 'README.md')!.content.text();
    const url = /\[Open in ColmapView\]\(([^)]+)\)/.exec(readme)![1];
    expect(new URL(url).searchParams.get('url')).toBe('https://huggingface.co/datasets/owner/scene');
    expect(new URL(url).hash).toBe('');
    expect(readme).toContain('colmapview.yaml');
  });

  it.each(['../secret', '/absolute', 'a/../b', 'C:\\file', 'a//b', 'bad\nfile'])('rejects unsafe asset path %s', path => {
    expect(() => publicationPath(path)).toThrow('filename');
  });
});
