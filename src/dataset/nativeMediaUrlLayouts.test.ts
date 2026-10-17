import { File as NodeFile } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCamera, buildImage } from '../test/builders';
import { imageResourceUrl } from './importers/sourcePaths';
import { prepareNativeMedia, rememberNativeMediaSource } from './nativeMedia';
import type { SelectCameraDataset } from './importers/selection';
import { NativeMediaPathIndex } from './nativeMediaPaths';

beforeEach(() => vi.stubGlobal('File', NodeFile));
afterEach(() => vi.unstubAllGlobals());
const cameras = new Map([[9, buildCamera({ cameraId: 9, width: 8, height: 4 })]]);
const images = new Map([[7, buildImage({ imageId: 7, cameraId: 9, name: 'cam/a.jpg' })]]);
const modes = ['relative', 'absolute', 'signed'] as const;
const metadata = ['cameras.bin', 'images.bin'].map(name => 'scene/sparse/0/' + name);
function input() {
  const file = new NodeFile(['metadata'], 'cameras.bin') as unknown as File;
  return { file, files: new Map([['cameras.bin', file]]) };
}

describe('mapping discovery across equivalent URL listings', () => {
  for (const mode of modes) for (const absoluteModel of [false, true]) {
    it(`${mode}, absolute model ${absoluteModel}`, async () => {
      const baseUrl = 'https://url-layouts.test/pinned/';
      const resource = (path: string) => mode === 'relative' ? path : imageResourceUrl(baseUrl, path) + (mode === 'signed' ? '?token=exact%2Fvalue' : '');
      const csv = resource('scene/image_mapping.csv'), photo = resource('scene/segmentation/raw.png'), mask = resource('scene/masks/cam/a.jpg.png');
      const fetch = vi.fn(async () => new Response('colmap_image,raw_path\ncam/a.jpg,scene/segmentation/raw.png\n'));
      vi.stubGlobal('fetch', fetch);
      const { file, files } = input();
      rememberNativeMediaSource(files, { source: { kind: 'url', baseUrl },
        modelDir: absoluteModel ? imageResourceUrl(baseUrl, 'scene/sparse/0') : 'scene/sparse/0',
        paths: metadata.map(resource).concat([csv, photo, mask]) });
      const context = await prepareNativeMedia(files, file, cameras, images);
      expect(context?.bindings.get('cam/a.jpg')).toMatchObject({ sourceImagePath: photo, mask: { path: mask, role: 'validity' } });
      expect(fetch).toHaveBeenCalledExactlyOnceWith(imageResourceUrl(baseUrl, csv), expect.anything());
    });
  }
});

describe('transport prefixes cannot declare media roles', () => {
  for (const prefix of ['pinned', 'masks', 'depth', 'images']) for (const mode of modes) {
    it(`${prefix} host directory, ${mode}`, async () => {
      const baseUrl = `https://url-layouts.test/${prefix}/`;
      const resource = (path: string) => mode === 'relative' ? path : imageResourceUrl(baseUrl, path) + (mode === 'signed' ? '?token=exact%2Fvalue' : '');
      const photo = resource('scene/images/cam/a.jpg'), mask = resource('scene/masks/cam/a.jpg.png');
      const { file, files } = input();
      rememberNativeMediaSource(files, { source: { kind: 'url', baseUrl }, modelDir: 'scene/sparse/0', paths: metadata.map(resource).concat([photo, mask]) });
      const context = await prepareNativeMedia(files, file, cameras, images);
      expect(context?.bindings.get('cam/a.jpg')).toMatchObject({ sourceImagePath: photo, mask: { path: mask, role: 'validity' } });
    });
  }
  it.each(['images/', ''])('ignores auxiliary-looking query values for a %s flattened photo', async folder => {
    const baseUrl = 'https://url-layouts.test/pinned/', photo = imageResourceUrl(baseUrl, 'scene/' + folder + 'a.png') + '?redirect=/depth/&tag=/masks/';
    const { file, files } = input(), selectPhotos = vi.fn<SelectCameraDataset>(async choices => choices[0]);
    rememberNativeMediaSource(files, { source: { kind: 'url', baseUrl }, modelDir: 'scene/sparse/0',
      paths: metadata.concat([photo, 'scene/masks/cam/a.jpg.png']) });
    const context = await prepareNativeMedia(files, file, cameras, images, undefined, { selectPhotos });
    expect(context?.bindings.get('cam/a.jpg')?.sourceImagePath).toBe(photo);
    expect(selectPhotos).not.toHaveBeenCalled();
  });
});

describe('URL layout recovery retains source and role boundaries', () => {
  for (const prefix of ['masks', 'depth', 'images']) for (const folder of ['images/', '']) {
    it(`recovers flattened photos at ${prefix} host prefix and ${folder || 'scene root'}`, async () => {
      const baseUrl = `https://url-layouts.test/${prefix}/`, photo = imageResourceUrl(baseUrl, 'scene/' + folder + 'a.png') + '?token=exact%2Fvalue';
      const { file, files } = input(), selectPhotos = vi.fn<SelectCameraDataset>(async choices => choices[0]);
      rememberNativeMediaSource(files, { source: { kind: 'url', baseUrl }, modelDir: 'scene/sparse/0',
        paths: metadata.concat([photo, imageResourceUrl(baseUrl, 'scene/masks/cam/a.jpg.png')]) });
      const context = await prepareNativeMedia(files, file, cameras, images, undefined, { selectPhotos });
      expect(context?.bindings.get('cam/a.jpg')).toMatchObject({ sourceImagePath: photo, mask: { role: 'validity' } });
      expect(selectPhotos).not.toHaveBeenCalled();
    });
  }
  it.each(['masks', 'images'])('does not turn an orphan mask into RGB under a %s host prefix', async prefix => {
    const baseUrl = `https://url-layouts.test/${prefix}/`, mask = imageResourceUrl(baseUrl, 'scene/masks/cam/a.jpg.png');
    const { file, files } = input();
    rememberNativeMediaSource(files, { source: { kind: 'url', baseUrl }, modelDir: 'scene/sparse/0', paths: metadata.concat([mask]) });
    const context = await prepareNativeMedia(files, file, cameras, images);
    expect(context?.bindings.size).toBe(0);
    expect(context?.nativeMasks?.get('cam/a.jpg')).toMatchObject({ path: mask, role: 'validity' });
  });
  it('still excludes a real auxiliary folder inside the selected source', async () => {
    const baseUrl = 'https://url-layouts.test/images/', { file, files } = input();
    rememberNativeMediaSource(files, { source: { kind: 'url', baseUrl }, modelDir: 'scene/sparse/0',
      paths: metadata.concat([imageResourceUrl(baseUrl, 'scene/depth/cam/a.jpg')]) });
    expect((await prepareNativeMedia(files, file, cameras, images))?.bindings.size).toBe(0);
  });
});

describe('mapping scope and ambiguity guards', () => {
  it.each(['relative', 'signed'] as const)('uses only the nearest mapping scope in a %s listing', async mode => {
    const baseUrl = 'https://url-layouts.test/pinned/';
    const resource = (path: string) => mode === 'relative' ? path : imageResourceUrl(baseUrl, path) + '?token=exact%2Fvalue';
    const csv = resource('scene/sparse/0/image_mapping.csv'), photo = resource('scene/segmentation/raw.png');
    const fetch = vi.fn(async () => new Response('colmap_image,raw_path\ncam/a.jpg,scene/segmentation/raw.png\n'));
    vi.stubGlobal('fetch', fetch);
    const { file, files } = input();
    rememberNativeMediaSource(files, { source: { kind: 'url', baseUrl }, modelDir: imageResourceUrl(baseUrl, 'scene/sparse/0'),
      paths: metadata.map(resource).concat([resource('image_mapping.csv'), resource('scene/image_mapping.csv'), csv, photo]) });
    expect((await prepareNativeMedia(files, file, cameras, images))?.bindings.get('cam/a.jpg')?.sourceImagePath).toBe(photo);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(imageResourceUrl(baseUrl, csv), expect.anything());
  });
  it('does not choose between competing signed mapping resources', async () => {
    const baseUrl = 'https://url-layouts.test/pinned/', { file, files } = input(), fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    rememberNativeMediaSource(files, { source: { kind: 'url', baseUrl }, modelDir: 'scene/sparse/0',
      paths: metadata.concat(['one', 'two'].map(token => baseUrl + 'scene/image_mapping.csv?token=' + token)) });
    const context = await prepareNativeMedia(files, file, cameras, images);
    expect(context?.bindings.size).toBe(0);
    expect(context?.diagnostics).toContainEqual(expect.objectContaining({ code: 'AMBIGUOUS_IMAGE_MAPPING' }));
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['https://other.test/pinned/', 'https://url-layouts.test/pinned-other/'])('does not borrow a CSV outside the source base %s', async other => {
    const baseUrl = 'https://url-layouts.test/pinned/', { file, files } = input(), fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    rememberNativeMediaSource(files, { source: { kind: 'url', baseUrl }, modelDir: 'scene/sparse/0',
      paths: metadata.concat([other + 'scene/image_mapping.csv?token=exact']) });
    expect((await prepareNativeMedia(files, file, cameras, images))?.bindings.size).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('equivalent source URL encodings retain scene ownership', () => {
  it.each([false, true])('keeps peer ownership with an explicit photo mapping: %s', async explicit => {
    const baseUrl = 'https://url-layouts.test/%E7%99%BE/';
    const photo = 'https://url-layouts.test/%e7%99%be/poster/images/cam/a.jpg?token=exact';
    const { file, files } = input();
    rememberNativeMediaSource(files, { source: { kind: 'url', baseUrl }, modelDir: 'scene/sparse/0',
      paths: metadata.concat(['poster/sparse/0/cameras.bin', 'poster/sparse/0/images.bin', photo, 'scene/masks/cam/a.jpg.png']),
      overrides: explicit ? { 'cam/a.jpg': photo } : {} });
    const context = await prepareNativeMedia(files, file, cameras, images);
    if (explicit) {
      expect(context?.bindings.get('cam/a.jpg')?.sourceImagePath).toBe(photo);
      expect(context?.bindings.get('cam/a.jpg')?.mask).toBeUndefined();
    } else expect(context?.bindings.size).toBe(0);
  });
  it.each([
    ['https://url-layouts.test/data%2fOne/a.jpg', true],
    ['https://url-layouts.test/data/One/a.jpg', false],
    ['https://url-layouts.test/data%2FOne-other/a.jpg', false],
    ['https://url-layouts.test/data%2fone/a.jpg', false],
    ['https://other.test/data%2FOne/a.jpg', false],
  ] as const)('retains encoded separators, filename case and source boundaries for %s', (path, owned) => {
    const index = new NativeMediaPathIndex([path], '', { baseUrl: 'https://url-layouts.test/data%2FOne/' });
    expect(index.isSceneRootPhoto(path)).toBe(owned);
  });
  it.each([
    ['%7Edata', '~data', true],
    ['data%3BOne', 'data;One', false],
  ] as const)('normalizes only unreserved source-prefix escapes in %s', (basePart, physicalPart, owned) => {
    const path = `https://url-layouts.test/${physicalPart}/a.jpg`;
    const index = new NativeMediaPathIndex([path], '', { baseUrl: `https://url-layouts.test/${basePart}/` });
    expect(index.isSceneRootPhoto(path)).toBe(owned);
  });
});
