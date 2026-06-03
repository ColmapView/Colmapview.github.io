import { useEffect } from 'react';
import type { Reconstruction } from '../../types/colmap';
import type { ImageData, ViewMode } from './useImageGalleryViewModel';
import {
  collectVisibleImageNames,
  fetchImageNamesInBatches,
} from './imageGalleryFetchPolicy';

type ImageGalleryFetchDataset = {
  hasImages: () => boolean;
  getImageSync: (imageName: string) => File | undefined;
  getImage: (imageName: string) => Promise<File | null>;
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
}: UseImageGalleryVisibleImageFetchOptions): void {
  useEffect(() => {
    if (!dataset.hasImages() || !reconstruction || debouncedIsScrolling || isSettling) return;

    const visibleItems = viewMode === 'gallery'
      ? rowVirtualizer.getVirtualItems()
      : listVirtualizer.getVirtualItems();
    const imageNames = collectVisibleImageNames({
      viewMode,
      rows,
      images,
      visibleIndexes: visibleItems.map((item) => item.index),
      hasCachedImage: (imageName) => dataset.getImageSync(imageName) !== undefined,
    });

    if (imageNames.length === 0) return;

    let cancelled = false;
    fetchImageNamesInBatches({
      imageNames,
      getImage: (imageName) => dataset.getImage(imageName),
      onBatchLoaded: refreshImageCacheVersion,
      shouldCancel: () => cancelled,
    });

    return () => {
      cancelled = true;
    };
  }, [dataset, reconstruction, viewMode, rows, images, debouncedIsScrolling, isSettling, rowVirtualizer, listVirtualizer, refreshImageCacheVersion]);
}
