import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { packagePublicationZip, packageZipPublication } from './packagePublicationZip';
import type { PreparedPublication, PublishAsset } from './types';
import { parseDatasetViewerSettings, serializeDatasetViewerSettings } from '../../utils/datasetViewerSettings';

beforeEach(() => { vi.stubGlobal('Blob', NodeBlob); vi.stubGlobal('File', NodeFile); });
afterEach(() => vi.unstubAllGlobals());
const signal = () => new AbortController().signal;
const asset = (path: string, kind: PublishAsset['kind'], bytes: string | Uint8Array): PublishAsset => {
  const blob = new Blob([typeof bytes === 'string' ? bytes : new Uint8Array(bytes)]);
  return { path, kind, size: blob.size, open: vi.fn(async () => blob), release: vi.fn() };
};
function prepared(): PreparedPublication {
  const viewerState: PreparedPublication['viewerState'] = { version: 1, viewerVersion: 'test', viewState: null, config: {} };
  return { operationId: 'operation', sourceKey: 'source', modelRevision: 0, viewerState,
    counts: { cameras: 1, images: 1, points: 1 }, imageNameToPath: { 'nested/photo.jpg': 'images/nested/photo.jpg' },
    splatPaths: ['splats/scene.sog'], viewerBaseUrl: 'https://viewer.example/', previewPath: 'cover.png',
    assets: [asset('sparse/0/cameras.bin', 'colmap', 'camera'), asset('sparse/0/images.bin', 'colmap', 'image'),
      asset('sparse/0/points3D.bin', 'colmap', 'point'), asset('images/nested/photo.jpg', 'image', new Uint8Array([255, 216, 1, 128, 0, 255])),
      asset('masks/nested/photo.jpg.png', 'mask', 'original mask'), asset('splats/scene.sog', 'splat', 'original splat'),
      asset('colmapview.yaml', 'viewer-state', serializeDatasetViewerSettings(viewerState)), asset('cover.png', 'preview', 'cover')],
  };
}

describe('shared publication ZIP', () => {
  it('converts only images in one encoder and counts encoded sizes so oversized originals can produce a fitting ZIP', async () => {
    const first = asset('images/first.jpg', 'image', new Uint8Array(5000)), second = asset('images/second.jpg', 'image', new Uint8Array(5000));
    const assets = [first, asset('masks/first.jpg.png', 'mask', 'lossless mask'), asset('sparse/0/images.bin', 'colmap', 'model'),
      second, asset('splats/scene.sog', 'splat', 'splat'), asset('cover.png', 'preview', 'cover')];
    const releases = assets.map(item => item.release!);
    const encode = vi.fn(async () => new File([new Uint8Array([255, 216, 255, 217])], 'image.jpg', { type: 'image/jpeg' }));
    const close = vi.fn(async () => {}), createImageEncoder = vi.fn(() => ({ encode, close }));
    const result = await packagePublicationZip(assets, signal(), () => {}, () => {}, { imageFormat: 'jpeg', sizeLimit: 3000, createImageEncoder });
    const files = unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
    expect(createImageEncoder).toHaveBeenCalledOnce(); expect(encode).toHaveBeenCalledTimes(2); expect(close).toHaveBeenCalledOnce();
    expect(encode).toHaveBeenCalledWith(expect.any(Blob), 0.85, expect.any(AbortSignal));
    expect([...files['images/first.jpg']]).toEqual([255, 216, 255, 217]);
    expect(strFromU8(files['masks/first.jpg.png'])).toBe('lossless mask');
    expect(strFromU8(files['sparse/0/images.bin'])).toBe('model'); expect(strFromU8(files['splats/scene.sog'])).toBe('splat');
    expect(strFromU8(files['cover.png'])).toBe('cover');
    expect(result.files.find(file => file.path === first.path)?.size).toBe(4);
    releases.forEach(release => expect(release).toHaveBeenCalledOnce());
  });
  it('never starts an encoder when original-byte output is selected', async () => {
    const encode = vi.fn(), close = vi.fn(async () => {}), createImageEncoder = vi.fn(() => ({ encode, close }));
    const result = await packagePublicationZip([asset('images/photo.jpg', 'image', 'original')], signal(), () => {}, () => {}, { createImageEncoder });
    expect(strFromU8(unzipSync(new Uint8Array(await result.blob.arrayBuffer()))['images/photo.jpg'])).toBe('original');
    expect(createImageEncoder).not.toHaveBeenCalled();
  });
  it.each(['cancel', 'failure', 'source-change'] as const)('disposes the encoder and source buffers after JPEG %s', async reason => {
    const owner = new AbortController(), assets = [asset('images/photo.jpg', 'image', 'source'), asset('images/next.jpg', 'image', 'next')];
    const releases = assets.map(item => item.release!);
    if (reason === 'source-change') assets[0].size = 100;
    const encode = vi.fn(async () => {
      if (reason === 'cancel') owner.abort();
      if (reason === 'failure') throw new Error('Choose Original images instead.');
      return new File(['jpeg'], 'image.jpg', { type: 'image/jpeg' });
    });
    const close = vi.fn(async () => {}), createImageEncoder = vi.fn(() => ({ encode, close }));
    await expect(packagePublicationZip(assets, owner.signal, () => {}, () => {}, { imageFormat: 'jpeg', createImageEncoder })).rejects.toThrow();
    if (reason === 'source-change') expect(createImageEncoder).not.toHaveBeenCalled(); else expect(close).toHaveBeenCalledOnce();
    expect(assets[1].open).not.toHaveBeenCalled(); releases.forEach(release => expect(release).toHaveBeenCalledOnce());
  });
  it('preserves nested names and exact original bytes, and makes a complete portable object', async () => {
    const input = prepared();
    const releases = input.assets.map(item => item.release!);
    const result = await packageZipPublication(input, signal(), () => {}, () => {});
    expect(result.assets.map(item => item.path)).toEqual(['dataset.zip']);
    expect(result.archive?.size).toBe(result.assets[0].size);
    const blob = await result.assets[0].open(signal());
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(files)).toEqual(input.assets.map(item => item.path));
    expect([...files['images/nested/photo.jpg']]).toEqual([255, 216, 1, 128, 0, 255]);
    expect(strFromU8(files['masks/nested/photo.jpg.png'])).toBe('original mask');
    expect(strFromU8(files['splats/scene.sog'])).toBe('original splat');
    expect(parseDatasetViewerSettings(strFromU8(files['colmapview.yaml']))).toEqual(input.viewerState);
    expect(result.archive?.files).toEqual(Object.entries(files).map(([path, bytes]) => ({ path, size: bytes.length })));
    expect(result.archive?.summary).toEqual({ format: 'zip', imageFormat: 'original', colmap: { files: 3, cameras: 1, points: 1 },
      images: 1, masks: 1, splats: 1, viewerSettings: true, preview: true });
    releases.forEach(release => expect(release).toHaveBeenCalledOnce());
  });

  it('keeps the repository cover and settings beside the ZIP without duplicating loose dataset files', async () => {
    const input = prepared();
    const result = await packageZipPublication(input, signal(), () => {}, () => {}, { repositorySidecars: true });
    expect(result.assets.map(item => item.path)).toEqual(['dataset.zip', 'cover.png', 'colmapview.yaml']);
    const archive = unzipSync(new Uint8Array(await (await result.assets[0].open(signal())).arrayBuffer()));
    expect(archive['cover.png']).toBeUndefined();
    expect(strFromU8(archive['colmapview.yaml'])).toBe(await (await result.assets[2].open(signal())).text());
    expect(result.previewPath).toBe('cover.png');
    expect(result.counts).toEqual(input.counts);
    expect(result.archive?.summary).toEqual({ format: 'zip', imageFormat: 'original', colmap: { files: 3, cameras: 1, points: 1 },
      images: 1, masks: 1, splats: 1, viewerSettings: true, preview: true });
  });

  it.each(['images/a.jpg', '../escape.jpg', '/absolute.jpg'])('rejects duplicate or unsafe paths before reading sources: %s', async path => {
    const assets = [asset(path, 'image', 'first'), asset(path, 'image', 'second')];
    const releases = assets.map(item => item.release!);
    await expect(packagePublicationZip(assets, signal(), () => {}, () => {})).rejects.toThrow();
    assets.forEach(item => expect(item.open).not.toHaveBeenCalled());
    releases.forEach(release => expect(release).toHaveBeenCalledOnce());
  });

  it('treats equivalent Unicode paths as a collision', async () => {
    const assets = [asset('images/é.jpg', 'image', 'first'), asset('images/e\u0301.jpg', 'image', 'second')];
    await expect(packagePublicationZip(assets, signal(), () => {}, () => {})).rejects.toMatchObject({ permanent: true });
    assets.forEach(item => expect(item.open).not.toHaveBeenCalled());
  });

  it('flushes multiple Blob parts while preserving a large original file', async () => {
    const bytes = new Uint8Array(9 * 1024 * 1024); bytes[0] = 255; bytes[bytes.length - 1] = 128;
    const result = await packagePublicationZip([asset('scene.sog', 'splat', bytes)], signal(), () => {}, () => {});
    const files = unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
    const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
    expect(hash(files['scene.sog'])).toBe(hash(bytes));
    expect(result.files).toEqual([{ path: 'scene.sog', size: bytes.length }]);
  });

  it('cancels during packaging, releases every source and never reads the next file', async () => {
    const controller = new AbortController();
    const input = prepared();
    const releases = input.assets.map(item => item.release!);
    await expect(packageZipPublication(input, controller.signal, message => {
      if (message.startsWith('Packaged')) controller.abort();
    }, () => {}, { repositorySidecars: true })).rejects.toThrow();
    expect(input.assets[1].open).not.toHaveBeenCalled();
    releases.forEach(release => expect(release).toHaveBeenCalledOnce());
  });
});
