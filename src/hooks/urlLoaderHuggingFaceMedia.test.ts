import { describe, expect, it, vi } from 'vitest';
import { prepareNativeMedia } from '../dataset/nativeMedia';
import { buildCamera, buildFile, buildImage } from '../test/builders';
import { createDefaultManifest, getHuggingFaceDatasetTreeRequest, joinManifestUrlPath } from './urlLoaderPolicy';
import { discoverHuggingFaceLayout, fetchManifestColmapFiles, withDiscoveredColmapPaths } from './urlLoaderManifestFetch';

const repoBase = 'https://huggingface.co/datasets/audit/native-media/resolve/pinned';
const scene = 'captures/scene A #1';
const sceneBase = joinManifestUrlPath(repoBase, scene);
const name = 'FRONT/000000.png';
const mask = `masks/${name}.png`;
const entry = (path: string) => ({ type: 'file', path: `${scene}/${path}`, size: 100 });
const model = (dir: string) => ['cameras.bin', 'images.bin', 'points3D.bin'].map(file => entry(`${dir}/${file}`));
const json = (data: unknown, headers?: HeadersInit) => new Response(JSON.stringify(data), { headers });

function source(modelDir: string, extraPaths: string[], options: { failParent?: boolean; parentNext?: boolean; peerModel?: boolean } = {}) {
  const base = joinManifestUrlPath(sceneBase, modelDir);
  const modelApi = getHuggingFaceDatasetTreeRequest(base)!.apiUrl;
  const sceneApi = getHuggingFaceDatasetTreeRequest(sceneBase)!.apiUrl;
  const fetchImpl = vi.fn(async (url: string) => {
    if (url === modelApi) return json(model(modelDir));
    if (url === sceneApi) {
      if (options.failParent) return new Response('unavailable', { status: 503 });
      if (options.parentNext) return json(model(modelDir), { Link: `<${sceneApi}&cursor=next>; rel="next"` });
      return json([...model(modelDir), ...(options.peerModel === false ? [] : model('other/sparse/0')), ...extraPaths.map(entry)]);
    }
    if (url === sceneApi + '&cursor=next') return json(extraPaths.map(entry));
    return new Response('missing', { status: 404 });
  });
  return { base, fetchImpl, modelApi, sceneApi };
}

async function mediaContext(base: string, fetchImpl: (url: string) => Promise<Response>, imageName = name) {
  const manifest = await withDiscoveredColmapPaths(createDefaultManifest(base), { fetchImpl });
  const fetchFile = vi.fn(async (_base: string, path: string) => buildFile(path));
  const files = await fetchManifestColmapFiles(manifest, { fetchFile, setUrlProgress: vi.fn() });
  const context = await prepareNativeMedia(files, files.get('sparse/0/cameras.bin')!, new Map([[1, buildCamera()]]),
    new Map([[1, buildImage({ name: imageName })]]));
  return { manifest, fetchFile, context };
}

describe('Hugging Face URLs scoped to native models', () => {
  it.each(['jpg', 'undistorted'])('finds sibling ETH3D %s photographs from both model and scene URLs', async variant => {
    const modelDir = `dslr_calibration_${variant}`;
    const photoDir = variant === 'jpg' ? 'dslr_images' : 'dslr_images_undistorted';
    const otherDir = variant === 'jpg' ? 'dslr_images_undistorted' : 'dslr_images';
    const imageName = `${photoDir}/DSC_6511.JPG`;
    const photo = `images/${imageName}`, mask = `masks/${imageName}.png`;
    const { base, fetchImpl, modelApi, sceneApi } = source(modelDir,
      [photo, mask, `images/${otherDir}/DSC_6511.JPG`, `other/images/${imageName}`], { peerModel: false });
    for (const url of [base, sceneBase]) {
      const { manifest, context, fetchFile } = await mediaContext(url, fetchImpl, imageName);
      expect(manifest.baseUrl).toBe(url);
      expect(manifest.files.cameras).toBe(url === base ? 'cameras.bin' : `${modelDir}/cameras.bin`);
      expect(manifest.imagesPath).toBe(url === base ? sceneBase + '/images/' : 'images/');
      expect(context?.source).toEqual({ kind: 'url', baseUrl: sceneBase + '/' });
      expect(context?.selection.metadataPath).toBe(modelDir);
      expect(context?.bindings.get(imageName)).toMatchObject({ sourceImagePath: photo, mask: { path: mask, role: 'validity' } });
      expect(context?.diagnostics).toEqual([]);
      expect(fetchFile.mock.calls[0].slice(0, 2)).toEqual([url, manifest.files.cameras]);
    }
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([modelApi, sceneApi, sceneApi]);
  });

  it('keeps the requested text calibration when its sibling has a binary model', async () => {
    const modelDir = 'dslr_calibration_jpg';
    const { base, fetchImpl, modelApi, sceneApi } = source(modelDir, []);
    const selected = ['cameras.txt', 'images.txt', 'points3D.txt'].map(file => entry(`${modelDir}/${file}`));
    const fetchTree = (url: string) => url === modelApi ? Promise.resolve(json(selected))
      : url === sceneApi ? Promise.resolve(json([...model('dslr_calibration_undistorted'), entry('images/dslr_images/DSC_6511.JPG')])) : fetchImpl(url);
    const layout = await discoverHuggingFaceLayout(base, { fetchImpl: fetchTree });
    expect(layout?.colmap).toMatchObject({ cameras: 'cameras.txt', images: 'images.txt', points3D: 'points3D.txt' });
    expect(layout?.colmapTotalBytes).toBe(300);
    expect(layout?.mediaModelDir).toBe(modelDir);
    expect(layout?.imagesPath).toBe(sceneBase + '/images/');
    expect(layout?.filePaths).toContain(modelDir + '/cameras.txt');
  });

  it.each(['jpg', 'undistorted'])('retains %s representation policy when the parent listing fails', async variant => {
    const modelDir = `dslr_calibration_${variant}`;
    const photoDir = variant === 'jpg' ? 'dslr_images' : 'dslr_images_undistorted';
    const otherDir = variant === 'jpg' ? 'dslr_images_undistorted' : 'dslr_images';
    const { base, fetchImpl, modelApi } = source(modelDir, [], { failParent: true });
    const fetchTree = async (url: string) => url === modelApi
      ? json([...model(modelDir), entry(`${modelDir}/images/${otherDir}/A.JPG`)]) : fetchImpl(url);
    const layout = await discoverHuggingFaceLayout(base, { fetchImpl: fetchTree });
    expect(layout?.imagesPath).toBeNull();
    const { context } = await mediaContext(base, fetchTree, `${photoDir}/A.JPG`);
    expect(context?.source).toEqual({ kind: 'url', baseUrl: base + '/' });
    expect(context?.bindings.size).toBe(0);
  });

  it.each(['known_pose_model', 'triangulated_model', 'triangulated_text', 'sparse/0', 'sparse', 'colmap', 'colmap/sparse/0'])(
    'finds sibling orphan masks from %s without replacing the selected model', async modelDir => {
      const { base, fetchImpl, modelApi, sceneApi } = source(modelDir, [mask]);
      const { manifest, fetchFile, context } = await mediaContext(base, fetchImpl);
      expect(manifest.baseUrl).toBe(base);
      expect(manifest.files).toMatchObject({ cameras: 'cameras.bin', images: 'images.bin', points3D: 'points3D.bin' });
      expect(fetchFile.mock.calls.map(([base, path]) => [base, path])).toEqual(
        ['cameras.bin', 'images.bin', 'points3D.bin'].map(path => [base, path]));
      expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([modelApi, sceneApi]);
      expect(context?.source).toEqual({ kind: 'url', baseUrl: sceneBase + '/' });
      expect(context?.selection.metadataPath).toBe(modelDir);
      expect(context?.bindings.size).toBe(0);
      expect(context?.nativeMasks?.get(name)).toMatchObject({ kind: 'file', path: mask, role: 'validity' });
      expect(context?.diagnostics.some(item => item.code === 'MISSING_IMAGE')).toBe(true);
    }
  );

  it.each(['triangulated_model','dslr_calibration_jpg','dslr_calibration_undistorted','sparse/0','sparse','colmap','colmap/0','colmap/sparse/0','colmap/sparse','sparses/0',
    'colmap_workspace/sparse_native','colmap_workspace/sparse_seed'])(
    'binds sibling original photos and masks above %s with correctly scoped resource URLs', async modelDir => {
    const { base, fetchImpl } = source(modelDir, [`images/${name}`, mask]);
    const { manifest, context } = await mediaContext(base, fetchImpl);
    expect(manifest.imagesPath).toBe(sceneBase + '/images/');
    expect(manifest.masksPath).toBe(sceneBase + '/masks');
    expect(context?.bindings.get(name)).toMatchObject({ sourceImagePath: `images/${name}`, mask: { path: mask, role: 'validity' } });
    expect(context?.nativeMasks?.size).toBe(0);
  });

  it('retains the exact requested variant and its size when a preferred sibling variant exists', async () => {
    const { base, fetchImpl, modelApi, sceneApi } = source('known_pose_model', []);
    const fetchTree = async (url: string) => url === sceneApi
      ? json([...model('triangulated_model'), entry(mask)]) : fetchImpl(url);
    const layout = await discoverHuggingFaceLayout(base, { fetchImpl: fetchTree });
    expect(layout?.colmap?.cameras).toBe('cameras.bin');
    expect(layout?.colmapTotalBytes).toBe(300);
    expect(layout?.filePaths).toContain('known_pose_model/cameras.bin');
    expect(layout?.filePaths).toContain(mask);
    expect(fetchImpl).toHaveBeenCalledWith(modelApi);
  });

  it('follows pagination for sibling media without fetching image payloads', async () => {
    const { base, fetchImpl, sceneApi } = source('triangulated_model', [mask], { parentNext: true });
    const { context } = await mediaContext(base, fetchImpl);
    expect(context?.nativeMasks?.get(name)?.path).toBe(mask);
    expect(fetchImpl.mock.calls.map(([url]) => url)).toContain(sceneApi + '&cursor=next');
    expect(fetchImpl.mock.calls.every(([url]) => url.includes('/api/datasets/'))).toBe(true);
  });

  it('uses the original subtree when optional scene discovery fails', async () => {
    const { base, fetchImpl, modelApi } = source('triangulated_model', [], { failParent: true });
    const fetchTree = async (url: string) => url === modelApi
      ? json([...model('triangulated_model'), entry('triangulated_model/' + mask)]) : fetchImpl(url);
    const { manifest, context } = await mediaContext(base, fetchTree);
    expect(manifest.files.cameras).toBe('cameras.bin');
    expect(context?.source).toEqual({ kind: 'url', baseUrl: base + '/' });
    expect(context?.nativeMasks?.get(name)?.path).toBe(mask);
  });

  it('does not climb arbitrary named folders or a missing model', async () => {
    for (const [dir, entries] of [['named-model', model('named-model')], ['triangulated_model', []]] as const) {
      const base = joinManifestUrlPath(sceneBase, dir);
      const fetchImpl = vi.fn(async () => json(entries));
      await discoverHuggingFaceLayout(base, { fetchImpl });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it('never borrows masks from another scene in a parent listing', async () => {
    const { base, fetchImpl, sceneApi } = source('triangulated_model', []);
    const fetchTree = async (url: string) => url === sceneApi
      ? json([...model('triangulated_model'), ...model('other/sparse/0'), entry('other/' + mask),
        { type: 'file', path: 'captures/unrelated/' + mask, size: 100 }]) : fetchImpl(url);
    const { context } = await mediaContext(base, fetchTree);
    expect(context?.bindings.size).toBe(0);
    expect(context?.nativeMasks?.size).toBe(0);
  });

  it('resolves a scene mapping CSV against the owning scene rather than the model directory', async () => {
    const { base, fetchImpl } = source('triangulated_model', ['image_mapping.csv', 'raw/camera one.png']);
    const mappingUrl = sceneBase + '/image_mapping.csv';
    const fetchTree = vi.fn(async (url: string) => url === mappingUrl
      ? new Response('colmap_image,raw_path\n' + name + ',raw/camera one.png\n') : fetchImpl(url));
    const { manifest, context } = await mediaContext(base, fetchTree);
    expect(fetchTree).toHaveBeenCalledWith(mappingUrl);
    const photoUrl = sceneBase + '/raw/camera%20one.png';
    expect(manifest.imageNameToPath).toEqual({ [name]: photoUrl });
    expect(context?.bindings.get(name)?.sourceImagePath).toBe('raw/camera one.png');
    expect(context?.source).toEqual({ kind: 'url', baseUrl: sceneBase + '/' });
  });

  it('does not turn a missing scene-relative mapped photo into an unchecked absolute binding', async () => {
    const { base, fetchImpl } = source('triangulated_model', ['image_mapping.csv', mask]);
    const fetchTree = async (url: string) => url === sceneBase + '/image_mapping.csv'
      ? new Response('colmap_image,raw_path\n' + name + ',raw/missing.png\n') : fetchImpl(url);
    const { context } = await mediaContext(base, fetchTree);
    expect(context?.bindings.size).toBe(0);
    expect(context?.nativeMasks?.get(name)?.path).toBe(mask);
  });

  it('retains photos and mappings already inside the selected model subtree', async () => {
    const { base, fetchImpl, modelApi } = source('triangulated_model', []);
    const fetchTree = async (url: string) => {
      if (url === modelApi) return json([...model('triangulated_model'), ...[
        'raw/camera one.png', 'image_mapping.csv', mask,
      ].map(path => entry('triangulated_model/' + path))]);
      if (url === base + '/image_mapping.csv') return new Response('colmap_image,raw_path\n' + name + ',raw/camera one.png\n');
      return fetchImpl(url);
    };
    const { context } = await mediaContext(base, fetchTree);
    expect(context?.bindings.get(name)).toMatchObject({ sourceImagePath: 'triangulated_model/raw/camera one.png',
      mask: { path: 'triangulated_model/' + mask } });
  });
});
