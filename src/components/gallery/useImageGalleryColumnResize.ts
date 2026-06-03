import { startTransition, useEffect, useRef, type RefObject } from 'react';
import { COLUMNS, TIMING } from '../../theme';
import {
  getNextGalleryColumnCount,
  shouldHandleGalleryColumnWheel,
  type ImageGalleryColumnResizeViewMode,
} from './imageGalleryColumnResizePolicy';

interface UseImageGalleryColumnResizeOptions {
  containerRef: RefObject<HTMLDivElement | null>;
  galleryColumns: number;
  setGalleryColumns: (columns: number) => void;
  viewMode: ImageGalleryColumnResizeViewMode;
}

export function useImageGalleryColumnResize({
  containerRef,
  galleryColumns,
  setGalleryColumns,
  viewMode,
}: UseImageGalleryColumnResizeOptions): void {
  const pendingColumnChange = useRef<number | null>(null);
  const wheelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || viewMode !== 'gallery') return;

    const handleWheel = (event: WheelEvent) => {
      if (!shouldHandleGalleryColumnWheel(viewMode, event.shiftKey)) return;

      event.preventDefault();
      pendingColumnChange.current = getNextGalleryColumnCount({
        currentColumns: galleryColumns,
        deltaY: event.deltaY,
        minColumns: COLUMNS.min,
        maxColumns: COLUMNS.max,
        pendingColumns: pendingColumnChange.current,
      });

      if (wheelTimeoutRef.current !== null) {
        clearTimeout(wheelTimeoutRef.current);
      }

      wheelTimeoutRef.current = setTimeout(() => {
        const finalColumns = pendingColumnChange.current;
        pendingColumnChange.current = null;
        wheelTimeoutRef.current = null;

        if (finalColumns !== null && finalColumns !== galleryColumns) {
          startTransition(() => {
            setGalleryColumns(finalColumns);
          });
        }
      }, TIMING.wheelDebounce);
    };

    container.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => {
      container.removeEventListener('wheel', handleWheel, { capture: true });
      if (wheelTimeoutRef.current !== null) {
        clearTimeout(wheelTimeoutRef.current);
      }
    };
  }, [containerRef, galleryColumns, setGalleryColumns, viewMode]);
}
