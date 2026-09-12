import type { DatasetAccessOptions, DatasetSource, DatasetState } from './types';
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
  getZipImageGeneration,
  fetchZipImageRaw,
  getZipImageCached,
  getZipMaskCached,
  fetchZipImage,
  fetchZipMask,
  isZipLoadingAvailable,
} from '../utils/zipImageFiles';

export interface DatasetSourceAdapter {
  getImage: (state: DatasetState, imageName: string, options?: DatasetAccessOptions) => Promise<File | null>;
  getMetricImage: (state: DatasetState, imageName: string, options?: DatasetAccessOptions) => Promise<File | null>;
  getImageSync: (state: DatasetState, imageName: string) => File | undefined;
  getMask: (state: DatasetState, imageName: string, options?: DatasetAccessOptions) => Promise<File | null>;
  getMaskSync: (state: DatasetState, imageName: string) => File | undefined;
  prefetchImages: (state: DatasetState, imageNames: string[], concurrency: number, options?: DatasetAccessOptions) => Promise<void>;
  hasImages: (state: DatasetState) => boolean;
  hasMasks: (state: DatasetState) => boolean;
}

const localSourceAdapter: DatasetSourceAdapter = {
  async getImage(state, imageName, options) {
    return options?.signal?.aborted ? null : getImageFile(state.loadedFiles?.imageFiles, imageName) ?? null;
  },
  async getMetricImage(state, imageName, options) {
    return options?.signal?.aborted ? null : getImageFile(state.loadedFiles?.imageFiles, imageName) ?? null;
  },
  getImageSync(state, imageName) {
    return getImageFile(state.loadedFiles?.imageFiles, imageName);
  },
  async getMask(state, imageName, options) {
    return options?.signal?.aborted ? null : getMaskFile(state.loadedFiles?.imageFiles, imageName) ?? null;
  },
  getMaskSync(state, imageName) {
    return getMaskFile(state.loadedFiles?.imageFiles, imageName);
  },
  async prefetchImages() {
    // Local files don't need prefetching.
  },
  hasImages(state) {
    return (state.loadedFiles?.imageFiles?.size ?? 0) > 0;
  },
  hasMasks(state) {
    return state.loadedFiles?.hasMasks ?? false;
  },
};

const remoteSourceAdapter: DatasetSourceAdapter = {
  async getImage(state, imageName, options) {
    const explicitUrl = state.imageNameToUrl?.[imageName];
    if (!state.imageUrlBase && !explicitUrl) return null;
    if (options?.signal?.aborted) return null;
    return await fetchUrlImage(state.imageUrlBase, imageName, explicitUrl, options);
  },
  async getMetricImage(state, imageName, options) {
    const explicitUrl = state.imageNameToUrl?.[imageName];
    if (!state.imageUrlBase && !explicitUrl) return null;
    return await fetchUrlImageRaw(state.imageUrlBase, imageName, explicitUrl, { ...options, priority: options?.priority ?? 'metric' });
  },
  getImageSync(state, imageName) {
    return getUrlImageCached(imageName, state.imageUrlBase, state.imageNameToUrl?.[imageName]);
  },
  async getMask(state, imageName, options) {
    if (!state.maskUrlBase) return null;
    return await fetchUrlMask(state.maskUrlBase, imageName, options);
  },
  getMaskSync(state, imageName) {
    return getUrlMaskCached(imageName, state.maskUrlBase);
  },
  async prefetchImages(state, imageNames, concurrency, options) {
    if (!state.imageUrlBase && !state.imageNameToUrl) return;
    await prefetchUrlImages(state.imageUrlBase, imageNames, concurrency, state.imageNameToUrl ?? undefined, options);
  },
  hasImages(state) {
    return state.imageUrlBase !== null || Object.keys(state.imageNameToUrl ?? {}).length > 0;
  },
  hasMasks(state) {
    return state.maskUrlBase !== null;
  },
};

const zipSourceAdapter: DatasetSourceAdapter = {
  async getImage(_state, imageName, options) {
    if (!isZipLoadingAvailable()) return null;
    if (options?.signal?.aborted) return null;
    return getZipImageCached(imageName) ?? await fetchZipImage(imageName, options);
  },
  async getMetricImage(_state, imageName, options) {
    if (!isZipLoadingAvailable()) return null;
    return await fetchZipImageRaw(imageName, options);
  },
  getImageSync(_state, imageName) {
    return getZipImageCached(imageName);
  },
  async getMask(_state, imageName, options) {
    if (!isZipLoadingAvailable()) return null;
    return await fetchZipMask(imageName, options);
  },
  getMaskSync(_state, imageName) {
    return getZipMaskCached(imageName);
  },
  async prefetchImages(_state, imageNames, concurrency, options) {
    if (!isZipLoadingAvailable()) return;

    const generation = getZipImageGeneration();
    const batchSize = Math.max(1, Math.floor(concurrency) || 1);
    const toFetch = imageNames.filter(name => !getZipImageCached(name));
    for (let i = 0; i < toFetch.length; i += batchSize) {
      if (options?.signal?.aborted || generation !== getZipImageGeneration()) return;
      const batch = toFetch.slice(i, i + batchSize);
      await Promise.all(batch.map(name => fetchZipImage(name, options)));
    }
  },
  hasImages() {
    return isZipLoadingAvailable();
  },
  hasMasks() {
    // ZIP masks are discovered lazily, so we assume they might exist.
    return isZipLoadingAvailable();
  },
};

const SOURCE_ADAPTERS: Record<DatasetSource, DatasetSourceAdapter> = {
  local: localSourceAdapter,
  url: remoteSourceAdapter,
  manifest: remoteSourceAdapter,
  zip: zipSourceAdapter,
};

export function getDatasetSourceAdapter(sourceType: DatasetSource | null): DatasetSourceAdapter | null {
  return sourceType ? SOURCE_ADAPTERS[sourceType] : null;
}
