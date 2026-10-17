import { File as NodeFile } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCamera, buildImage } from '../test/builders';
import type { ArchiveEntry } from '../archive/types';
import type { CameraDatasetSource } from './importers/types';
import { imageResourceUrl } from './importers/sourcePaths';
import { prepareNativeMedia, rememberNativeMediaSource } from './nativeMedia';

beforeEach(() => vi.stubGlobal('File', NodeFile));
afterEach(() => vi.unstubAllGlobals());
const kinds = ['local', 'archive', 'url-relative', 'url-absolute', 'url-signed'] as const;
type Kind = typeof kinds[number];
const baseUrl = 'https://media.test/pinned%20data/';
const modelDir = 'dozer/sparse/0';
const metadata = ['dozer', 'poster'].flatMap(scene => ['cameras.bin', 'images.bin'].map(name => `${scene}/sparse/0/${name}`));
const registered = 'cam/a.jpg';
const cameras = new Map([[9, buildCamera({ cameraId: 9, width: 8, height: 4 })]]);
const images = new Map([[7, buildImage({ imageId: 7, cameraId: 9, name: registered })]]);
const resource = (kind: Kind, path: string) => kind === 'url-absolute' || kind === 'url-signed'
  ? imageResourceUrl(baseUrl, path) + (kind === 'url-signed' ? '?token=exact%2Fvalue' : '') : path;

async function prepare(kind: Kind, paths: readonly string[], options: {
  photo: string; imagePaths?: readonly string[]; maskPaths?: readonly string[]; withoutListing?: boolean;
}) {
  const files = new Map(paths.map(path => [path, new NodeFile(['source:' + path], path.split('/').pop()!) as unknown as File]));
  const cameraFile = files.get(modelDir + '/cameras.bin')!;
  let source: CameraDatasetSource;
  if (kind === 'local') source = { kind: 'local', files };
  else if (kind === 'archive') {
    const entries = new Map<string, ArchiveEntry>([...files].map(([path, value]) => [path, { name: path, size: value.size, lastModified: 0,
      extract: async () => value, extractPreview: async () => value }]));
    source = { kind: 'archive', entries };
  } else source = { kind: 'url', baseUrl };
  rememberNativeMediaSource(files, { source, modelDir, paths: options.withoutListing ? undefined : paths,
    imagePaths: options.imagePaths, maskPaths: options.maskPaths, declaredImageRoot: baseUrl + 'images/',
    overrides: { [registered]: options.photo } });
  const context = await prepareNativeMedia(files, cameraFile, cameras, images);
  expect(context?.bindings.size).toBe(1);
  expect(images.get(7)?.name).toBe(registered);
  return context!.bindings.get(registered)!;
}

describe('shared-photo ownership across native source types', () => {
  for (const kind of kinds) for (const declared of [false, true]) for (const ownMask of [false, true]) for (const peerMask of [false, true]) {
    it(`${kind}, declared masks ${declared}, own mask ${ownMask}, peer mask ${peerMask}`, async () => {
      const photo = 'poster/images/' + registered, own = 'dozer/masks/' + registered + '.png', peer = 'poster/masks/' + registered + '.png';
      const masks = [...(ownMask ? [own] : []), ...(peerMask ? [peer] : [])];
      const binding = await prepare(kind, [...metadata, photo, ...masks], { photo: resource(kind, photo),
        maskPaths: declared ? masks.map(path => resource(kind, path)) : undefined });
      expect(binding.sourceImagePath).toBe(resource(kind, photo));
      if (peerMask) expect(binding.mask).toMatchObject({ path: declared ? resource(kind, peer) : peer, role: 'validity' });
      else expect(binding.mask).toBeUndefined();
    });
  }
});

describe('per-image mappings have the same precedence as per-mask mappings', () => {
  for (const kind of kinds) for (const empty of [false, true]) {
    it(`${kind}, explicit photo outside ${empty ? 'empty' : 'unrelated'} role list`, async () => {
      const photo = 'dozer/segmentation/cam/a.png';
      const binding = await prepare(kind, [...metadata, photo, 'dozer/images/unrelated.jpg'], { photo: resource(kind, photo),
        imagePaths: empty ? [] : ['dozer/images/unrelated.jpg'] });
      expect(binding.sourceImagePath).toBe(resource(kind, photo));
    });
  }
  for (const kind of kinds.filter(kind => kind.startsWith('url'))) for (const empty of [false, true]) {
    it(`${kind}, explicit photo without listing outside ${empty ? 'empty' : 'unrelated'} role list`, async () => {
      const photo = 'dozer/segmentation/cam/a.png';
      const binding = await prepare(kind, metadata, { photo: resource(kind, photo), withoutListing: true,
        imagePaths: empty ? [] : ['unrelated.jpg'] });
      expect(binding.sourceImagePath).toBe(imageResourceUrl(baseUrl, resource(kind, photo)));
    });
  }
});

describe('mask semantics follow a renamed physical photo', () => {
  for (const kind of kinds) for (const conventional of [false, true]) {
    it(`${kind}, ${conventional ? 'full physical filename' : 'stem-only filename'}`, async () => {
      const photo = 'poster/images/raw/original.png';
      const mask = 'poster/masks/raw/' + (conventional ? 'original.png.png' : 'original_mask.png');
      const binding = await prepare(kind, [...metadata, photo, mask], { photo: resource(kind, photo), maskPaths: [resource(kind, mask)] });
      expect(binding.mask).toMatchObject({ path: resource(kind, mask), role: conventional ? 'validity' : 'unknown' });
    });
  }
});
