import { File as NodeFile, Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildCamera, buildImage, buildDatasetState } from '../test/builders';
import { pngHeader } from '../test/imageHeaders';
import { DatasetManager } from './DatasetManager';
import { getDatasetSourceAdapter } from './datasetSourceAdapters';
import { collectImageFiles } from '../utils/imageFileUtils';
import { prepareNativeMedia, rememberNativeMediaSource } from './nativeMedia';
import type { CameraDatasetSource } from './importers/types';
import type { SelectCameraDataset } from './importers/selection';
import { setActiveZipArchive, clearActiveZipArchive } from '../utils/zipArchiveState';

beforeEach(() => vi.stubGlobal('File', NodeFile));
afterEach(() => { clearActiveZipArchive(); vi.unstubAllGlobals(); });
const file = (name: string, data: string | Uint8Array<ArrayBuffer> = '') => new NodeFile([data], name) as unknown as File;
const cameras = new Map([[1, buildCamera({ width: 8, height: 4 })]]);
const images = new Map([[1, buildImage({ name: 'cam/a.jpg' })]]);
it.each(['jpg', 'undistorted'])('uses only matching ETH3D photos and masks for %s calibration', async variant => {
  const modelDir = `scene/dslr_calibration_${variant}`;
  const photoDir = variant === 'jpg' ? 'dslr_images' : 'dslr_images_undistorted';
  const otherDir = variant === 'jpg' ? 'dslr_images_undistorted' : 'dslr_images';
  for (const name of [`${photoDir}/A.JPG`, 'A.JPG']) {
    for (const kind of ['local', 'archive', 'url'] as const) for (const hasMatching of [false, true]) {
      const input = new Map([[`${modelDir}/cameras.bin`, file('cameras.bin')], [`${modelDir}/images.bin`, file('images.bin')],
        [`scene/images/${otherDir}/A.JPG`, file('A.JPG', pngHeader(8, 4))],
        [`scene/masks/${otherDir}/A.JPG.png`, file('A.JPG.png', pngHeader(8, 4))],
        [`other/dslr_calibration_${variant}/cameras.bin`, file('cameras.bin')],
        [`other/dslr_calibration_${variant}/images.bin`, file('images.bin')],
        [`other/images/${photoDir}/A.JPG`, file('A.JPG', pngHeader(8, 4))]]);
      if (hasMatching) {
        input.set(`scene/images/${photoDir}/A.JPG`, file('A.JPG', pngHeader(8, 4)));
        input.set(`scene/masks/${photoDir}/A.JPG.png`, file('A.JPG.png', pngHeader(8, 4)));
      }
      const source: CameraDatasetSource = kind === 'local' ? { kind, files: input }
        : kind === 'url' ? { kind, baseUrl: 'https://models.test/' }
          : { kind, entries: new Map([...input].map(([path, file]) => [path, { name: file.name, size: file.size, lastModified: 0,
            extract: async () => file, extractPreview: async () => file }])) };
      rememberNativeMediaSource(input, { source, modelDir, paths: [...input.keys()] });
      const selectPhotos = vi.fn<SelectCameraDataset>(async choices => choices[0]);
      const context = await prepareNativeMedia(input, input.values().next().value!, cameras,
        new Map([[1, buildImage({ name })]]), undefined, { selectPhotos });
      expect(context?.bindings.size, `${kind}: ${name}, matching photos: ${hasMatching}`).toBe(Number(hasMatching));
      if (hasMatching) expect(context?.bindings.get(name)).toMatchObject({ sourceImagePath: `scene/images/${photoDir}/A.JPG`,
        mask: { path: `scene/masks/${photoDir}/A.JPG.png`, role: 'validity' } });
      expect(context?.nativeMasks?.size, `${kind}: ${name}`).toBe(0);
      expect(selectPhotos).not.toHaveBeenCalled();
    }
  }
});

it.each(['csv', 'url-mapping'] as const)('honors an explicit physical photo path under an auxiliary-looking folder: %s', async mode => {
  const path = 'scene/segmentation/cam/a.png';
  const input = new Map([['scene/sparse/0/cameras.bin', file('cameras.bin')], [path, file('a.png', pngHeader(8, 4))]]);
  if (mode === 'csv') input.set('scene/image_mapping.csv', file('image_mapping.csv', 'colmap_image,raw_path\ncam/a.jpg,' + path + '\n'));
  else rememberNativeMediaSource(input, { source: { kind: 'url', baseUrl: 'https://models.test/' }, modelDir: 'scene/sparse/0',
    paths: [...input.keys()], overrides: { 'cam/a.jpg': path } });
  const context = await prepareNativeMedia(input, input.values().next().value!, cameras, images);
  expect(context?.bindings.get('cam/a.jpg')?.sourceImagePath).toBe(path);
});
it.each(['csv', 'url-mapping'] as const)('resolves a scene-relative auxiliary photo mapping inside an outer folder: %s', async mode => {
  const path = 'outer/scene/segmentation/cam/a.png';
  const input = new Map([['outer/scene/sparse/0/cameras.bin', file('cameras.bin')], [path, file('a.png', pngHeader(8, 4))]]);
  if (mode === 'csv') input.set('outer/scene/image_mapping.csv', file('image_mapping.csv', 'colmap_image,raw_path\ncam/a.jpg,segmentation/cam/a.png\n'));
  else rememberNativeMediaSource(input, { source: { kind: 'url', baseUrl: 'https://models.test/' }, modelDir: 'outer/scene/sparse/0',
    paths: [...input.keys()], overrides: { 'cam/a.jpg': 'segmentation/cam/a.png' } });
  expect((await prepareNativeMedia(input, input.values().next().value!, cameras, images))?.bindings.get('cam/a.jpg')?.sourceImagePath).toBe(path);
});
it.each(['relative', 'signed-url'] as const)('recognizes a conventional full-name mask in a declared list after collection recovery: %s', async mode => {
  const files = new Map([['cameras.bin', file('cameras.bin')]]);
  const mask = mode === 'relative' ? 'evidence/masks/cam/a.jpg.png' : 'https://masks.test/evidence/masks/cam/a.jpg.png?token=mask%2Fvalue';
  rememberNativeMediaSource(files, { source: { kind: 'url', baseUrl: 'https://models.test/pinned/' }, modelDir: 'scene/sparse/0',
    declaredImageRoot: 'https://models.test/pinned/images/', imagePaths: ['segmentation/a.png'], maskPaths: [mask] });
  const context = await prepareNativeMedia(files, files.values().next().value!, cameras, images);
  expect(context?.bindings.get('cam/a.jpg')?.mask).toMatchObject({ path: mask, role: 'validity' });
});
it.each(['photos', 'masks'] as const)('retains known foreign-scene ownership for absolute same-source %s URLs', async role => {
  const files = new Map([['cameras.bin', file('cameras.bin')]]), baseUrl = 'https://models.test/pinned%20data/';
  const paths = ['dozer/sparse/0/cameras.bin', 'dozer/sparse/0/images.bin', 'poster/sparse/0/cameras.bin', 'poster/sparse/0/images.bin',
    'dozer/images/cam/a.jpg', 'poster/images/cam/a.jpg', 'poster/masks/cam/a.jpg.png'];
  rememberNativeMediaSource(files, { source: { kind: 'url', baseUrl }, modelDir: 'dozer/sparse/0', paths,
    ...(role === 'photos' ? { imagePaths: [baseUrl + 'poster/images/cam/a.jpg?token=photo%2Fvalue'] }
      : { maskPaths: [baseUrl + 'poster/masks/cam/a.jpg.png?token=mask%2Fvalue'] }) });
  const selectPhotos = vi.fn<SelectCameraDataset>(async choices => choices[0]);
  const context = await prepareNativeMedia(files, files.values().next().value!, cameras, images, undefined, { selectPhotos });
  if (role === 'photos') expect(context?.bindings.size).toBe(0);
  else expect(context?.bindings.get('cam/a.jpg')?.mask).toBeUndefined();
  expect(selectPhotos).not.toHaveBeenCalled();
});
it.each(['photos', 'masks'] as const)('keeps same-source signed %s URLs in the selected scene usable', async role => {
  const files = new Map([['cameras.bin', file('cameras.bin')]]), baseUrl = 'https://models.test/pinned%20data/';
  const paths = ['dozer/sparse/0/cameras.bin', 'dozer/sparse/0/images.bin', 'poster/sparse/0/cameras.bin', 'poster/sparse/0/images.bin',
    'dozer/images/cam/a.jpg', 'dozer/masks/cam/a.jpg.png', 'poster/images/cam/a.jpg'];
  const photo = baseUrl + 'dozer/images/cam/a.jpg?token=photo%2Fvalue', mask = baseUrl + 'dozer/masks/cam/a.jpg.png?token=mask%2Fvalue';
  rememberNativeMediaSource(files, { source: { kind: 'url', baseUrl }, modelDir: 'dozer/sparse/0', paths,
    ...(role === 'photos' ? { imagePaths: [photo] } : { maskPaths: [mask] }) });
  const context = await prepareNativeMedia(files, files.values().next().value!, cameras, images);
  expect(context?.bindings.get('cam/a.jpg')?.sourceImagePath).toBe(role === 'photos' ? photo : 'dozer/images/cam/a.jpg');
  if (role === 'masks') expect(context?.bindings.get('cam/a.jpg')?.mask).toMatchObject({ path: mask, role: 'validity' });
});
it('preserves deliberate signed per-image sharing and the corresponding conventional mask', async () => {
  const files = new Map([['cameras.bin', file('cameras.bin')]]), baseUrl = 'https://models.test/pinned%20data/';
  const paths = ['dozer/sparse/0/cameras.bin', 'dozer/sparse/0/images.bin', 'poster/sparse/0/cameras.bin', 'poster/sparse/0/images.bin',
    'poster/images/cam/a.jpg', 'poster/masks/cam/a.jpg.png'];
  const photo = baseUrl + 'poster/images/cam/a.jpg?token=photo%2Fvalue', mask = baseUrl + 'poster/masks/cam/a.jpg.png?token=mask%2Fvalue';
  rememberNativeMediaSource(files, { source: { kind: 'url', baseUrl }, modelDir: 'dozer/sparse/0', paths,
    overrides: { 'cam/a.jpg': photo }, maskPaths: [mask] });
  const context = await prepareNativeMedia(files, files.values().next().value!, cameras, images);
  expect(context?.bindings.get('cam/a.jpg')).toMatchObject({ sourceImagePath: photo, mask: { path: mask, role: 'validity' } });
});
it.each(['relative', 'signed-url'] as const)('recovers a complete flattened collection from explicitly declared photo paths: %s', async mode => {
  const files = new Map([['cameras.bin', file('cameras.bin')]]);
  const paths = ['a', 'b'].map(name => mode === 'relative' ? 'scene/segmentation/' + name + '.png'
    : 'https://rgb.test/segmentation/' + name + '.png?token=' + name + '%2Fvalue');
  rememberNativeMediaSource(files, { source: { kind: 'url', baseUrl: 'https://models.test/' }, modelDir: 'scene/sparse/0',
    imagePaths: paths, declaredImageRoot: 'https://models.test/images/' });
  const registered = new Map([[1, buildImage({ name: 'cam/a.jpg' })], [2, buildImage({ imageId: 2, name: 'cam/b.jpg' })]]);
  const context = await prepareNativeMedia(files, files.values().next().value!, cameras, registered);
  expect([...context!.bindings].map(([name, binding]) => [name, binding.sourceImagePath])).toEqual([['cam/a.jpg', paths[0]], ['cam/b.jpg', paths[1]]]);
});
it('does not flatten colliding camera basenames even when a manifest declares photo roles', async () => {
  const files = new Map([['cameras.bin', file('cameras.bin')]]);
  rememberNativeMediaSource(files, { source: { kind: 'url', baseUrl: 'https://models.test/' }, modelDir: '',
    imagePaths: ['segmentation/a.png'], declaredImageRoot: 'https://models.test/images/' });
  const registered = new Map([[1, buildImage({ name: 'cam1/a.jpg' })], [2, buildImage({ imageId: 2, name: 'cam2/a.jpg' })]]);
  expect((await prepareNativeMedia(files, files.values().next().value!, cameras, registered))?.bindings.size).toBe(0);
});
it('keeps distinct signed-URL collections selectable and preserves their exact escaped paths', async () => {
  const files = new Map([['cameras.bin', file('cameras.bin')]]);
  const urls = ['left', 'right'].map(host => 'https://' + host + '.test/segmentation/a%20one.png?token=' + host + '%2Fvalue');
  rememberNativeMediaSource(files, { source: { kind: 'url', baseUrl: 'https://models.test/' }, modelDir: '', imagePaths: urls,
    declaredImageRoot: 'https://models.test/images/' });
  const selectPhotos = vi.fn<SelectCameraDataset>(async choices => choices.find(choice => choice.sceneRoot.startsWith('https://right.test'))!);
  const context = await prepareNativeMedia(files, files.values().next().value!, cameras,
    new Map([[1, buildImage({ name: 'cam/a one.jpg' })]]), undefined, { selectPhotos });
  expect(selectPhotos).toHaveBeenCalledOnce();
  expect(context?.bindings.get('cam/a one.jpg')?.sourceImagePath).toBe(urls[1]);
});
it('preserves exact filename case inside a declared flattened signed-URL collection', async () => {
  const files = new Map([['cameras.bin', file('cameras.bin')]]);
  const urls = ['A.JPG', 'a.jpg'].map(name => 'https://rgb.test/segmentation/' + name + '?token=' + name);
  rememberNativeMediaSource(files, { source: { kind: 'url', baseUrl: 'https://models.test/' }, modelDir: '', imagePaths: urls,
    declaredImageRoot: 'https://models.test/images/' });
  const context = await prepareNativeMedia(files, files.values().next().value!, cameras, new Map([[1, buildImage({ name: 'cam/A.JPG' })]]));
  expect(context?.bindings.get('cam/A.JPG')?.sourceImagePath).toBe(urls[0]);
});
it.each(['photos', 'masks'] as const)('retains known scene ownership when a manifest declares %s', async role => {
  const files = new Map([['cameras.bin', file('cameras.bin')]]);
  const paths = ['dozer/sparse/0/cameras.bin', 'dozer/sparse/0/images.bin', 'poster/sparse/0/cameras.bin', 'poster/sparse/0/images.bin',
    'dozer/images/cam/a.jpg', 'poster/images/cam/a.jpg', 'poster/masks/cam/a.jpg.png'];
  rememberNativeMediaSource(files, { source: { kind: 'url', baseUrl: 'https://models.test/' }, modelDir: 'dozer/sparse/0', paths,
    ...(role === 'photos' ? { imagePaths: ['poster/images/cam/a.jpg'] } : { maskPaths: ['poster/masks/cam/a.jpg.png'] }) });
  const selectPhotos = vi.fn<SelectCameraDataset>(async choices => choices[0]);
  const context = await prepareNativeMedia(files, files.values().next().value!, cameras, images, undefined, { selectPhotos });
  if (role === 'photos') expect(context?.bindings.size).toBe(0);
  else { expect(context?.bindings.get('cam/a.jpg')?.sourceImagePath).toBe('dozer/images/cam/a.jpg'); expect(context?.bindings.get('cam/a.jpg')?.mask).toBeUndefined(); }
  expect(selectPhotos).not.toHaveBeenCalled();
});
it.each([false, true])('keeps masks beside an explicitly mapped shared photo independent of unrelated masks: %s', async extraMask => {
  const files = new Map([['cameras.bin', file('cameras.bin')]]);
  const paths = ['dozer/sparse/0/cameras.bin', 'dozer/sparse/0/images.bin', 'poster/sparse/0/cameras.bin', 'poster/sparse/0/images.bin',
    'poster/images/cam/a.jpg', 'poster/masks/cam/a.jpg.png', ...(extraMask ? ['dozer/masks/unregistered.jpg.png'] : [])];
  rememberNativeMediaSource(files, { source: { kind: 'url', baseUrl: 'https://models.test/' }, modelDir: 'dozer/sparse/0', paths,
    overrides: { 'cam/a.jpg': 'poster/images/cam/a.jpg' } });
  const context = await prepareNativeMedia(files, files.values().next().value!, cameras, images);
  expect(context?.bindings.get('cam/a.jpg')?.mask).toMatchObject({ path: 'poster/masks/cam/a.jpg.png', role: 'validity' });
});
it.each([false, true])('does not treat a missing registered path as ownership of a foreign mask, with unrelated own mask: %s', async extraMask => {
  const files = new Map([['cameras.bin', file('cameras.bin')]]);
  const paths = ['dozer/sparse/0/cameras.bin', 'dozer/sparse/0/images.bin', 'poster/sparse/0/cameras.bin', 'poster/sparse/0/images.bin',
    'poster/masks/poster/a.jpg.png', ...(extraMask ? ['dozer/masks/unregistered.jpg.png'] : [])];
  rememberNativeMediaSource(files, { source: { kind: 'url', baseUrl: 'https://models.test/' }, modelDir: 'dozer/sparse/0', paths });
  const context = await prepareNativeMedia(files, files.values().next().value!, cameras, new Map([[1, buildImage({ name: 'poster/a.jpg' })]]));
  expect(context?.bindings.size).toBe(0);
  expect(context?.nativeMasks?.size).toBe(0);
});
it.each(['local', 'archive', 'url'] as const)('keeps an existing native mask accessible without its missing photo in %s media', async kind => {
  const maskPath = 'scene/masks/cam/a.jpg.png';
  const input = new Map([['scene/sparse/0/cameras.bin', file('cameras.bin')], [maskPath, file('a.jpg.png', pngHeader(8, 4))]]);
  const files = kind === 'local' ? input : new Map([['cameras.bin', input.values().next().value!]]);
  if (kind === 'archive') {
    const entries = new Map([...input].map(([path, value]) => [path, { name: value.name, size: value.size, lastModified: 0,
      extract: async () => value, extractPreview: async () => value }]));
    rememberNativeMediaSource(files, { source: { kind, entries }, modelDir: 'scene/sparse/0' });
    setActiveZipArchive({ close: async () => {}, getFilesArray: async () => [] }, entries);
  } else if (kind === 'url') {
    rememberNativeMediaSource(files, { source: { kind, baseUrl: 'https://masks-only.test/' }, modelDir: 'scene/sparse/0', paths: [...input.keys()] });
    vi.stubGlobal('Blob', NodeBlob);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(pngHeader(8, 4))));
  } else {
    const legacy = buildDatasetState({ sourceType: 'local', loadedFiles: { imageFiles: collectImageFiles(input), hasMasks: true } });
    expect(await getDatasetSourceAdapter('local')!.getMask(legacy, 'cam/a.jpg')).toBe(input.get(maskPath));
  }
  const context = await prepareNativeMedia(files, input.values().next().value!, cameras, images);
  const state = buildDatasetState({ sourceType: kind === 'archive' ? 'zip' : kind,
    loadedFiles: { nativeMedia: context, imageFiles: new Map(), hasMasks: true } });
  const manager = new DatasetManager(() => state);
  expect(manager.hasImages()).toBe(false);
  expect(manager.hasMasks()).toBe(true);
  expect(await manager.getOriginalImage('cam/a.jpg')).toBeNull();
  expect(manager.getImageSync('cam/a.jpg')).toBeUndefined();
  const mask = await manager.getMask('cam/a.jpg');
  expect(mask).not.toBeNull();
  expect(new Uint8Array(await mask!.arrayBuffer())).toEqual(pngHeader(8, 4));
  expect(manager.getMaskSync('cam/a.jpg')).toBe(mask);
  if (kind === 'url') expect(fetch).toHaveBeenCalledWith('https://masks-only.test/' + maskPath, expect.anything());
});
it.each(['local', 'archive'] as const)('keeps exact native photo and mask bindings in %s media', async kind => {
  const input = new Map([['scene/colmap/sparse/0/cameras.bin', file('cameras.bin')],
    ['scene/images/cam/a.jpg', file('a.jpg', pngHeader(4, 2))], // Native previews may be resized.
    ['scene/mask/cam/a.png', file('a.png', pngHeader(4, 2))]]);
  const files = kind === 'local' ? input : new Map([['sparse/0/cameras.bin', input.values().next().value!]]);
  if (kind === 'archive') {
    const entries = new Map([...input].map(([path, value]) => [path, { name: value.name, size: value.size, lastModified: 0,
      extract: async () => value, extractPreview: async () => value }]));
    rememberNativeMediaSource(files, { source: { kind, entries }, modelDir: 'scene/colmap/sparse/0' });
    setActiveZipArchive({ close: async () => {}, getFilesArray: async () => [] }, entries);
  }
  const context = await prepareNativeMedia(files, input.values().next().value!, cameras, images);
  expect(context?.selection.schema).toBe('colmap');
  expect(context?.bindings.get('cam/a.jpg')).toMatchObject({ sourceImagePath: 'scene/images/cam/a.jpg', mask: { path: 'scene/mask/cam/a.png', role: 'unknown' } });
  const state = buildDatasetState({ sourceType: kind === 'local' ? 'local' : 'zip', loadedFiles: { nativeMedia: context, imageFiles: new Map(), hasMasks: true } });
  const stable = new DatasetManager(() => state);
  expect(stable.hasMasks()).toBe(true);
  expect(await stable.getOriginalImage('cam/a.jpg')).toBe(input.get('scene/images/cam/a.jpg'));
  expect(await stable.getMask('cam/a.jpg')).toBe(input.get('scene/mask/cam/a.png'));
  if (kind === 'local') {
    expect(stable.getImageSync('cam/a.jpg')).toBe(input.get('scene/images/cam/a.jpg'));
    expect(stable.getMaskSync('cam/a.jpg')).toBe(input.get('scene/mask/cam/a.png'));
  }
});
it('uses the nearest CSV for original names and cannot borrow a foreign scene mapping', async () => {
  const files = new Map([['scene/sparse/0/cameras.bin', file('cameras.bin')],
    ['scene/image_mapping.csv', file('image_mapping.csv', 'colmap_image,raw_path\ncam/a.jpg,scene/raw/camera one/original.JPG\n')],
    ['other/sparse/0/image_mapping.csv', file('image_mapping.csv', 'colmap_image,raw_path\ncam/a.jpg,other/raw/a.jpg\n')],
    ['scene/raw/camera one/original.JPG', file('original.JPG')]]);
  const context = await prepareNativeMedia(files, files.values().next().value!, cameras, images);
  expect(context?.bindings.get('cam/a.jpg')?.sourceImagePath).toBe('scene/raw/camera one/original.JPG');
  files.delete('scene/image_mapping.csv');
  const unmapped = await prepareNativeMedia(files, files.values().next().value!, cameras, images);
  expect(unmapped?.bindings.size).toBe(0);
});
it('leaves collisions unbound instead of selecting the first basename', async () => {
  const files = new Map([['scene/model/cameras.bin', file('cameras.bin')], ['scene/left/cam/a.jpg', file('a.jpg')], ['scene/right/cam/a.jpg', file('a.jpg')]]);
  const context = await prepareNativeMedia(files, files.values().next().value!, cameras, images);
  expect(context?.bindings.size).toBe(0);
  expect(context?.diagnostics).toContainEqual(expect.objectContaining({ code: 'AMBIGUOUS_IMAGE_PATH' }));
});
it('keeps URL source ownership and exact paths without eager media requests', async () => {
  const files = new Map([['cameras.bin', file('cameras.bin')]]);
  const source: CameraDatasetSource = { kind: 'url', baseUrl: 'https://example.test/pinned/' };
  rememberNativeMediaSource(files, { source, modelDir: 'scene/colmap/0', paths: ['scene/rgb/cam/a.jpg', 'scene/fg_masks/cam/a.png'] });
  const context = await prepareNativeMedia(files, files.values().next().value!, cameras, images);
  expect(context?.source).toBe(source);
  expect(context?.bindings.get('cam/a.jpg')).toMatchObject({ sourceImagePath: 'scene/rgb/cam/a.jpg', mask: { path: 'scene/fg_masks/cam/a.png' } });
});
it('retains native geometry-only behavior without inventing a media source', async () => {
  const files = new Map([['cameras.bin', file('cameras.bin')]]);
  expect(await prepareNativeMedia(files, files.values().next().value!, cameras, images)).toBeUndefined();
});

it('automatically recovers a complete unique flattened collection beside its model', async () => {
  const files = new Map([['scene/sparse/0/cameras.bin', file('cameras.bin')], ['scene/images/a.jpg', file('a.jpg')]]);
  const context = await prepareNativeMedia(files, files.values().next().value!, cameras, images);
  expect(context?.bindings.get('cam/a.jpg')?.sourceImagePath).toBe('scene/images/a.jpg');
  expect(context?.diagnostics).toContainEqual(expect.objectContaining({ code: 'PHOTO_COLLECTION' }));
});
it('asks before borrowing a complete shared collection from another branch of the same named scene', async () => {
  const files = new Map([['models/fortress/sparse/0/cameras.bin', file('cameras.bin')], ['photos/fortress/sparse/0/cameras.bin', file('cameras.bin')],
    ['photos/fortress/sparse/0/images.bin', file('images.bin')], ['photos/fortress/images/cam/a.jpg', file('a.jpg')]]);
  const selectPhotos = vi.fn<SelectCameraDataset>(async choices => choices[0]);
  const context = await prepareNativeMedia(files, files.values().next().value!, cameras, images, undefined, { selectPhotos });
  expect(selectPhotos).toHaveBeenCalledOnce();
  expect(selectPhotos.mock.calls[0][0][0]).toMatchObject({ purpose: 'photos', sceneRoot: 'photos/fortress/images' });
  expect(context?.bindings.get('cam/a.jpg')?.sourceImagePath).toBe('photos/fortress/images/cam/a.jpg');
});
it('does not offer a different named scene merely because frame filenames match', async () => {
  const files = new Map([['dozer/sparse/0/cameras.bin',file('cameras.bin')],['poster/sparse/0/cameras.bin',file('cameras.bin')],
    ['poster/sparse/0/images.bin',file('images.bin')],['poster/images/cam/a.jpg',file('a.jpg')]]);
  const selectPhotos=vi.fn<SelectCameraDataset>(async choices=>choices[0]);
  const context=await prepareNativeMedia(files,files.values().next().value!,cameras,images,undefined,{selectPhotos});
  expect(selectPhotos).not.toHaveBeenCalled();expect(context?.bindings.size).toBe(0);
});
it('allows choosing a photo variant or retaining cameras without guessing', async () => {
  const files = new Map([['scene/sparse/0/cameras.bin', file('cameras.bin')],
    ['scene/left/cam/a.jpg', file('a.jpg')], ['scene/right/cam/a.jpg', file('a.jpg')]]);
  const selected = await prepareNativeMedia(files, files.values().next().value!, cameras, images, undefined,
    { selectPhotos: async choices => choices.find(choice => choice.sceneRoot === 'scene/right')! });
  expect(selected?.bindings.get('cam/a.jpg')?.sourceImagePath).toBe('scene/right/cam/a.jpg');
  const keep = await prepareNativeMedia(files, files.values().next().value!, cameras, images, undefined,
    { selectPhotos: async choices => choices.find(choice => choice.path === 'photos:keep')! });
  expect(keep?.bindings.size).toBe(0);
  await expect(prepareNativeMedia(files, files.values().next().value!, cameras, images, undefined,
    { selectPhotos: async () => null })).rejects.toMatchObject({ name: 'AbortError' });
});
it('binds declared split-host media and mask roles without eager requests', async () => {
  const files = new Map([['cameras.bin', file('cameras.bin')]]);
  rememberNativeMediaSource(files, { source: { kind: 'url', baseUrl: 'https://models.test/pinned/' }, modelDir: '',
    declaredImageRoot: 'https://rgb.test/photos/', overrides: { 'cam/a.jpg': 'https://rgb.test/raw/a.png?token=percent%2Fvalue' },
    maskOverrides: { 'cam/a.jpg': 'https://masks.test/a.png' }, maskRole: 'foreground' });
  const context = await prepareNativeMedia(files, files.values().next().value!, cameras, images);
  expect(context?.bindings.get('cam/a.jpg')).toMatchObject({ sourceImagePath: 'https://rgb.test/raw/a.png?token=percent%2Fvalue',
    mask: { path: 'https://masks.test/a.png', role: 'foreground' } });
});
it('lets an explicit mask list override a declared mask prefix',async()=>{
  const files=new Map([['cameras.bin',file('cameras.bin')]]);
  rememberNativeMediaSource(files,{source:{kind:'url',baseUrl:'https://example.test/'},modelDir:'',declaredImageRoot:'https://rgb.test/',
    declaredMaskRoot:'https://example.test/missing-masks/',maskPaths:['foreground_masks/cam/a.png'],maskRole:'foreground'});
  const context=await prepareNativeMedia(files,files.values().next().value!,cameras,images);
  expect(context?.bindings.get('cam/a.jpg')?.mask).toMatchObject({path:'foreground_masks/cam/a.png',role:'foreground'});
});
it('binds a declared custom mask prefix from a complete listing without inventing missing masks',async()=>{
  const files=new Map([['cameras.bin',file('cameras.bin')]]);
  const paths=['photos/cam/a.jpg','annotations/cam/a.jpg.png'];
  rememberNativeMediaSource(files,{source:{kind:'url',baseUrl:'https://example.test/'},modelDir:'',paths,
    declaredImageRoot:'https://example.test/photos/',declaredMaskRoot:'https://example.test/annotations/'});
  const context=await prepareNativeMedia(files,files.values().next().value!,cameras,images);
  expect(context?.bindings.get('cam/a.jpg')?.mask).toMatchObject({path:'annotations/cam/a.jpg.png',role:'validity'});
  paths.pop();
  const missing=await prepareNativeMedia(files,files.values().next().value!,cameras,images);
  expect(missing?.bindings.get('cam/a.jpg')?.mask).toBeUndefined();
});
it('keeps explicit empty image and mask lists authoritative',async()=>{
  const files=new Map([['cameras.bin',file('cameras.bin')]]);
  const hint={source:{kind:'url' as const,baseUrl:'https://example.test/'},modelDir:'',
    declaredImageRoot:'https://example.test/photos/',declaredMaskRoot:'https://example.test/masks/'};
  rememberNativeMediaSource(files,{...hint,imagePaths:[],maskPaths:['annotations/cam/a.jpg.png']});
  expect((await prepareNativeMedia(files,files.values().next().value!,cameras,images))?.bindings.size).toBe(0);
  rememberNativeMediaSource(files,{...hint,maskPaths:[]});
  expect((await prepareNativeMedia(files,files.values().next().value!,cameras,images))?.bindings.get('cam/a.jpg')?.mask).toBeUndefined();
});
it('preserves literal percent signs and spaces under a listed declared mask prefix',async()=>{
  const files=new Map([['cameras.bin',file('cameras.bin')]]),name='cam/a b%.jpg';
  rememberNativeMediaSource(files,{source:{kind:'url',baseUrl:'https://example.test/'},modelDir:'',
    paths:['photos/'+name,'annotations/'+name+'.png'],declaredImageRoot:'https://example.test/photos/',declaredMaskRoot:'https://example.test/annotations/'});
  const context=await prepareNativeMedia(files,files.values().next().value!,cameras,new Map([[1,buildImage({name})]]));
  expect(context?.bindings.get(name)?.mask).toMatchObject({kind:'file',path:'annotations/'+name+'.png'});
});
