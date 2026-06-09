import { useEffect } from 'react';
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
  getImage: (imageName: string) => Promise<File | null>;
  getMask: (imageName: string) => Promise<File | null>;
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
  useEffect(() => {
    if (!reconstruction || debouncedIsScrolling || isSettling) return;

    const shouldFetchImages = thumbnailDisplayMode !== 'mask' && dataset.hasImages();
    const shouldFetchMasks = thumbnailDisplayMode !== 'image' && dataset.hasMasks();
    if (!shouldFetchImages && !shouldFetchMasks) return;

    const visibleItems = viewMode === 'gallery'
      ? rowVirtualizer.getVirtualItems()
      : listVirtualizer.getVirtualItems();
    const visibleIndexes = visibleItems.map((item) => item.index);
    const imageNames = shouldFetchImages
      ? collectVisibleImageNames({
        viewMode,
        rows,
        images,
        visibleIndexes,
        hasCachedImage: (imageName) => dataset.getImageSync(imageName) !== undefined,
      })
      : [];
    const maskNames = shouldFetchMasks
      ? collectVisibleImageNames({
        viewMode,
        rows,
        images,
        visibleIndexes,
        hasCachedImage: (imageName) => dataset.getMaskSync(imageName) !== undefined,
      })
      : [];

    if (imageNames.length === 0 && maskNames.length === 0) return;

    let cancelled = false;
    if (imageNames.length > 0) {
      fetchImageNamesInBatches({
        imageNames,
        getImage: (imageName) => dataset.getImage(imageName),
        onBatchLoaded: refreshImageCacheVersion,
        shouldCancel: () => cancelled,
      });
    }
    if (maskNames.length > 0) {
      fetchImageNamesInBatches({
        imageNames: maskNames,
        getImage: (imageName) => dataset.getMask(imageName),
        onBatchLoaded: refreshImageCacheVersion,
        shouldCancel: () => cancelled,
      });
    }

    return () => {
      cancelled = true;
    };
  }, [
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
  ]);
}
