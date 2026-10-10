import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBucketConnection } from './connection';
import { createBucketPublicationController } from './publishDataset';
import type { PreparedPublication } from '../datasetPublishing/types';
import { ColmapManifestSchema } from '../../types/manifest';

beforeEach(() => vi.stubGlobal('Blob', NodeBlob));
afterEach(() => vi.unstubAllGlobals());
function prepared(): PreparedPublication {
  const paths = ['sparse/0/cameras.bin', 'sparse/0/images.bin', 'sparse/0/points3D.bin', 'sparse/0/rigs.bin', 'images/photo.jpg', 'masks/photo.jpg.png', 'splats/scene.sog', 'colmapview.yaml'];
  return { operationId: 'prepare-id', sourceKey: 'scene', modelRevision: 0, viewerState: { version: 1, viewerVersion: 'test', viewState: null, config: {} },
    counts: { cameras: 1, images: 1, points: 1 }, imageNameToPath: { 'photo.jpg': 'images/photo.jpg' }, splatPaths: ['splats/scene.sog'],
    viewerBaseUrl: 'https://viewer.example/?old=value#old', assets: paths.map(path => ({ path, kind: path.includes('images/photo') ? 'image' as const : path.includes('masks/') ? 'mask' as const : 'colmap' as const,
      size: path.length, open: async () => new Blob([path]), release: vi.fn() })) };
}
function session(publicUrl = false) {
  return createBucketConnection().connect({ baseUrl: 'https://s3.example/bucket/', region: 'auto', ...(publicUrl ? { publicBaseUrl: 'https://public.example/' } : {}) },
    { accessKeyId: 'fixture-key', secretAccessKey: 'fixture-secret' });
}
describe('bucket dataset publication', () => {
  it.each([false, true])('publishes assets before a verified manifest and makes credential-free viewer links (public domain: %s)', async publicUrl => {
    const blobs = new Map<string, Blob>();
    const input = prepared();
    const releases = input.assets.map(asset => asset.release!);
    const upload = vi.fn(async (_session, key, blob) => { blobs.set(key, blob); });
    const verify = vi.fn(async (_session, url) => {
      const key = decodeURIComponent(new URL(url).pathname.replace('/bucket/', ''));
      return blobs.get(key)!.text();
    });
    const publisher = createBucketPublicationController({ upload, verify });
    await publisher.publish(session(publicUrl), 'datasets/scene', async () => input, () => {});
    const state = publisher.getSnapshot();
    expect(state.phase).toBe('completed');
    expect(state.filesDone).toBe(input.assets.length + 1);
    expect([...blobs.keys()].at(-1)).toBe(state.prefix + 'manifest.json');
    const manifest = JSON.parse(await [...blobs.values()].at(-1)!.text());
    expect(ColmapManifestSchema.safeParse(manifest).success).toBe(true);
    expect(manifest.baseUrl).toBe((publicUrl ? 'https://public.example/' : 'https://s3.example/bucket/') + state.prefix);
    expect(manifest.files.rigs).toBe('sparse/0/rigs.bin');
    expect(manifest.splats).toEqual(['splats/scene.sog']);
    const link = new URL(state.viewerUrl!);
    expect(link.searchParams.get('url')).toBe(state.manifestUrl);
    expect(link.searchParams.has('old')).toBe(false);
    expect(JSON.stringify(manifest) + state.viewerUrl).not.toMatch(/fixture-key|fixture-secret|X-Amz-/);
    expect(releases.every(release => vi.mocked(release).mock.calls.length === 1)).toBe(true);
  });
  it('uses fresh publication prefixes and does not overwrite an earlier dataset', async () => {
    let manifest = '';
    const upload = vi.fn(async (_session, key, blob) => { if (key.endsWith('manifest.json')) manifest = await blob.text(); });
    const publisher = createBucketPublicationController({ upload, verify: async () => manifest });
    const target = session();
    await publisher.publish(target, 'scene', async () => prepared(), () => {});
    const first = publisher.getSnapshot().prefix;
    publisher.reset();
    await publisher.publish(target, 'scene', async () => prepared(), () => {});
    expect(publisher.getSnapshot().prefix).not.toBe(first);
  });
  it('refuses stale data before mutation and releases all transient buffers', async () => {
    const input = prepared();
    const releases = input.assets.map(asset => asset.release!);
    let changed = false;
    const upload = vi.fn();
    const publisher = createBucketPublicationController({ upload });
    await publisher.publish(session(), 'scene', async () => { changed = true; return input; }, () => { if (changed) throw new Error('changed'); });
    expect(publisher.getSnapshot().phase).toBe('failed');
    expect(upload).not.toHaveBeenCalled();
    expect(releases.every(release => vi.mocked(release).mock.calls.length === 1)).toBe(true);
  });
  it('does not publish a manifest after cancellation or a changed file size', async () => {
    const upload = vi.fn();
    const publisher = createBucketPublicationController({ upload });
    const input = prepared(); input.assets[0].size = 0;
    await publisher.publish(session(), 'scene', async () => input, () => {});
    expect(publisher.getSnapshot().error).toMatch(/source file changed/);
    expect(upload).not.toHaveBeenCalled();
    const pending = createBucketPublicationController({ upload: async () => { pending.cancel(); } });
    await pending.publish(session(), 'scene', async () => prepared(), () => {});
    expect(pending.getSnapshot().phase).toBe('cancelled');
    expect(pending.getSnapshot().viewerUrl).toBeUndefined();
  });
  it('rejects read-only connections and unsafe destinations before preparation', async () => {
    const publisher = createBucketPublicationController();
    const prepare = vi.fn();
    const anonymous = createBucketConnection().connect({ baseUrl: 'https://public.example/', region: 'auto' });
    await expect(publisher.publish(anonymous, 'scene', prepare, () => {})).rejects.toThrow('access key');
    await expect(publisher.publish(session(), '../scene', prepare, () => {})).rejects.toThrow('bucket path');
    expect(prepare).not.toHaveBeenCalled();
  });
  it('does not report success if the manifest readback differs', async () => {
    const publisher = createBucketPublicationController({ upload: vi.fn(), verify: async () => '{}' });
    await publisher.publish(session(), 'scene', async () => prepared(), () => {});
    expect(publisher.getSnapshot().phase).toBe('failed');
    expect(publisher.getSnapshot().viewerUrl).toBeUndefined();
    expect(publisher.getSnapshot().error).toMatch(/confirm/);
  });
});
