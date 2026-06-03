import type { RefObject } from 'react';
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual';
import { GAP, SIZE, TIMING } from '../../theme';

export type ImageGalleryVirtualizer = Virtualizer<HTMLDivElement, Element>;

interface UseImageGalleryVirtualizersOptions {
  containerRef: RefObject<HTMLDivElement | null>;
  rowCount: number;
  listCount: number;
}

interface ImageGalleryVirtualizers {
  rowVirtualizer: ImageGalleryVirtualizer;
  listVirtualizer: ImageGalleryVirtualizer;
}

export function useImageGalleryVirtualizers({
  containerRef,
  rowCount,
  listCount,
}: UseImageGalleryVirtualizersOptions): ImageGalleryVirtualizers {
  const rowVirtualizer = useVirtualizer<HTMLDivElement, Element>({
    count: rowCount,
    getScrollElement: () => containerRef.current,
    estimateSize: () => SIZE.defaultCellHeight + GAP.gallery,
    overscan: TIMING.galleryOverscan,
  });

  const listVirtualizer = useVirtualizer<HTMLDivElement, Element>({
    count: listCount,
    getScrollElement: () => containerRef.current,
    estimateSize: () => SIZE.listRowHeight + GAP.gallery,
    overscan: TIMING.listOverscan,
  });

  return {
    rowVirtualizer,
    listVirtualizer,
  };
}
