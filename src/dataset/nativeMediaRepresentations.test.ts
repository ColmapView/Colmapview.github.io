import { File as NodeFile } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCamera, buildImage } from '../test/builders';
import { imageResourceUrl } from './importers/sourcePaths';
import { prepareNativeMedia, rememberNativeMediaSource } from './nativeMedia';

beforeEach(() => vi.stubGlobal('File', NodeFile));
afterEach(() => vi.unstubAllGlobals());
const baseUrl = 'https://representations.test/pinned%20data/';
const cameras = new Map([[9, buildCamera({ cameraId: 9, width: 8, height: 4 })]]);
const names = ['cam/a.jpg', 'dslr_images/A.JPG', 'images/cam/a.png', 'cam/a #?%.jpg', 'cam/1697287.12345', 'cam/百分比%2F.jpg'];
const containers = ['sparse/0', 'colmap/sparse/1', 'reference', ''];
const modes = ['relative', 'absolute', 'signed'] as const;
type Mode = typeof modes[number];
const resource = (path: string, mode: Mode) => mode === 'relative' ? path : imageResourceUrl(baseUrl, path)
  + (mode === 'signed' ? '?token=keep%2Fquery' : '');

describe('independent native representation invariants', () => {
  for (const container of containers) for (const name of names) for (const mode of modes)
    for (const absoluteModel of [false, true]) for (const declareMasks of [false, true]) {
      it(`${container || 'root'} | ${name} | ${mode} | absolute model ${absoluteModel} | declared masks ${declareMasks}`, async () => {
        const directory = (scene: string) => scene + (container ? '/' + container : '');
        const selected = directory('dozer');
        const photo = 'dozer/images/' + name + (/\.(?:jpg|jpeg|png)$/i.test(name) ? '' : '.png');
        const mask = 'dozer/masks/' + name + '.png';
        const paths = ['dozer', 'poster'].flatMap(scene => ['cameras.bin', 'images.bin'].map(file => resource(directory(scene) + '/' + file, mode)));
        paths.push(resource(photo, mode), resource(mask, mode), resource('poster/images/' + name + '.png', mode), resource('poster/masks/' + name + '.png', mode));
        const file = new NodeFile(['metadata'], 'cameras.bin') as unknown as File;
        const files = new Map([['cameras.bin', file]]);
        const images = new Map([[7, buildImage({ imageId: 7, cameraId: 9, name })]]);
        rememberNativeMediaSource(files, { source: { kind: 'url', baseUrl }, modelDir: absoluteModel ? imageResourceUrl(baseUrl, selected) : selected,
          paths, maskPaths: declareMasks ? [resource(mask, mode), resource('poster/masks/' + name + '.png', mode)] : undefined });
        const context = await prepareNativeMedia(files, file, cameras, images);
        expect(context?.bindings.size).toBe(1);
        expect(context?.bindings.get(name)).toMatchObject({ sourceImagePath: resource(photo, mode), width: 8, height: 4,
          mask: { path: resource(mask, mode), role: 'validity' } });
        expect(context?.nativeMasks?.size).toBe(0);
        expect(images.get(7)?.name).toBe(name);
      });
    }
});

describe('negative resource-identity invariants', () => {
  const name = 'cam/a.jpg';
  async function context(paths: string[], options: Omit<Partial<Parameters<typeof rememberNativeMediaSource>[1]>, 'source' | 'paths' | 'modelDir'> = {}, registered = name) {
    const file = new NodeFile(['metadata'], 'cameras.bin') as unknown as File, files = new Map([['cameras.bin', file]]);
    rememberNativeMediaSource(files, { source: { kind: 'url', baseUrl }, modelDir: 'dozer/sparse/0',
      paths: ['dozer', 'poster'].flatMap(scene => ['cameras.bin', 'images.bin'].map(file => scene + '/sparse/0/' + file)).concat(paths), ...options });
    return (await prepareNativeMedia(files, file, cameras, new Map([[7, buildImage({ imageId: 7, cameraId: 9, name: registered })]])))!;
  }
  it('retains competing signed photo identities as ambiguous', async () => {
    const photos = ['one', 'two'].map(token => imageResourceUrl(baseUrl, 'dozer/images/' + name) + '?token=' + token);
    const result = await context(photos, { imagePaths: photos });
    expect(result.bindings.size).toBe(0);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'AMBIGUOUS_IMAGE_PATH' }));
  });
  it('retains competing signed mask identities as ambiguous', async () => {
    const masks = ['one', 'two'].map(token => imageResourceUrl(baseUrl, 'dozer/masks/' + name + '.png') + '?token=' + token);
    const result = await context(['dozer/images/' + name, ...masks], { maskPaths: masks });
    expect(result.bindings.get(name)?.mask).toBeUndefined();
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'AMBIGUOUS_MASK_PATH' }));
  });
  it('resolves a full source-relative mapping to its listed signed resource', async () => {
    const photo = resource('poster/images/' + name, 'signed'), mask = resource('poster/masks/' + name + '.png', 'signed');
    const result = await context([photo, mask], { imagePaths: [], maskPaths: [mask], overrides: { [name]: 'poster/images/' + name } });
    expect(result.bindings.get(name)).toMatchObject({ sourceImagePath: photo, mask: { path: mask, role: 'validity' } });
  });
  it.each([false, true])('does not infer a preview mask, with another ordinary mask present: %s', async otherMask => {
    const registered = 'Visualizations/' + name, mask = 'dozer/masks/' + registered + '.png';
    const result = await context(['dozer/images/' + registered, mask, ...(otherMask ? ['dozer/masks/unregistered.png'] : [])], {}, registered);
    expect(result.bindings.get(registered)?.mask).toBeUndefined();
  });
  it('honors an explicit mask declaration in an otherwise excluded preview directory', async () => {
    const registered = 'Visualizations/' + name, mask = 'dozer/masks/' + registered + '.png';
    const result = await context(['dozer/images/' + registered, mask], { maskPaths: [mask] }, registered);
    expect(result.bindings.get(registered)?.mask).toMatchObject({ path: mask, role: 'validity' });
  });
});

describe('photos flattened directly into the owning dataset root', () => {
  for (const root of ['', 'outer/scene']) for (const mode of modes) {
    it(`${root || 'source root'} | ${mode}`, async () => {
      const prefix = root ? root + '/' : '', names = ['cam/a.jpg', 'cam/b.jpg'];
      const file = new NodeFile(['metadata'], 'cameras.bin') as unknown as File, files = new Map([['cameras.bin', file]]);
      const photos = ['a.png', 'b.png'].map(name => resource(prefix + name, mode));
      rememberNativeMediaSource(files, { source: { kind: 'url', baseUrl }, modelDir: prefix + 'sparse/0',
        paths: ['cameras.bin', 'images.bin'].map(name => resource(prefix + 'sparse/0/' + name, mode)).concat(photos) });
      const context = await prepareNativeMedia(files, file, cameras, new Map(names.map((name, index) => [7 + index, buildImage({ imageId: 7 + index, cameraId: 9, name })])));
      expect([...context!.bindings.values()].map(binding => binding.sourceImagePath)).toEqual(photos);
    });
  }
  it.each(['', 'outer/scene'])('does not flatten repeated camera basenames at %s', async root => {
    const prefix = root ? root + '/' : '', file = new NodeFile(['metadata'], 'cameras.bin') as unknown as File, files = new Map([['cameras.bin', file]]);
    rememberNativeMediaSource(files, { source: { kind: 'url', baseUrl }, modelDir: prefix + 'sparse/0', paths: [prefix + 'a.png'] });
    const images = new Map(['cam1/a.jpg', 'cam2/a.jpg'].map((name, index) => [7 + index, buildImage({ imageId: 7 + index, cameraId: 9, name })]));
    expect((await prepareNativeMedia(files, file, cameras, images))?.bindings.size).toBe(0);
  });
});
