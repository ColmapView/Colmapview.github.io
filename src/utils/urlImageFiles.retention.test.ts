import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildResponse } from '../test/builders';
import { getDatasetSourceAdapter } from '../dataset/datasetSourceAdapters';
import type { DatasetState } from '../dataset/types';

vi.mock('../dataset/urlFileCache', async importOriginal => {
  const actual = await importOriginal<typeof import('../dataset/urlFileCache')>();
  return { ...actual, createUrlFileCache: () => actual.createUrlFileCache(12) };
});
vi.mock('./imageFileCompression', () => ({
  compressAndResizeToJpeg: async (_blob: Blob, name: string) => new File(['xx'], name),
}));

import { clearUrlImageCache, fetchUrlImage, fetchUrlMask, getUrlImageCached, getUrlMaskCached } from './urlImageFiles';

const imageBase = 'https://retention.test/images/';
const maskBase = 'https://retention.test/masks/';
afterEach(() => { clearUrlImageCache(); vi.unstubAllGlobals(); });

describe('URL snapshot and consumer recency', () => {
  it('refreshes async adapter image hits while sync adapter snapshots leave recency alone', async () => {
    const fetchMock = vi.fn(async () => buildResponse({ blob: async () => new Blob(['xx']) }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = getDatasetSourceAdapter('url')!;
    const state: DatasetState = { sourceType: 'url', imageUrlBase: imageBase, maskUrlBase: maskBase, imageNameToUrl: null, loadedFiles: null };
    for (const name of ['c.png', 'd.png', 'e.png']) {
      await adapter.getImage(state, name);
      await adapter.getMask(state, name);
    }
    const calls = fetchMock.mock.calls.length;
    const consumed = await adapter.getImage(state, 'c.png');
    expect(fetchMock).toHaveBeenCalledTimes(calls);
    for (const name of ['c.png', 'd.png', 'e.png']) {
      adapter.getImageSync(state, name);
      adapter.getMaskSync(state, name);
    }
    await adapter.getMask(state, 'f.png');
    expect(adapter.getImageSync(state, 'c.png')).toBe(consumed);
    expect(adapter.getMaskSync(state, 'c.png')).toBeUndefined();
  });

  it('retains revisited pairs despite full gallery sync scans and refreshes actual mask consumer hits', async () => {
    const fetchMock = vi.fn(async () => buildResponse({ blob: async () => new Blob(['xx']) }));
    vi.stubGlobal('fetch', fetchMock);
    for (const name of ['c.png', 'd.png', 'e.png']) {
      await fetchUrlImage(imageBase, name);
      await fetchUrlMask(maskBase, name);
    }
    const scan = () => {
      for (const name of ['a.png', 'b.png', 'c.png', 'd.png', 'e.png']) {
        getUrlImageCached(name, imageBase);
        getUrlMaskCached(name, maskBase);
      }
    };
    const imageA = await fetchUrlImage(imageBase, 'a.png');
    scan();
    const maskA = await fetchUrlMask(maskBase, 'a.png');
    scan();
    await fetchUrlImage(imageBase, 'b.png');
    scan();
    await fetchUrlMask(maskBase, 'b.png');
    scan();
    expect(getUrlImageCached('a.png', imageBase)).toBe(imageA);
    expect(getUrlMaskCached('a.png', maskBase)).toBe(maskA);
    expect(getUrlImageCached('c.png', imageBase)).toBeUndefined();
    expect(getUrlMaskCached('c.png', maskBase)).toBeUndefined();

    const calls = fetchMock.mock.calls.length;
    await fetchUrlMask(maskBase, 'e.png');
    expect(fetchMock).toHaveBeenCalledTimes(calls);
    await fetchUrlImage(imageBase, 'f.png');
    await fetchUrlMask(maskBase, 'f.png');
    expect(getUrlMaskCached('e.png', maskBase)).toBeDefined();
    expect(getUrlImageCached('e.png', imageBase)).toBeUndefined();
  });
});
