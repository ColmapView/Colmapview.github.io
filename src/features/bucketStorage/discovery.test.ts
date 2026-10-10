import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bucketConnection } from './connection';
import { discoverBucketManifest } from './discovery';
import { withDiscoveredColmapPaths } from '../../hooks/urlLoaderManifestFetch';
import { createDefaultManifest } from '../../hooks/urlLoaderPolicy';

const root = 'https://s3.example/bucket/';
beforeEach(() => vi.stubGlobal('Blob', NodeBlob));
afterEach(() => { bucketConnection.disconnect(); vi.unstubAllGlobals(); });
const xml = (paths: string[], next?: string) => '<ListBucketResult>' + paths.map(key => `<Contents><Key>${key}</Key><Size>12</Size></Contents>`).join('')
  + `<IsTruncated>${Boolean(next)}</IsTruncated>${next ? `<NextContinuationToken>${next}</NextContinuationToken>` : ''}</ListBucketResult>`;

describe('bucket dataset discovery', () => {
  it.each(['scene/', 'scene', ''])('discovers text models through the shared folder loader for "%s"', async folder => {
    bucketConnection.connect({ baseUrl: root, region: 'auto' });
    const prefix = folder ? 'scene/' : '';
    const fetch = vi.fn(async (url: string) => {
      expect(new URL(url).searchParams.get('prefix')).toBe(prefix);
      return new Response(xml(['sparse/0/cameras.txt', 'sparse/0/images.txt', 'sparse/0/points3D.txt', 'images/photo.jpg']
        .map(path => prefix + path)));
    });
    const manifest = await withDiscoveredColmapPaths(createDefaultManifest(root + folder), { fetchImpl: fetch });
    expect(manifest.files).toEqual({ cameras: 'sparse/0/cameras.txt', images: 'sparse/0/images.txt', points3D: 'sparse/0/points3D.txt' });
    expect(manifest.baseUrl).toBe(root + prefix);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('finds relocated COLMAP, original nested images, and splats across paginated metadata', async () => {
    bucketConnection.connect({ baseUrl: root, region: 'auto' });
    const fetch = vi.fn(async (url: string) => {
      const query = new URL(url).searchParams;
      expect(query.get('prefix')).toBe('scene/');
      expect(query.has('delimiter')).toBe(false);
      return new Response(query.has('continuation-token')
        ? xml(['scene/corrected/images/cam1/photo.jpg', 'scene/corrected/splats/scene.sog'])
        : xml(['scene/colmap/cameras.bin', 'scene/colmap/images.bin', 'scene/colmap/points3D.bin', 'scene/colmap/rigs.bin'], 'next'));
    });
    const manifest = await discoverBucketManifest(root + 'scene/', fetch);
    expect(manifest?.files).toEqual({ cameras: 'colmap/cameras.bin', images: 'colmap/images.bin', points3D: 'colmap/points3D.bin', rigs: 'colmap/rigs.bin' });
    expect(manifest?.imagesPath).toBe('corrected/images/');
    expect(manifest?.masksPath).toBe('corrected/masks/');
    expect(manifest?.splats).toEqual(['corrected/splats/scene.sog']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('delegates the listed image_mapping.csv convention to the shared image resolver', async () => {
    bucketConnection.connect({ baseUrl: root, region: 'auto' });
    const fetch = vi.fn(async (url: string) => new Response(url.endsWith('image_mapping.csv')
      ? 'colmap_image,raw_path\nphoto.jpg,images/renamed.jpg\n'
      : xml(['scene/cameras.bin', 'scene/images.bin', 'scene/points3D.bin', 'scene/images/renamed.jpg', 'scene/image_mapping.csv'])));
    const manifest = await discoverBucketManifest(root + 'scene/', fetch);
    expect(manifest?.imageNameToPath).toEqual({ 'photo.jpg': 'images/renamed.jpg' });
    expect(fetch.mock.calls.some(([url]) => url.endsWith('image_mapping.csv'))).toBe(true);
  });
  it('never lists unrelated origins or buckets', async () => {
    bucketConnection.connect({ baseUrl: root, region: 'auto' });
    const fetch = vi.fn();
    expect(await discoverBucketManifest('https://other.example/scene/', fetch)).toBeNull();
    expect(await discoverBucketManifest('https://s3.example/another/scene/', fetch)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('stops repeating pagination tokens instead of looping forever', async () => {
    bucketConnection.connect({ baseUrl: root, region: 'auto' });
    const fetch = vi.fn(async () => new Response(xml(['scene/cameras.bin'], 'repeated')));
    await expect(discoverBucketManifest(root + 'scene/', fetch)).rejects.toThrow('repeated a listing');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('uses conventional object paths when public reads are allowed but listing is denied', async () => {
    bucketConnection.connect({ baseUrl: root, region: 'auto' });
    const fallback = { version: 1, baseUrl: root + 'scene/', files: { cameras: 'sparse/0/cameras.bin', images: 'sparse/0/images.bin', points3D: 'sparse/0/points3D.bin' } };
    expect(await withDiscoveredColmapPaths(fallback, { fetchImpl: async () => new Response(null, { status: 403 }) })).toEqual(fallback);
  });
});
