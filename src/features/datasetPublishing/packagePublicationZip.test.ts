import { Blob as NodeBlob } from 'node:buffer';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { packagePublicationZip, packageZipPublication } from './packagePublicationZip';
import type { PreparedPublication, PublishAsset } from './types';
import { parseDatasetViewerSettings, serializeDatasetViewerSettings } from '../../utils/datasetViewerSettings';

beforeEach(() => vi.stubGlobal('Blob', NodeBlob));
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
