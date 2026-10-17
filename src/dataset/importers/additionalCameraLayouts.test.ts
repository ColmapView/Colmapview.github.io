import { File as NodeFile, Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { zipSync } from 'fflate';
import { pngHeader } from '../../test/imageHeaders';
import { dtuFixture, numpyFixture } from '../../test/numpyCameraFixtures';
import { parseCamerasBinary } from '../../parsers/cameras';
import { parseImagesBinary } from '../../parsers/images';
import { prepareCameraDataset, prepareLocalCameraDataset } from './prepareCameraDataset';
import { normalizeSourceIndex } from './sourcePaths';
import type { CameraDatasetSource } from './types';

const file = (value: string | Uint8Array<ArrayBuffer>, name: string) => new NodeFile([value], name) as unknown as File;
const projection = [5, 0, 4, 17, 0, 6, 2, 18, 0, 0, 1, 3];
const identity = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const llffPose = [0, 1, 0, 1, 4, 1, 0, 0, 2, 8, 0, 0, -1, 3, 5, NaN, Infinity];
const gaussian = (name = 'a', id = 0) => ({ id, img_name: name, width: 8, height: 4, fx: 5, fy: 6, position: [1, 2, 3], rotation: identity });

function input(schema: 'gaussian-splatting' | 'llff' | 'dtu') {
  const files = new Map<string, File>();
  if (schema === 'gaussian-splatting') files.set('scene/cameras.json', file(JSON.stringify([gaussian('a', 3), gaussian('b', 8)]), 'cameras.json'));
  else if (schema === 'llff') files.set('scene/poses_bounds.npy', file(numpyFixture(2, 17, [...llffPose, ...llffPose]), 'poses_bounds.npy'));
  else files.set('scene/cameras.npz', file(dtuFixture([projection, projection]), 'cameras.npz'));
  const dir = schema === 'dtu' ? 'image' : 'images';
  for (const name of ['a', 'b']) files.set(`scene/${dir}/${name}.png`, file(pngHeader(8, 4), name + '.png'));
  if (schema === 'dtu') files.set('scene/mask/a.png', file(pngHeader(8, 4), 'a.png'));
  return files;
}
function source(files: Map<string, File>, kind: 'local' | 'archive'): CameraDatasetSource {
  return kind === 'local' ? { kind, files: normalizeSourceIndex(files) } : { kind, entries: new Map([...files].map(([name, value]) => [name,
    { name, size: value.size, lastModified: 0, extract: async () => value, extractPreview: async () => value }])) };
}
beforeEach(() => { vi.stubGlobal('File', NodeFile); vi.stubGlobal('Blob', NodeBlob); });
afterEach(() => vi.unstubAllGlobals());

describe('additional camera layout preparation', () => {
  for (const schema of ['gaussian-splatting', 'llff', 'dtu'] as const) for (const kind of ['local', 'archive'] as const) {
    it(`imports ${schema} ${kind} using exact original bindings`, async () => {
      const files = input(schema), prepared = (await prepareCameraDataset(source(files, kind)))!;
      expect(prepared.context.selection.schema).toBe(schema);
      expect([...prepared.context.bindings.keys()]).toEqual(schema === 'dtu' ? ['image/a.png', 'image/b.png'] : ['a.png', 'b.png']);
      const cameras = parseCamerasBinary(await prepared.files.get('sparse/0/cameras.bin')!.arrayBuffer());
      const images = parseImagesBinary(await prepared.files.get('sparse/0/images.bin')!.arrayBuffer());
      expect(cameras.get(1)).toMatchObject({ width: 8, height: 4, params: [5, schema === 'llff' ? 5 : 6, 4, 2] });
      expect(images.get(1)).toMatchObject({ tvec: schema === 'dtu' ? [1, 2, 3] : [-1, -2, -3], points2D: [] });
      images.get(1)!.qvec.forEach((value, index) => expect(value).toBeCloseTo(Number(index === 0), 12));
      const binding = [...prepared.context.bindings.values()][0];
      expect(binding.sourceImagePath).toBe(`scene/${schema === 'dtu' ? 'image' : 'images'}/a.png`);
      if (schema === 'dtu') expect(binding.mask).toMatchObject({ kind: 'file', path: 'scene/mask/a.png', role: 'foreground' });
      if (kind === 'local') expect(prepared.files.get('images/' + images.get(1)!.name)).toBe(files.get(binding.sourceImagePath));
    });
  }
  it('rejects ambiguous 3DGS image roots instead of selecting the first photo', async () => {
    const files = input('gaussian-splatting'); files.set('scene/a.png', file(pngHeader(8, 4), 'a.png'));
    await expect(prepareLocalCameraDataset(files)).rejects.toMatchObject({ code: 'AMBIGUOUS_IMAGE_PATH' });
  });
  it.each([{ k1: .1 }, { camera_model: 'OPENCV' }, { distortion_params: [1, 2] }, { rotation: [[-1, 0, 0], [0, 1, 0], [0, 0, 1]] }])('rejects unsupported 3DGS calibration or pose %j', async fields => {
    const files = new Map([['cameras.json', file(JSON.stringify([{ ...gaussian(), ...fields }]), 'cameras.json')]]);
    await expect(prepareLocalCameraDataset(files)).rejects.toThrow();
  });
  it('rejects duplicate 3DGS IDs and preserves optional principal points', async () => {
    const files = input('gaussian-splatting');
    files.set('scene/cameras.json', file(JSON.stringify([gaussian('a'), gaussian('b')]), 'cameras.json'));
    await expect(prepareLocalCameraDataset(files)).rejects.toThrow(/unique/);
    files.set('scene/cameras.json', file(JSON.stringify([{ ...gaussian(), cx: 0, cy: 1 }]), 'cameras.json'));
    const prepared = (await prepareLocalCameraDataset(files))!;
    expect(parseCamerasBinary(await prepared.files.get('sparse/0/cameras.bin')!.arrayBuffer()).get(1)?.params).toEqual([5, 6, 0, 1]);
  });
  it('uses case-sensitive LLFF ordering and rejects a missing implicit photo', async () => {
    const files = input('llff'); files.set('scene/images/B.png', files.get('scene/images/b.png')!); files.delete('scene/images/b.png');
    expect([...(await prepareLocalCameraDataset(files))!.context.bindings.keys()]).toEqual(['B.png', 'a.png']);
    files.delete('scene/images/a.png');
    await expect(prepareLocalCameraDataset(files)).rejects.toMatchObject({ code: 'INVALID_IMAGE_ORDER' });
  });
  it('allows an explicit order list to preserve missing photo positions', async () => {
    const files = input('llff'); files.delete('scene/images/a.png');
    files.set('scene/list.txt', file('images/a.png\nimages/b.png\n', 'list.txt'));
    const prepared = (await prepareLocalCameraDataset(files))!;
    const images = parseImagesBinary(await prepared.files.get('sparse/0/images.bin')!.arrayBuffer());
    expect([...images.keys()]).toEqual([2]);
    expect(prepared.context.diagnostics).toContainEqual(expect.objectContaining({ code: 'MISSING_RGB', frameIndex: 0 }));
  });
  it.each(['llff','dtu'] as const)('never substitutes filename order when a listed %s order file cannot be read',async schema=>{
    const files=input(schema),metadataPath=schema==='llff'?'poses_bounds.npy':'cameras.npz';
    const paths=[...files.keys()].map(path=>path.slice('scene/'.length));paths.push('list.txt');
    const fetch=vi.fn(async(url:string)=>new Response(url.endsWith('/list.txt')?null:pngHeader(8,4),{status:url.endsWith('/list.txt')?404:200}));
    vi.stubGlobal('fetch',fetch);
    await expect(prepareCameraDataset({kind:'url',baseUrl:'https://example.test/scene/',filePaths:paths},
      {metadataPath,metadataFile:files.get('scene/'+metadataPath)})).rejects.toMatchObject({code:'INVALID_IMAGE_ORDER'});
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('scales LLFF pixel intrinsics for explicitly selected resized RGB', async () => {
    const files = input('llff');
    for (const name of ['a', 'b']) files.set(`scene/images/${name}.png`, file(pngHeader(4, 2), name + '.png'));
    const prepared = (await prepareLocalCameraDataset(files))!;
    expect(parseCamerasBinary(await prepared.files.get('sparse/0/cameras.bin')!.arrayBuffer()).get(1)).toMatchObject({ width: 4, height: 2, params: [2.5, 2.5, 2, 1] });
  });
  it('does not guess a downsized LLFF branch when images/ is absent', async () => {
    const files = input('llff');
    for (const name of ['a', 'b']) { files.set(`scene/images_4/${name}.png`, files.get(`scene/images/${name}.png`)!); files.delete(`scene/images/${name}.png`); }
    await expect(prepareLocalCameraDataset(files)).rejects.toMatchObject({ code: 'INVALID_IMAGE_ORDER' });
    files.set('scene/list.txt', file('images_4/b.png\nimages_4/a.png', 'list.txt'));
    expect([...(await prepareLocalCameraDataset(files))!.context.bindings.keys()]).toEqual(['images_4/b.png', 'images_4/a.png']);
  });
  it('applies DTU scale_mat once and retains noncentered calibration', async () => {
    const files = input('dtu'), scale = [2, 0, 0, 4, 0, 2, 0, 5, 0, 0, 2, 6, 0, 0, 0, 1];
    files.set('scene/cameras.npz', file(dtuFixture([projection, projection], [scale, scale]), 'cameras.npz'));
    const prepared = (await prepareLocalCameraDataset(files))!;
    expect(parseImagesBinary(await prepared.files.get('sparse/0/images.bin')!.arrayBuffer()).get(1)?.tvec).toEqual([2.5, 3.5, 4.5]);
  });
  it('binds IDR numeric mask IDs across zero-padding differences without guessing a duplicate', async () => {
    const files = input('dtu');
    files.delete('scene/image/a.png'); files.delete('scene/image/b.png'); files.delete('scene/mask/a.png');
    for (const id of ['000000', '000001']) files.set(`scene/image/${id}.png`, file(pngHeader(8, 4), id + '.png'));
    files.set('scene/mask/000.png', file(pngHeader(8, 4), '000.png'));
    const prepared = (await prepareLocalCameraDataset(files))!;
    expect(prepared.context.bindings.get('image/000000.png')?.mask).toMatchObject({ path: 'scene/mask/000.png', role: 'foreground' });
    files.set('scene/mask/000000.png', file(pngHeader(8, 4), '000000.png'));
    await expect(prepareLocalCameraDataset(files)).rejects.toMatchObject({ code: 'AMBIGUOUS_IMAGE_PATH' });
  });
  it('rejects missing DTU pairs, anisotropic normalization and ambiguous masks', async () => {
    const files = input('dtu');
    files.set('scene/cameras.npz', file(zipSync({ 'world_mat_0.npy': numpyFixture(4, 4, [...projection, 0, 0, 0, 1]) }), 'cameras.npz'));
    await expect(prepareLocalCameraDataset(files)).rejects.toThrow(/pairs/);
    const scale = [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1];
    files.set('scene/cameras.npz', file(dtuFixture([projection, projection], [scale, scale]), 'cameras.npz'));
    await expect(prepareLocalCameraDataset(files)).rejects.toThrow(/scale or shear/);
    files.set('scene/cameras.npz', input('dtu').get('scene/cameras.npz')!);
    files.set('scene/mask/a.jpg', file(pngHeader(8, 4), 'a.jpg'));
    await expect(prepareLocalCameraDataset(files)).rejects.toMatchObject({ code: 'AMBIGUOUS_IMAGE_PATH' });
  });
  it.each(['llff', 'dtu'] as const)('loads %s URLs with an explicit pinned-order list', async schema => {
    const files = input(schema), metadataName = schema === 'llff' ? 'poses_bounds.npy' : 'cameras.npz';
    const directory = schema === 'llff' ? 'images' : 'image';
    const fetch = vi.fn(async (url: string) => {
      const name = new URL(url).pathname.split('/pinned/revision/')[1];
      if (name === 'list.txt') return new Response(`${directory}/a.png\n${directory}/b.png\n`);
      return new Response(pngHeader(8, 4));
    });
    vi.stubGlobal('fetch', fetch);
    const prepared = (await prepareCameraDataset({ kind: 'url', baseUrl: 'https://example.test/pinned/revision/' },
      { metadataPath: metadataName, metadataFile: files.get('scene/' + metadataName) }))!;
    expect(prepared.context.selection.schema).toBe(schema);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['https://example.test/pinned/revision/list.txt',
      `https://example.test/pinned/revision/${directory}/a.png`, `https://example.test/pinned/revision/${directory}/b.png`]);
  });
  it('rejects array URLs without a supplied order', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    await expect(prepareCameraDataset({ kind: 'url', baseUrl: 'https://example.test/' },
      { metadataPath: 'poses_bounds.npy', metadataFile: input('llff').get('scene/poses_bounds.npy') })).rejects.toMatchObject({ code: 'INVALID_IMAGE_ORDER' });
  });
});
