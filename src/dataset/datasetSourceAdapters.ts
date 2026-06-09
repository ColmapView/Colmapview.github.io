import type { DatasetSource, DatasetState } from './types';
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

export interface DatasetSourceAdapter {
  getImage: (state: DatasetState, imageName: string) => Promise<File | null>;
  getMetricImage: (state: DatasetState, imageName: string) => Promise<File | null>;
  getImageSync: (state: DatasetState, imageName: string) => File | undefined;
  getMask: (state: DatasetState, imageName: string) => Promise<File | null>;
  getMaskSync: (state: DatasetState, imageName: string) => File | undefined;
  prefetchImages: (state: DatasetState, imageNames: string[], concurrency: number) => Promise<void>;
  hasImages: (state: DatasetState) => boolean;
  hasMasks: (state: DatasetState) => boolean;
}

const localSourceAdapter: DatasetSourceAdapter = {
  async getImage(state, imageName) {
    return getImageFile(state.loadedFiles?.imageFiles, imageName) ?? null;
  },
  async getMetricImage(state, imageName) {
    return getImageFile(state.loadedFiles?.imageFiles, imageName) ?? null;
  },
  getImageSync(state, imageName) {
    return getImageFile(state.loadedFiles?.imageFiles, imageName);
  },
  async getMask(state, imageName) {
    return getMaskFile(state.loadedFiles?.imageFiles, imageName) ?? null;
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
  async getImage(state, imageName) {
    if (!state.imageUrlBase) return null;
    return getUrlImageCached(imageName) ?? await fetchUrlImage(state.imageUrlBase, imageName);
  },
  async getMetricImage(state, imageName) {
    if (!state.imageUrlBase) return null;
    return await fetchUrlImageRaw(state.imageUrlBase, imageName);
  },
  getImageSync(_state, imageName) {
    return getUrlImageCached(imageName);
  },
  async getMask(state, imageName) {
    if (!state.maskUrlBase) return null;
    return await fetchUrlMask(state.maskUrlBase, imageName);
  },
  getMaskSync(_state, imageName) {
    return getUrlMaskCached(imageName);
  },
  async prefetchImages(state, imageNames, concurrency) {
    if (!state.imageUrlBase) return;
    await prefetchUrlImages(state.imageUrlBase, imageNames, concurrency);
  },
  hasImages(state) {
    return state.imageUrlBase !== null;
  },
  hasMasks(state) {
    return state.maskUrlBase !== null;
  },
};

const zipSourceAdapter: DatasetSourceAdapter = {
  async getImage(_state, imageName) {
    if (!isZipLoadingAvailable()) return null;
    return getZipImageCached(imageName) ?? await fetchZipImage(imageName);
  },
  async getMetricImage(_state, imageName) {
    if (!isZipLoadingAvailable()) return null;
    return await fetchZipImageRaw(imageName);
  },
  getImageSync(_state, imageName) {
    return getZipImageCached(imageName);
  },
  async getMask(_state, imageName) {
    if (!isZipLoadingAvailable()) return null;
    return await fetchZipMask(imageName);
  },
  getMaskSync(_state, imageName) {
    return getZipMaskCached(imageName);
  },
  async prefetchImages(_state, imageNames, concurrency) {
    if (!isZipLoadingAvailable()) return;

    const toFetch = imageNames.filter(name => !getZipImageCached(name));
    for (let i = 0; i < toFetch.length; i += concurrency) {
      const batch = toFetch.slice(i, i + concurrency);
      await Promise.all(batch.map(name => fetchZipImage(name)));
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
