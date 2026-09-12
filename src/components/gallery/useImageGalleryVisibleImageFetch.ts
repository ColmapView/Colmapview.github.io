import { useEffect } from 'react';
import type { DatasetAccessOptions } from '../../dataset/types';
import type { Reconstruction } from '../../types/colmap';
import type { GalleryThumbnailDisplayMode, ImageData, ViewMode } from './useImageGalleryViewModel';
import {
  collectVisibleImageNames,
  fetchImageNamesInBatches,
} from './imageGalleryFetchPolicy';

type ImageGalleryFetchDataset = {
  hasImages: () => boolean;
  hasMasks: () => boolean;
  getImageSync: (imageName: string) => File | undefined;
  getMaskSync: (imageName: string) => File | undefined;
  getImage: (imageName: string, options?: DatasetAccessOptions) => Promise<File | null>;
  getMask: (imageName: string, options?: DatasetAccessOptions) => Promise<File | null>;
};

type ImageGalleryFetchVirtualizer = {
  getVirtualItems: () => Array<{ index: number }>;
};

interface UseImageGalleryVisibleImageFetchOptions {
  dataset: ImageGalleryFetchDataset;
  reconstruction: Reconstruction | null;
  viewMode: ViewMode;
  rows: Pick<ImageData, 'name'>[][];
  images: Pick<ImageData, 'name'>[];
  debouncedIsScrolling: boolean;
  isSettling: boolean;
  rowVirtualizer: ImageGalleryFetchVirtualizer;
  listVirtualizer: ImageGalleryFetchVirtualizer;
  refreshImageCacheVersion: () => void;
  thumbnailDisplayMode: GalleryThumbnailDisplayMode;
}

export function useImageGalleryVisibleImageFetch({
  dataset,
  reconstruction,
  viewMode,
  rows,
  images,
  debouncedIsScrolling,
  isSettling,
  rowVirtualizer,
  listVirtualizer,
  refreshImageCacheVersion,
  thumbnailDisplayMode,
}: UseImageGalleryVisibleImageFetchOptions): void {
  const shouldFetchImages = thumbnailDisplayMode !== 'mask' && dataset.hasImages();
  const shouldFetchMasks = thumbnailDisplayMode !== 'image' && dataset.hasMasks();
  const enabled = reconstruction !== null && !debouncedIsScrolling && !isSettling
    && (shouldFetchImages || shouldFetchMasks);
  const visibleItems = enabled
    ? (viewMode === 'gallery' ? rowVirtualizer.getVirtualItems() : listVirtualizer.getVirtualItems())
    : [];
  // Cache refreshes rebuild row/image objects. Request lifetime follows visible resource
  // membership instead, including cached names so completed batches cannot restart peers.
  const visibleNamesKey = JSON.stringify(collectVisibleImageNames({
    viewMode,
    rows,
    images,
    visibleIndexes: visibleItems.map(item => item.index),
    hasCachedImage: () => false,
  }).sort());

  useEffect(() => {
    if (!enabled) return;
    const visibleNames = JSON.parse(visibleNamesKey) as string[];
    const controller = new AbortController();
    const access = { signal: controller.signal, priority: 'visible' } as const;
    let cancelled = false;
    const imageNames: string[] = [];
    const maskNames: string[] = [];
    const cachedConsumers: Promise<File | null>[] = [];
    // Snapshot reads do not affect recency. Acquire every retained visible File
    // before missing batches can evict an older, still-visible image/mask pair.
    for (const name of visibleNames) {
      if (shouldFetchImages) {
        if (dataset.getImageSync(name) === undefined) imageNames.push(name);
        else cachedConsumers.push(dataset.getImage(name, access));
      }
      if (shouldFetchMasks) {
        if (dataset.getMaskSync(name) === undefined) maskNames.push(name);
        else cachedConsumers.push(dataset.getMask(name, access));
      }
    }
    const loadMissing = () => {
      if (imageNames.length > 0) {
        fetchImageNamesInBatches({
          imageNames,
          getImage: (imageName) => dataset.getImage(imageName, { signal: controller.signal, priority: 'visible' }),
          onBatchLoaded: refreshImageCacheVersion,
          shouldCancel: () => cancelled,
        });
      }
      if (maskNames.length > 0) {
        fetchImageNamesInBatches({
          imageNames: maskNames,
          getImage: (imageName) => dataset.getMask(imageName, { signal: controller.signal, priority: 'visible' }),
          onBatchLoaded: refreshImageCacheVersion,
          shouldCancel: () => cancelled,
        });
      }
    };
    if (cachedConsumers.length === 0) loadMissing();
    else void Promise.all(cachedConsumers).then(() => { if (!cancelled) loadMissing(); });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    dataset,
    reconstruction,
    enabled,
    visibleNamesKey,
    shouldFetchImages,
    shouldFetchMasks,
    refreshImageCacheVersion,
  ]);
}
