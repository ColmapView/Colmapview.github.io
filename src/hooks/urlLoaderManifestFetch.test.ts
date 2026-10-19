import { describe, expect, it, vi } from 'vitest';
import { buildFile } from '../test/builders';
import type { ColmapManifest, UrlLoadError } from '../types/manifest';
import { createDefaultManifest } from './urlLoaderPolicy';
import { prepareNativeMedia } from '../dataset/nativeMedia';
import { buildCamera, buildImage } from '../test/builders';
import {
  deriveMasksPathFromImages,
  discoverDirectoryListingSplatPaths,
  discoverHuggingFaceSplatPaths,
  discoverManifestSplatCatalog,
  fetchManifestColmapFiles,
  fetchManifestFile,
  fetchUrlManifest,
  withDiscoveredColmapPaths,
} from './urlLoaderManifestFetch';

const manifest: ColmapManifest = {
  version: 1,
  name: 'test scene',
  baseUrl: 'https://example.com/dataset',
  files: {
    cameras: 'custom/cameras.bin',
    images: 'custom/images.bin',
    points3D: 'custom/points3D.bin',
    rigs: 'custom/rigs.bin',
    frames: 'custom/frames.bin',
  },
};

it('honors an explicitly empty splat selection without listing the manifest host', async () => {
  const fetchImpl = vi.fn();
  expect(await discoverManifestSplatCatalog({ ...manifest, splats: [] }, { fetchImpl })).toEqual([]);
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('does not probe a Hugging Face resolve directory when the tree has no splats', async () => {
  const base = 'https://huggingface.co/datasets/owner/preprocessing/resolve/revision/scene';
  const fetchImpl = vi.fn(async () => jsonResponse([]));
  expect(await discoverManifestSplatCatalog({ ...manifest, baseUrl: base }, { fetchImpl })).toEqual([]);
  expect(fetchImpl.mock.calls).toEqual([['https://huggingface.co/api/datasets/owner/preprocessing/tree/revision/scene?recursive=true']]);
});

function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

it('fetches only declared camera-only model files and retains the explicit media listing', async () => {
  const cameraOnly: ColmapManifest={version:1,baseUrl:'https://models.test/pinned',files:{cameras:'cameras.bin',images:'images.bin'},
    images:['https://photos.test/cam/a.png?key=one%2Ftwo'],masks:['masks/cam/a.jpg.png'],maskRole:'validity'};
  const fetchFile=vi.fn(async (_base:string,path:string)=>buildFile(path));
  const files=await fetchManifestColmapFiles(cameraOnly,{fetchFile,setUrlProgress:vi.fn()});
  expect(fetchFile.mock.calls.map(call=>call[1])).toEqual(['cameras.bin','images.bin']);
  const context=await prepareNativeMedia(files,files.get('sparse/0/cameras.bin')!,new Map([[1,buildCamera()]]),new Map([[1,buildImage({name:'cam/a.jpg'})]]));
  expect(context?.bindings.get('cam/a.jpg')).toMatchObject({sourceImagePath:'https://photos.test/cam/a.png?key=one%2Ftwo',mask:{path:'masks/cam/a.jpg.png',role:'validity'}});
});
it('does not turn a declared missing points file into an empty model', async () => {
  const fetchFile=vi.fn(async (_base:string,path:string)=>{if(path.includes('points3D'))throw {type:'not_found',message:'Missing declared points file'};return buildFile(path);});
  await expect(fetchManifestColmapFiles(manifest,{fetchFile,setUrlProgress:vi.fn()})).rejects.toMatchObject({type:'not_found',message:'Missing declared points file'});
});

it.each([
  {name:'explicit masks in an arbitrary directory', images:['photos/cam/a.jpg'], masks:['annotations/cam/a.png'], maskRole:'foreground' as const, expectedMask:'annotations/cam/a.png'},
  {name:'a mask prefix alongside an explicit image list', images:['photos/cam/a.jpg'], masksPath:'annotations/', expectedMask:'https://models.test/pinned/annotations/cam/a.jpg.png'},
  {name:'explicit photos in a directory with an auxiliary-looking name', images:['segmentation/cam/a.jpg'], masks:['annotations/cam/a.png'], maskRole:'foreground' as const, expectedMask:'annotations/cam/a.png'},
])('honors $name without losing original manifest behavior',async ({name: _name,expectedMask,...media})=>{
  const input:ColmapManifest={version:1,baseUrl:'https://models.test/pinned/',files:{cameras:'cameras.bin',images:'images.bin',points3D:'points3D.bin'},...media};
  const files=await fetchManifestColmapFiles(input,{fetchFile:async (_base,path)=>buildFile(path),setUrlProgress:vi.fn()});
  const context=await prepareNativeMedia(files,files.get('sparse/0/cameras.bin')!,new Map([[1,buildCamera()]]),new Map([[1,buildImage({name:'cam/a.jpg'})]]));
  expect(context?.bindings.get('cam/a.jpg')?.sourceImagePath).toBe(media.images[0]);
  expect(context?.bindings.get('cam/a.jpg')?.mask).toMatchObject({kind:'file',path:expectedMask});
});

it('bounds a discovered image mapping CSV before reading its body', async () => {
  const cancel = vi.fn();
  const response = new Response(new ReadableStream({ cancel }), { headers: { 'Content-Length': String(17 * 1024 * 1024) } });
  const base = 'https://huggingface.co/datasets/x/y/resolve/main/ds';
  const paths = ['colmap/cameras.bin', 'colmap/images.bin', 'colmap/points3D.bin', 'colmap/image_mapping.csv', 'images/a.jpg'];
  const fetchImpl = vi.fn(async (url: string) => url.includes('/api/datasets/')
    ? jsonResponse(paths.map(path => ({ type: 'file', path: 'ds/' + path, size: 100 }))) : response);
  const discovered = await withDiscoveredColmapPaths(createDefaultManifest(base), { fetchImpl });
  expect(discovered.imageNameToPath).toBeUndefined();
  expect(discovered.imagesPath).toBe('images/');
  expect(cancel).toHaveBeenCalledOnce();
});

for (const mode of ['relative', 'absolute', 'signed'] as const) for (const ownMask of [false, true]) for (const peerMask of [false, true]) {
  it(`discovered mask prefixes follow mapped photos: ${mode}, own mask ${ownMask}, peer mask ${peerMask}`, async () => {
    const base = 'https://huggingface.co/datasets/audit/shared-masks/resolve/pinned/';
    const own = 'dozer/masks/cam/a.jpg.png', peer = 'poster/masks/cam/a.jpg.png', photo = 'poster/images/cam/a.jpg';
    const mapped = mode === 'relative' ? photo : base + photo + (mode === 'signed' ? '?token=exact%2Fvalue' : '');
    const paths = ['dozer/sparse/0/cameras.bin', 'dozer/sparse/0/images.bin', 'dozer/sparse/0/points3D.bin',
      'poster/sparse/0/cameras.bin', 'poster/sparse/0/images.bin', 'dozer/images/cam/a.jpg', photo, 'dozer/image_mapping.csv',
      ...(ownMask ? [own] : []), ...(peerMask ? [peer] : [])];
    const fetchImpl = vi.fn(async (url: string) => url.includes('/api/datasets/')
      ? jsonResponse(paths.map(path => ({ type: 'file', path, size: 100 })))
      : new Response('colmap_image,raw_path\ncam/a.jpg,' + mapped + '\n'));
    const manifest = await withDiscoveredColmapPaths(createDefaultManifest(base), { fetchImpl });
    const files = await fetchManifestColmapFiles(manifest, { fetchFile: async (_base, path) => buildFile(path), setUrlProgress: vi.fn() });
    const context = await prepareNativeMedia(files, files.get('sparse/0/cameras.bin')!, new Map([[1, buildCamera()]]),
      new Map([[1, buildImage({ name: 'cam/a.jpg' })]]));
    expect(context?.bindings.get('cam/a.jpg')?.sourceImagePath).toBe(mapped);
    if (peerMask) expect(context?.bindings.get('cam/a.jpg')?.mask).toMatchObject({ path: peer, role: 'validity' });
    else expect(context?.bindings.get('cam/a.jpg')?.mask).toBeUndefined();
  });
}

function textResponse(data: string, init: ResponseInit = {}): Response {
  return new Response(data, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
    ...init,
  });
}

function missingResponse(): Response {
  return new Response('', { status: 404, statusText: 'Missing' });
}

describe('URL loader manifest fetch helpers', () => {
  it('fetches model files independently of splat discovery and activation', async () => {
    const fetchImpl = vi.fn();
    const fetchFile = vi.fn(async (_base: string, path: string) => buildFile(path));
    const files = await fetchManifestColmapFiles({ ...manifest, splats: ['splats/a.spz', 'splats/b.spz'] }, {
      fetchImpl, fetchFile, setUrlProgress: vi.fn(), log: vi.fn(),
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(fetchFile.mock.calls.map(([, path]) => path).filter(path => path.endsWith('.spz'))).toEqual([]);
    expect(files.has('sparse/0/points3D.bin')).toBe(true);
  });

  it('catalogues explicit splats using bounded metadata requests without full file downloads', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe('HEAD');
      return new Response(null, { headers: { 'content-length': '2000000000' } });
    });
    const classifySplatUrl = vi.fn(async () => ({ isSplat: true, splatCount: null }));
    const catalog = await discoverManifestSplatCatalog({ ...manifest, splats: ['splats/a.spz', 'splats/b.spz'] }, {
      fetchImpl, classifySplatUrl,
    });
    expect(catalog.map(candidate => [candidate.path, candidate.size])).toEqual([
      ['splats/a.spz', 2_000_000_000], ['splats/b.spz', 2_000_000_000],
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([
    [404, false], [410, false], [405, true], [403, true],
  ] as const)('lists an explicit splat whose size check answers %i: %s', async (status, listed) => {
    const fetchImpl = vi.fn(async (url: string) => url.endsWith('gone.spz')
      ? new Response(null, { status }) : new Response(null, { headers: { 'content-length': '1000' } }));
    const log = vi.fn();
    const catalog = await discoverManifestSplatCatalog({ ...manifest, splats: ['splats/live.spz', 'splats/gone.spz'] }, {
      fetchImpl, log, classifySplatUrl: vi.fn(async () => ({ isSplat: true, splatCount: null })),
    });
    expect(catalog.map(candidate => candidate.path).sort()).toEqual(listed ? ['splats/gone.spz', 'splats/live.spz'] : ['splats/live.spz']);
    if (!listed) expect(log).toHaveBeenCalledWith('[URL Loader] Optional file not found: splats/gone.spz');
  });

  const gaussianPlyHeader = [
    'ply', 'format binary_little_endian 1.0', 'element vertex 3',
    'property float x', 'property float y', 'property float z',
    'property float f_dc_0', 'property float f_dc_1', 'property float f_dc_2',
    'property float opacity', 'property float scale_0', 'property float scale_1',
    'property float scale_2', 'property float rot_0', 'property float rot_1',
    'property float rot_2', 'property float rot_3', 'end_header', '',
  ].join('\n');

  it.each([
    ['splats/scene.ply', 200], ['splats/scene.ply', 206], ['splats/scene.spz', 200], ['splats/scene.spz', 206],
  ] as const)('keeps an explicit %s whose HEAD answers 404 while its GET answers %i, at an unknown size', async (path, getStatus) => {
    // Some file routes serve only GET and answer HEAD with 404.
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'HEAD'
      ? new Response(null, { status: 404 }) : new Response(gaussianPlyHeader, { status: getStatus }));
    const log = vi.fn();
    const catalog = await discoverManifestSplatCatalog({ ...manifest, splats: [path] }, { fetchImpl, log });
    expect(catalog).toEqual([{ path, size: 0, splatCount: path.endsWith('.ply') ? 3 : null }]);
    expect(log).not.toHaveBeenCalledWith(`[URL Loader] Optional file not found: ${path}`);
    // A .ply's header read already answered; a .spz is confirmed with one byte.
    const gets = fetchImpl.mock.calls.filter(([, init]) => init?.method !== 'HEAD');
    expect(gets).toHaveLength(1);
    if (path.endsWith('.spz')) expect(new Headers(gets[0][1]?.headers).get('Range')).toBe('bytes=0-0');
  });

  it.each([
    ['splats/scene.ply', 404], ['splats/scene.ply', 410], ['splats/scene.spz', 404], ['splats/scene.spz', 410],
  ] as const)('leaves out an explicit %s whose HEAD and GET both answer %i', async (path, status) => {
    const fetchImpl = vi.fn(async (url: string) => url.endsWith('live.spz')
      ? new Response(null, { headers: { 'content-length': '1000' } }) : new Response(null, { status }));
    const log = vi.fn();
    const catalog = await discoverManifestSplatCatalog({ ...manifest, splats: [path, 'splats/live.spz'] }, {
      fetchImpl, log,
    });
    expect(catalog.map(candidate => candidate.path)).toEqual(['splats/live.spz']);
    expect(log).toHaveBeenCalledWith(`[URL Loader] Optional file not found: ${path}`);
  });
  it('fetches and validates a manifest while reporting progress', async () => {
    const setUrlProgress = vi.fn();
    const fetchImpl = vi.fn(async () => jsonResponse(manifest));

    await expect(fetchUrlManifest('https://example.com/manifest.json', {
      fetchImpl,
      setUrlProgress,
    })).resolves.toEqual(manifest);

    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/manifest.json');
    expect(setUrlProgress).toHaveBeenNthCalledWith(1, { percent: 2, message: 'Fetching manifest...' });
    expect(setUrlProgress).toHaveBeenNthCalledWith(2, { percent: 5, message: 'Manifest loaded' });
  });

  it('classifies manifest fetch status failures', async () => {
    const setUrlProgress = vi.fn();
    const fetchImpl = vi.fn(async () => jsonResponse({}, { status: 404, statusText: 'Missing' }));

    await expect(fetchUrlManifest('https://example.com/missing.json', {
      fetchImpl,
      setUrlProgress,
    })).rejects.toMatchObject({
      type: 'not_found',
      message: 'Failed to fetch manifest (404)',
      details: 'Missing',
      failedFile: 'https://example.com/missing.json',
    });
  });

  it('rejects invalid manifest JSON with schema details', async () => {
    const setUrlProgress = vi.fn();
    const fetchImpl = vi.fn(async () => jsonResponse({
      version: 1,
      baseUrl: 'not-a-url',
      files: { cameras: '', images: 'images.bin', points3D: 'points3D.bin' },
    }));

    await expect(fetchUrlManifest('https://example.com/manifest.json', {
      fetchImpl,
      setUrlProgress,
    })).rejects.toMatchObject({
      type: 'invalid_manifest',
      message: 'Invalid manifest format',
      failedFile: 'https://example.com/manifest.json',
    });
  });

  it('fetches a manifest-relative file and preserves the URL filename', async () => {
    const fetchImpl = vi.fn(async () => new Response('camera', {
      headers: { 'Content-Type': 'application/octet-stream' },
    }));

    const file = await fetchManifestFile(
      'https://example.com/dataset',
      'sparse/0/cameras.bin',
      { fetchImpl }
    );

    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/dataset/sparse/0/cameras.bin');
    expect(file.name).toBe('cameras.bin');
    expect(file.type).toBe('application/octet-stream');
  });

  it('downloads required files, keeps optional successes, and ignores optional failures', async () => {
    const setUrlProgress = vi.fn();
    const log = vi.fn();
    const fetchImpl = vi.fn(async () => missingResponse());
    const fetchFile = vi.fn(async (_baseUrl: string, path: string) => {
      if (path === 'custom/frames.bin') {
        throw new Error('optional missing');
      }
      return buildFile(path.split('/').pop() ?? path);
    });

    const files = await fetchManifestColmapFiles(manifest, {
      fetchImpl,
      fetchFile,
      log,
      setUrlProgress,
    });

    expect([...files.keys()]).toEqual([
      'sparse/0/cameras.bin',
      'sparse/0/images.bin',
      'sparse/0/points3D.bin',
      'sparse/0/rigs.bin',
    ]);
    expect(fetchFile).toHaveBeenCalledTimes(5);
    expect(setUrlProgress).toHaveBeenCalledWith({
      percent: 5,
      message: 'Downloading COLMAP files...',
      filesDownloaded: 0,
      totalFiles: 3,
    });
    expect(setUrlProgress).toHaveBeenCalledWith(expect.objectContaining({
      percent: 30,
      currentFile: 'custom/points3D.bin',
      filesDownloaded: 3,
      totalFiles: 3,
    }));
    expect(log).toHaveBeenCalledWith('[URL Loader] Optional file loaded: custom/rigs.bin');
    expect(log).toHaveBeenCalledWith('[URL Loader] Optional file not found: custom/frames.bin');
  });

  it('does not auto-load any splat when multiple are discovered, but surfaces the catalog', async () => {
    const log = vi.fn();
    const baseUrl = 'https://huggingface.co/datasets/OpsiClear/NGS/resolve/main/objects/scan_toy';
    const fetchImpl = vi.fn(async () => jsonResponse([
      { type: 'directory', path: 'objects/scan_toy/images', size: 0 },
      { type: 'file', path: 'objects/scan_toy/inside_gaussians.ply', size: 52_347_387 },
      { type: 'file', path: 'objects/scan_toy/output/surface_gaussians.ply', size: 128_935_787 },
      { type: 'file', path: 'objects/scan_toy/3dgs/surface_gaussians.ply', size: 178_935_787 },
      { type: 'file', path: 'objects/scan_toy/folder/folder/folder/surface_gaussians.ply', size: 228_935_787 },
      { type: 'file', path: 'objects/scan_toy/splats/surface_gaussians.spz', size: 40_000_000 },
    ]));
    const catalog = await discoverManifestSplatCatalog({
      ...manifest,
      baseUrl,
      splats: undefined,
    }, {
      fetchImpl,
      log,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://huggingface.co/api/datasets/OpsiClear/NGS/tree/main/objects/scan_toy?recursive=true'
    );
    // All five tiles remain selectable without transferring full splat files.
    expect(catalog.map(candidate => candidate.path)).toEqual([
      'splats/surface_gaussians.spz',
      'folder/folder/folder/surface_gaussians.ply',
      '3dgs/surface_gaussians.ply',
      'output/surface_gaussians.ply',
      'inside_gaussians.ply',
    ]);
    // Discovery reports the catalog; activation waits for saved settings in the source loader.
    expect(log).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('[URL Loader] Discovered 5 Hugging Face splat files:'));
  });

  it('discovers all generic directory-listing splats recursively', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        const sizes = new Map([
          ['https://example.com/dataset/root_gaussians.ply', 10],
          ['https://example.com/dataset/root_gaussians.spz', 5],
          ['https://example.com/dataset/output/surface_gaussians.ply', 100],
          ['https://example.com/dataset/3dgs/model.ply', 200],
          ['https://example.com/dataset/folder/folder/folder/deep_gaussians.ply', 300],
        ]);
        const size = sizes.get(url);
        return size === undefined
          ? missingResponse()
          : new Response(null, { headers: { 'content-length': String(size) } });
      }

      if (url === 'https://example.com/dataset/') {
        return textResponse(`
          <a href="root_gaussians.ply">root</a>
          <a href="root_gaussians.spz">root compressed</a>
          <a href="output/">output</a>
          <a href="3dgs/">3dgs</a>
          <a href="folder/">folder</a>
        `);
      }
      if (url === 'https://example.com/dataset/output/') {
        return textResponse('<a href="surface_gaussians.ply">surface</a>');
      }
      if (url === 'https://example.com/dataset/3dgs/') {
        return textResponse('<a href="model.ply">model</a>');
      }
      if (url === 'https://example.com/dataset/folder/') {
        return textResponse('<a href="folder/">folder</a>');
      }
      if (url === 'https://example.com/dataset/folder/folder/') {
        return textResponse('<a href="folder/">folder</a>');
      }
      if (url === 'https://example.com/dataset/folder/folder/folder/') {
        return textResponse('<a href="deep_gaussians.ply">deep</a>');
      }

      return missingResponse();
    });

    await expect(discoverDirectoryListingSplatPaths('https://example.com/dataset', {
      fetchImpl,
    })).resolves.toEqual([
      { path: 'root_gaussians.spz', size: 5 },
      { path: 'folder/folder/folder/deep_gaussians.ply', size: 300 },
      { path: '3dgs/model.ply', size: 200 },
      { path: 'output/surface_gaussians.ply', size: 100 },
      { path: 'root_gaussians.ply', size: 10 },
    ]);
  });

  it('discovers generic directory-listing splats without auto-downloading when multiple', async () => {
    const log = vi.fn();
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        const size = url.endsWith('/output/model.spz')
            ? 50
            : 200;
        return new Response(null, { headers: { 'content-length': String(size) } });
      }

      if (url === 'https://example.com/dataset/') {
        return textResponse('<a href="output/">output</a><a href="3dgs/">3dgs</a>');
      }
      if (url === 'https://example.com/dataset/output/') {
        return textResponse('<a href="model.spz">surface</a>');
      }
      if (url === 'https://example.com/dataset/3dgs/') {
        return textResponse('<a href="model.ply">model</a>');
      }

      return missingResponse();
    });
    const catalog = await discoverManifestSplatCatalog({
      ...manifest,
      files: {
        cameras: 'sparse/0/cameras.bin',
        images: 'sparse/0/images.bin',
        points3D: 'sparse/0/points3D.bin',
      },
      splats: undefined,
    }, {
      fetchImpl,
      log,
    });

    expect(catalog).toEqual([
      { path: 'output/model.spz', size: 50 },
      { path: '3dgs/model.ply', size: 200 },
    ]);
    expect(log).toHaveBeenCalledExactlyOnceWith(
      '[URL Loader] Discovered 2 directory splat files: output/model.spz (50 bytes), 3dgs/model.ply (200 bytes)'
    );
  });

  it('keeps explicit manifest splats instead of querying Hugging Face discovery', async () => {
    const log = vi.fn();
    const baseUrl = 'https://huggingface.co/datasets/OpsiClear/NGS/resolve/main/objects/scan_toy';
    const fetchImpl = vi.fn(async () => jsonResponse([]));
    const catalog = await discoverManifestSplatCatalog({
      ...manifest,
      baseUrl,
      splats: ['manual_splat.ply'],
    }, {
      fetchImpl,
      log,
      classifySplatUrl: async () => ({ isSplat: true, splatCount: null }),
    });

    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(`${baseUrl}/manual_splat.ply`, { method: 'HEAD' });
    expect(catalog).toEqual([{ path: 'manual_splat.ply', size: 0, splatCount: null }]);
  });

  it('rethrows required file UrlLoadError values without reclassification', async () => {
    const setUrlProgress = vi.fn();
    const fetchImpl = vi.fn(async () => missingResponse());
    const expectedError: UrlLoadError = {
      type: 'not_found',
      message: 'missing file',
      failedFile: 'https://example.com/dataset/custom/images.bin',
    };
    const fetchFile = vi.fn(async (_baseUrl: string, path: string) => {
      if (path === 'custom/images.bin') {
        throw expectedError;
      }
      return buildFile(path);
    });

    await expect(fetchManifestColmapFiles(manifest, {
      fetchImpl,
      fetchFile,
      setUrlProgress,
    })).rejects.toBe(expectedError);
  });

  it('classifies malformed required file errors instead of trusting a type field alone', async () => {
    const setUrlProgress = vi.fn();
    const fetchImpl = vi.fn(async () => missingResponse());
    const fetchFile = vi.fn(async (_baseUrl: string, path: string) => {
      if (path === 'custom/images.bin') {
        throw { type: 'not_found' };
      }
      return buildFile(path);
    });

    await expect(fetchManifestColmapFiles(manifest, {
      fetchImpl,
      fetchFile,
      setUrlProgress,
    })).rejects.toMatchObject({
      type: 'unknown',
      message: '[object Object]',
      failedFile: 'https://example.com/dataset/custom/images.bin',
    });
  });
});

describe('splat discovery robustness', () => {
  const HF_BASE = 'https://huggingface.co/datasets/x/y/resolve/main/ds';
  const HF_API = 'https://huggingface.co/api/datasets/x/y/tree/main/ds?recursive=true';
  const pointCloudHeader = [
    'ply', 'format binary_little_endian 1.0', 'element vertex 17',
    'property float x', 'property float y', 'property float z',
  ].join('\n');
  const gaussianProperties = [
    'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2',
    'rot_0', 'rot_1', 'rot_2', 'rot_3',
  ].map(name => `property float ${name}`).join('\n');

  it.each([200, 206])('clips an oversized single-chunk %s PLY response to the requested range', async status => {
    // Splat-only properties outside the requested bytes must not affect classification.
    const prefix = `${pointCloudHeader}\ncomment `.padEnd(65536, ' ');
    const oversizedChunk = new TextEncoder().encode(`${prefix}\n${gaussianProperties}\nend_header\n`);
    const cancel = vi.fn();
    const pull = vi.fn((controller: ReadableStreamDefaultController<Uint8Array>) => controller.close());
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(oversizedChunk); }, pull, cancel,
    }, { highWaterMark: 0 });
    const fetchImpl = vi.fn(async (url: string, _init?: RequestInit) => url === HF_API
      ? jsonResponse([{ type: 'file', path: 'ds/scene.ply', size: 9_000_000_000 }])
      : new Response(body, { status }));

    expect(await discoverHuggingFaceSplatPaths(HF_BASE, { fetchImpl })).toEqual([]);
    expect(cancel).toHaveBeenCalledOnce();
    expect(pull).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledWith(`${HF_BASE}/scene.ply`, { headers: { Range: 'bytes=0-65535' } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([200, 206])('stops a %s PLY probe at a split CRLF header terminator and retains its vertex count', async status => {
    const header = `${pointCloudHeader}\n${gaussianProperties}\n`.replaceAll('\n', '\r\n');
    const chunks = [new TextEncoder().encode(`${header}end_hea`), new TextEncoder().encode('der\r\n')];
    const cancel = vi.fn();
    const pull = vi.fn((controller: ReadableStreamDefaultController<Uint8Array>) => {
      controller.enqueue(chunks.shift() ?? new Uint8Array(65536));
    });
    const body = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 });
    const fetchImpl = vi.fn(async (url: string) => url === HF_API
      ? jsonResponse([{ type: 'file', path: 'ds/scene.ply', size: 9_000_000_000 }])
      : new Response(body, { status }));

    expect(await discoverHuggingFaceSplatPaths(HF_BASE, { fetchImpl })).toEqual([
      { path: 'scene.ply', size: 9_000_000_000, splatCount: 17 },
    ]);
    expect(pull).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([200, 206])('stops a %s plain point-cloud PLY probe before downloading its vertex data', async status => {
    const cancel = vi.fn();
    const pull = vi.fn((controller: ReadableStreamDefaultController<Uint8Array>) => {
      controller.enqueue(new TextEncoder().encode(`${pointCloudHeader}\nend_header\n`));
    });
    const body = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 });
    const fetchImpl = vi.fn(async (url: string) => url === HF_API
      ? jsonResponse([{ type: 'file', path: 'ds/point_cloud.ply', size: 9_000_000_000 }])
      : new Response(body, { status }));

    expect(await discoverHuggingFaceSplatPaths(HF_BASE, { fetchImpl })).toEqual([]);
    expect(pull).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('F2: does not download the full body when classifying a Range-ignored 200', async () => {
    let pulls = 0;
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        // First chunk carries the PLY header; rest simulates a multi-GB body.
        controller.enqueue(new TextEncoder().encode('ply\nformat binary_little_endian 1.0\n'.padEnd(8192, ' ')));
      },
      pull(controller) {
        pulls += 1;
        if (pulls > 100) {
          controller.close(); // safety: a broken bound would otherwise loop forever
          return;
        }
        controller.enqueue(new Uint8Array(8192));
      },
      cancel,
    });
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes('/api/datasets/')
        ? jsonResponse([{ type: 'file', path: 'ds/point_cloud.ply', size: 9_000_000_000 }])
        // 200 (NOT 206): the server ignored the Range header.
        : new Response(body, { status: 200 })
    );

    await discoverHuggingFaceSplatPaths(HF_BASE, { fetchImpl });

    expect(cancel).toHaveBeenCalled();
    expect(pulls).toBeLessThan(20); // ~64KB / 8KB, not the whole 9GB
  });

  it('F9: caps concurrent splat classification at 6', async () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({
      type: 'file', path: `ds/tile${i}.ply`, size: 100,
    }));
    const fetchImpl = vi.fn(async () => jsonResponse(entries));
    let inFlight = 0;
    let peak = 0;
    const classifySplatUrl = vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { isSplat: true, splatCount: null };
    });

    const result = await discoverHuggingFaceSplatPaths(HF_BASE, { fetchImpl, classifySplatUrl });

    expect(result).toHaveLength(20);
    expect(peak).toBeLessThanOrEqual(6);
  });

  it('F6: de-duplicates repeated tree entries so one splat is not counted as many', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([
      { type: 'file', path: 'ds/scene.ply', size: 100 },
      { type: 'file', path: 'ds/scene.ply', size: 100 },
    ]));
    const classifySplatUrl = vi.fn(async () => ({ isSplat: true, splatCount: null }));

    const result = await discoverHuggingFaceSplatPaths(HF_BASE, { fetchImpl, classifySplatUrl });

    expect(result.map((c) => c.path)).toEqual(['scene.ply']);
  });

  it('F6: stops paginating on a cyclic next cursor', async () => {
    const fetchImpl = vi.fn(async (_url: string) => jsonResponse(
      [{ type: 'file', path: 'ds/scene.ply', size: 1 }],
      { headers: { 'Content-Type': 'application/json', Link: `<${HF_API}>; rel="next"` } }
    ));
    const classifySplatUrl = vi.fn(async () => ({ isSplat: true, splatCount: null }));

    await discoverHuggingFaceSplatPaths(HF_BASE, { fetchImpl, classifySplatUrl });

    const treeFetches = fetchImpl.mock.calls.filter(([u]) => String(u).includes('/api/datasets/')).length;
    expect(treeFetches).toBe(1); // the cyclic cursor (same url) is not re-fetched
  });

  it('F15: does not follow a cross-origin pagination cursor', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url === HF_API
        ? jsonResponse(
            [{ type: 'file', path: 'ds/scene.ply', size: 1 }],
            { headers: { 'Content-Type': 'application/json', Link: '<https://evil.example/steal>; rel="next"' } }
          )
        : jsonResponse([])
    );
    const classifySplatUrl = vi.fn(async () => ({ isSplat: true, splatCount: null }));

    await discoverHuggingFaceSplatPaths(HF_BASE, { fetchImpl, classifySplatUrl });

    expect(fetchImpl).not.toHaveBeenCalledWith('https://evil.example/steal');
  });

  it('captures the PLY vertex count during splat classification', async () => {
    const plyHeader = [
      'ply', 'format binary_little_endian 1.0', 'element vertex 10000000',
      'property float x', 'property float y', 'property float z',
      'property float f_dc_0', 'property float f_dc_1', 'property float f_dc_2',
      'property float opacity', 'property float scale_0', 'property float scale_1',
      'property float scale_2', 'property float rot_0', 'property float rot_1',
      'property float rot_2', 'property float rot_3', 'end_header', '',
    ].join('\n');
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.headers && 'Range' in (init.headers as Record<string, string>)) {
        return new Response(plyHeader, { status: 206 });
      }
      return jsonResponse([
        { type: 'file', path: 'splats/huge.ply', size: 1_040_000_634 },
        { type: 'file', path: 'splats/tiles.spz', size: 40_000_000 },
      ]);
    });

    const candidates = await discoverHuggingFaceSplatPaths(
      'https://huggingface.co/datasets/Acme/Scene/resolve/main',
      { fetchImpl }
    );

    expect(candidates).toEqual([
      { path: 'splats/tiles.spz', size: 40_000_000, splatCount: null },
      { path: 'splats/huge.ply', size: 1_040_000_634, splatCount: 10_000_000 },
    ]);
  });

  it('F8: keeps a directory-listing splat whose HEAD lacks Content-Length', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        return new Response(null, { status: 200 }); // no content-length
      }
      if (url === 'https://example.com/dataset/') {
        return textResponse('<a href="model.ply">m</a>');
      }
      return missingResponse();
    });

    const result = await discoverDirectoryListingSplatPaths('https://example.com/dataset', { fetchImpl });

    expect(result).toEqual([{ path: 'model.ply', size: 0 }]);
  });

  it('decodes directory-listing splat paths so they are not double-encoded on fetch', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        return new Response(null, { headers: { 'content-length': '10' } });
      }
      if (url === 'https://example.com/dataset/') {
        // A correct static listing serves the '#' percent-encoded in the href.
        return textResponse('<a href="5x5%23-5.ply">tile</a>');
      }
      return missingResponse();
    });

    const result = await discoverDirectoryListingSplatPaths('https://example.com/dataset', { fetchImpl });

    // The stored path must be DECODED ('#', not '%23'); callers re-encode once via
    // encodeUrlPath, so a decoded path yields the correct single-encoded fetch URL.
    expect(result).toEqual([{ path: '5x5#-5.ply', size: 10 }]);
  });

  it('F8: keeps a directory-listing splat when HEAD is rejected (405)', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        return new Response(null, { status: 405, statusText: 'Method Not Allowed' });
      }
      if (url === 'https://example.com/dataset/') {
        return textResponse('<a href="a.spz">a</a>');
      }
      return missingResponse();
    });

    const result = await discoverDirectoryListingSplatPaths('https://example.com/dataset', { fetchImpl });

    expect(result).toEqual([{ path: 'a.spz', size: 0 }]);
  });

  it('F16: derives the masks directory as a sibling of the images directory', () => {
    expect(deriveMasksPathFromImages('corrected/images')).toBe('corrected/masks');
    expect(deriveMasksPathFromImages('corrected/images/')).toBe('corrected/masks');
    expect(deriveMasksPathFromImages('images')).toBe('masks');
    expect(deriveMasksPathFromImages('a/b/Images')).toBe('a/b/masks');
  });

  it('F16: returns null for paths that do not end in an images segment', () => {
    expect(deriveMasksPathFromImages('corrected/frames')).toBeNull();
    expect(deriveMasksPathFromImages('data')).toBeNull();
  });
});

describe('initial-load byte counting for COLMAP files', () => {
  function streamingBinResponse(size: number): Response {
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= size) {
          controller.close();
          return;
        }
        const chunk = Math.min(4096, size - sent);
        controller.enqueue(new Uint8Array(chunk));
        sent += chunk;
      },
    });
    return new Response(body, { status: 200, headers: { 'content-length': String(size) } });
  }

  it('aggregates bytesLoaded/bytesTotal across the parallel required downloads', async () => {
    const setUrlProgress = vi.fn();
    const sizes: Record<string, number> = {
      'custom/cameras.bin': 4096,
      'custom/images.bin': 40_000,
      'custom/points3D.bin': 200_000,
    };
    // Real fetchFile (no deps.fetchFile) so it streams via fetchManifestFile.
    const fetchImpl = vi.fn(async (url: string) => {
      for (const [path, size] of Object.entries(sizes)) {
        if (url.endsWith(path)) return streamingBinResponse(size);
      }
      return missingResponse(); // discovery / optional rigs+frames -> nothing
    });

    await fetchManifestColmapFiles(manifest, { fetchImpl, setUrlProgress, log: vi.fn() });

    const byteCalls = setUrlProgress.mock.calls
      .map(([p]) => p)
      .filter((p) => p && p.bytesTotal !== undefined);

    const expectedTotal = 4096 + 40_000 + 200_000;
    expect(byteCalls.length).toBeGreaterThan(0);
    // Every reported total is the full sum (only surfaced once all sizes known).
    expect(byteCalls.every((p) => p.bytesTotal === expectedTotal)).toBe(true);
    // Loaded climbs monotonically and ends fully downloaded.
    const loaded = byteCalls.map((p) => p.bytesLoaded as number);
    expect(loaded).toEqual([...loaded].sort((a, b) => a - b));
    expect(Math.max(...loaded)).toBe(expectedTotal);
  });

  it('falls back to file-count progress (no bytes) when a size is unknown', async () => {
    const setUrlProgress = vi.fn();
    const fetchImpl = vi.fn(async (url: string) => {
      // points3D has no Content-Length -> bytes cannot be aggregated reliably.
      if (url.endsWith('points3D.bin')) {
        return new Response(new ReadableStream<Uint8Array>({ start: (c) => c.close() }), { status: 200 });
      }
      if (url.endsWith('cameras.bin') || url.endsWith('images.bin')) {
        return streamingBinResponse(1000);
      }
      return missingResponse();
    });

    await fetchManifestColmapFiles(manifest, { fetchImpl, setUrlProgress, log: vi.fn() });

    const anyBytes = setUrlProgress.mock.calls.some(([p]) => p && p.bytesTotal !== undefined);
    expect(anyBytes).toBe(false);
  });

});

describe('large-dataset warning during layout discovery', () => {
  it('reports a large-dataset warning for touch devices during layout discovery', async () => {
    const onLargeDatasetWarning = vi.fn();
    const fetchImpl = vi.fn(async () => jsonResponse([
      { type: 'file', path: 'sparse/0/cameras.bin', size: 48 },
      { type: 'file', path: 'sparse/0/images.bin', size: 192_776_427 },
      { type: 'file', path: 'sparse/0/points3D.bin', size: 59_779_977 },
    ]));

    await withDiscoveredColmapPaths(
      createDefaultManifest('https://huggingface.co/datasets/Acme/Scene/resolve/main'),
      { fetchImpl, isTouchDevice: true, onLargeDatasetWarning }
    );

    expect(onLargeDatasetWarning).toHaveBeenCalledWith(
      "Large dataset (253 MB of COLMAP data) - may exceed this device's memory"
    );
  });
});
