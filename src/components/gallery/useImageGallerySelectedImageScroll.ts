import { useEffect } from 'react';
import type { ScrollToOptions } from '@tanstack/react-virtual';

type ImageGallerySelectedImageScrollViewMode = 'gallery' | 'list';

type ImageGallerySelectedImageScrollItem = {
  imageId: number;
};

type ImageGalleryScrollVirtualizer = {
  scrollToIndex: (index: number, options: ScrollToOptions) => void;
};

interface SelectedImageScrollTargetOptions {
  selectedImageId: number | null;
  images: ImageGallerySelectedImageScrollItem[];
  viewMode: ImageGallerySelectedImageScrollViewMode;
  galleryColumns: number;
}

interface SelectedImageScrollTarget {
  viewMode: ImageGallerySelectedImageScrollViewMode;
  index: number;
}

interface UseImageGallerySelectedImageScrollOptions extends SelectedImageScrollTargetOptions {
  rowVirtualizer: ImageGalleryScrollVirtualizer;
  listVirtualizer: ImageGalleryScrollVirtualizer;
}

const SELECTED_IMAGE_SCROLL_OPTIONS: ScrollToOptions = {
  align: 'center',
  behavior: 'auto',
};

export function getSelectedImageScrollTarget({
  selectedImageId,
  images,
  viewMode,
  galleryColumns,
}: SelectedImageScrollTargetOptions): SelectedImageScrollTarget | null {
  if (selectedImageId === null) return null;

  const imageIndex = images.findIndex((img) => img.imageId === selectedImageId);
  if (imageIndex === -1) return null;

  return {
    viewMode,
    index: viewMode === 'gallery' ? Math.floor(imageIndex / galleryColumns) : imageIndex,
  };
}

export function useImageGallerySelectedImageScroll({
  selectedImageId,
  images,
  viewMode,
  galleryColumns,
  rowVirtualizer,
  listVirtualizer,
}: UseImageGallerySelectedImageScrollOptions): void {
  const targetIndex = getSelectedImageScrollTarget({
    selectedImageId,
    images,
    viewMode,
    galleryColumns,
  })?.index ?? null;

  useEffect(() => {
    if (selectedImageId === null || targetIndex === null) return;

    const virtualizer = viewMode === 'gallery' ? rowVirtualizer : listVirtualizer;
    virtualizer.scrollToIndex(targetIndex, SELECTED_IMAGE_SCROLL_OPTIONS);
  }, [selectedImageId, targetIndex, viewMode, galleryColumns, rowVirtualizer, listVirtualizer]);
}
