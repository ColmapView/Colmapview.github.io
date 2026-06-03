import {
  getPrefetchChunkSize,
  getPrefetchProgress,
  shouldReportPrefetchProgress,
} from './asyncImageCachePolicy';

export interface AsyncImagePrefetchItem {
  file: File;
  name: string;
}

export interface PrefetchAsyncImagesOptions<T> {
  images: AsyncImagePrefetchItem[];
  onProgress?: (progress: number) => void;
  cache: ReadonlyMap<string, T>;
  loadingPromises: Map<string, Promise<T | null>>;
  queueLoad: (file: File, cacheKey: string) => Promise<T | null>;
  setBulkMode: (bulkMode: boolean) => void;
  maxConcurrentLoads: number;
}

export async function prefetchAsyncImages<T>({
  images,
  onProgress,
  cache,
  loadingPromises,
  queueLoad,
  setBulkMode,
  maxConcurrentLoads,
}: PrefetchAsyncImagesOptions<T>): Promise<void> {
  if (images.length === 0) {
    onProgress?.(1);
    return;
  }

  setBulkMode(true);

  let completed = 0;
  const total = images.length;
  let lastReportedProgress = 0;

  const reportProgress = () => {
    const progress = getPrefetchProgress(completed, total);
    if (shouldReportPrefetchProgress(completed, total, lastReportedProgress)) {
      lastReportedProgress = progress;
      onProgress?.(progress);
    }
  };

  try {
    const chunkSize = getPrefetchChunkSize(maxConcurrentLoads);
    for (let i = 0; i < images.length; i += chunkSize) {
      const chunk = images.slice(i, i + chunkSize);

      const chunkPromises = chunk.map(async ({ file, name }) => {
        if (cache.has(name)) {
          completed++;
          reportProgress();
          return;
        }

        let promise = loadingPromises.get(name);
        if (!promise) {
          promise = queueLoad(file, name);
          loadingPromises.set(name, promise);
        }

        await promise;
        completed++;
        reportProgress();
      });

      await Promise.all(chunkPromises);
    }
  } finally {
    setBulkMode(false);
  }
}
