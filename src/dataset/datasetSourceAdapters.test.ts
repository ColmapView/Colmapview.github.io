import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatasetState } from './types';

vi.mock('../utils/imageFileUtils', () => ({
  getImageFile: vi.fn(),
  getMaskFile: vi.fn(),
}));

vi.mock('../utils/urlImageFiles', () => ({
  fetchUrlImageRaw: vi.fn(),
  getUrlImageCached: vi.fn(),
  getUrlMaskCached: vi.fn(),
  fetchUrlImage: vi.fn(),
  fetchUrlMask: vi.fn(),
  prefetchUrlImages: vi.fn(),
}));

vi.mock('../utils/zipImageFiles', () => ({
  fetchZipImageRaw: vi.fn(),
  getZipImageCached: vi.fn(),
  getZipMaskCached: vi.fn(),
  fetchZipImage: vi.fn(),
  fetchZipMask: vi.fn(),
  isZipLoadingAvailable: vi.fn(),
}));

import {
  getImageFile,
  getMaskFile,
} from '../utils/imageFileUtils';
import {
  fetchUrlImageRaw,
  getUrlImageCached,
  getUrlMaskCached,
  fetchUrlImage,
  fetchUrlMask,
  prefetchUrlImages,
} from '../utils/urlImageFiles';
import {
  fetchZipImageRaw,
  getZipImageCached,
  getZipMaskCached,
  fetchZipImage,
  fetchZipMask,
  isZipLoadingAvailable,
} from '../utils/zipImageFiles';
import { getDatasetSourceAdapter } from './datasetSourceAdapters';

const baseState: DatasetState = {
  sourceType: null,
  imageUrlBase: null,
  maskUrlBase: null,
  loadedFiles: null,
};

describe('dataset source adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no source is loaded', () => {
    expect(getDatasetSourceAdapter(null)).toBeNull();
  });

  it('adapts local source image and mask access from loaded files', async () => {
    const imageFile = new File(['image'], 'image.jpg');
    const maskFile = new File(['mask'], 'mask.png');
    const imageFiles = new Map([['image.jpg', imageFile]]);
    const state: DatasetState = {
      ...baseState,
      sourceType: 'local',
      loadedFiles: { imageFiles, hasMasks: true },
    };
    const adapter = getDatasetSourceAdapter('local')!;

    vi.mocked(getImageFile).mockReturnValue(imageFile);
    vi.mocked(getMaskFile).mockReturnValue(maskFile);

    await expect(adapter.getImage(state, 'image.jpg')).resolves.toBe(imageFile);
    expect(adapter.getImageSync(state, 'image.jpg')).toBe(imageFile);
    await expect(adapter.getMask(state, 'image.jpg')).resolves.toBe(maskFile);
    expect(adapter.getMaskSync(state, 'image.jpg')).toBe(maskFile);
    expect(adapter.hasImages(state)).toBe(true);
    expect(adapter.hasMasks(state)).toBe(true);
  });

  it('shares remote source behavior for URL and manifest datasets', async () => {
    const fetchedImage = new File(['image'], 'image.jpg');
    const rawImage = new File(['raw'], 'image.jpg');
    const maskFile = new File(['mask'], 'mask.png');
    const state: DatasetState = {
      ...baseState,
      sourceType: 'manifest',
      imageUrlBase: 'https://example.test/images/',
      maskUrlBase: 'https://example.test/masks/',
    };
    const urlAdapter = getDatasetSourceAdapter('url')!;
    const manifestAdapter = getDatasetSourceAdapter('manifest')!;

    expect(manifestAdapter).toBe(urlAdapter);

    vi.mocked(getUrlImageCached).mockReturnValue(undefined);
    vi.mocked(getUrlMaskCached).mockReturnValue(maskFile);
    vi.mocked(fetchUrlImage).mockResolvedValue(fetchedImage);
    vi.mocked(fetchUrlImageRaw).mockResolvedValue(rawImage);
    vi.mocked(fetchUrlMask).mockResolvedValue(maskFile);

    await expect(manifestAdapter.getImage(state, 'image.jpg')).resolves.toBe(fetchedImage);
    expect(fetchUrlImage).toHaveBeenCalledWith('https://example.test/images/', 'image.jpg');
    await expect(manifestAdapter.getMetricImage(state, 'image.jpg')).resolves.toBe(rawImage);
    expect(fetchUrlImageRaw).toHaveBeenCalledWith('https://example.test/images/', 'image.jpg');
    await expect(manifestAdapter.getMask(state, 'image.jpg')).resolves.toBe(maskFile);
    expect(fetchUrlMask).toHaveBeenCalledWith('https://example.test/masks/', 'image.jpg');
    expect(manifestAdapter.getMaskSync(state, 'image.jpg')).toBe(maskFile);

    await manifestAdapter.prefetchImages(state, ['a.jpg', 'b.jpg'], 2);
    expect(prefetchUrlImages).toHaveBeenCalledWith('https://example.test/images/', ['a.jpg', 'b.jpg'], 2);
    expect(manifestAdapter.hasImages(state)).toBe(true);
    expect(manifestAdapter.hasMasks(state)).toBe(true);
  });

  it('adapts ZIP source availability, cached reads, extraction, and prefetch batching', async () => {
    const cached = new File(['cached'], 'cached.jpg');
    const fetched = new File(['fetched'], 'fetched.jpg');
    const raw = new File(['raw'], 'raw.jpg');
    const state: DatasetState = { ...baseState, sourceType: 'zip' };
    const adapter = getDatasetSourceAdapter('zip')!;

    vi.mocked(isZipLoadingAvailable).mockReturnValue(true);
    vi.mocked(getZipImageCached).mockImplementation((name: string) => name === 'cached.jpg' ? cached : undefined);
    vi.mocked(getZipMaskCached).mockImplementation((name: string) => name === 'image.jpg' ? new File(['cached-mask'], 'mask.png') : undefined);
    vi.mocked(fetchZipImage).mockResolvedValue(fetched);
    vi.mocked(fetchZipImageRaw).mockResolvedValue(raw);
    vi.mocked(fetchZipMask).mockResolvedValue(new File(['mask'], 'mask.png'));

    await expect(adapter.getImage(state, 'cached.jpg')).resolves.toBe(cached);
    await expect(adapter.getImage(state, 'missing.jpg')).resolves.toBe(fetched);
    expect(fetchZipImage).toHaveBeenCalledWith('missing.jpg');
    await expect(adapter.getMetricImage(state, 'missing.jpg')).resolves.toBe(raw);
    expect(fetchZipImageRaw).toHaveBeenCalledWith('missing.jpg');
    expect(adapter.getImageSync(state, 'cached.jpg')).toBe(cached);
    await expect(adapter.getMask(state, 'image.jpg')).resolves.toBeInstanceOf(File);
    expect(adapter.getMaskSync(state, 'image.jpg')).toBeInstanceOf(File);
    expect(adapter.hasImages(state)).toBe(true);
    expect(adapter.hasMasks(state)).toBe(true);

    await adapter.prefetchImages(state, ['cached.jpg', 'first.jpg', 'second.jpg'], 2);
    expect(fetchZipImage).toHaveBeenCalledWith('first.jpg');
    expect(fetchZipImage).toHaveBeenCalledWith('second.jpg');
    expect(fetchZipImage).not.toHaveBeenCalledWith('cached.jpg');
  });
});
