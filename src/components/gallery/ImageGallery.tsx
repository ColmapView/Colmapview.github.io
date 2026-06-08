import { useCallback, useMemo, useRef, useState } from 'react';
import { emptyStateStyles } from '../../theme';
import { ImageGalleryToolbar } from './ImageGalleryToolbar';
import { ImageGalleryVirtualizedContent } from './ImageGalleryVirtualizedContent';
import { useImageGalleryColumnResize } from './useImageGalleryColumnResize';
import { useImageGalleryKeyboardNavigation } from './useImageGalleryKeyboardNavigation';
import { useImageGalleryScrollSettle } from './useImageGalleryScrollSettle';
import { useImageGallerySelectedImageScroll } from './useImageGallerySelectedImageScroll';
import { useImageGalleryVisibleImageFetch } from './useImageGalleryVisibleImageFetch';
import { useImageGalleryVirtualizers } from './useImageGalleryVirtualizers';
import {
  buildImageRows,
  buildListRows,
  useImageGalleryViewModel,
} from './useImageGalleryViewModel';

interface ImageGalleryProps {
  isResizing?: boolean;
}

export function ImageGallery({ isResizing = false }: ImageGalleryProps) {
  const {
    borderColorMode,
    cameraFilter,
    cameras,
    dataset,
    galleryColumns,
    handleClick,
    handleDoubleClick,
    handleRightClick,
    hideImageOverlay,
    hideToolbar,
    images,
    isSettling,
    lastNavigationToImageId,
    matchedImageIds,
    matchesColor,
    matchesDisplayMode,
    metricBorderColorScale,
    pendingDeletions,
    reconstruction,
    refreshImageCacheVersion,
    selectedImageId,
    setBorderColorMode,
    setCameraFilter,
    setGalleryColumns,
    setSortDirection,
    setSortField,
    setViewMode,
    showMatches,
    showSplatMetrics,
    sortDirection,
    sortField,
    touchMode,
    viewMode,
  } = useImageGalleryViewModel();
  const containerRef = useRef<HTMLDivElement>(null);
  const [galleryHeaderHovered, setGalleryHeaderHovered] = useState(false);
  const showToolbar = !hideToolbar && (touchMode || galleryHeaderHovered);

  const handleGalleryHeaderMouseEnter = useCallback(() => {
    setGalleryHeaderHovered(true);
  }, []);

  const handleGalleryHeaderMouseLeave = useCallback(() => {
    setGalleryHeaderHovered(false);
  }, []);

  useImageGalleryColumnResize({
    containerRef,
    galleryColumns,
    setGalleryColumns,
    viewMode,
  });

  // Grid layout: organize images into rows
  const rows = useMemo(() => buildImageRows(images, galleryColumns), [images, galleryColumns]);
  const listRows = useMemo(() => buildListRows(images), [images]); // 1 item per row for list view

  const { rowVirtualizer, listVirtualizer } = useImageGalleryVirtualizers({
    containerRef,
    rowCount: rows.length,
    listCount: listRows.length,
  });

  const currentIsScrolling = viewMode === 'gallery' ? rowVirtualizer.isScrolling : listVirtualizer.isScrolling;
  const debouncedIsScrolling = useImageGalleryScrollSettle(currentIsScrolling);

  useImageGalleryVisibleImageFetch({
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
  });

  useImageGallerySelectedImageScroll({
    selectedImageId,
    images,
    viewMode,
    galleryColumns,
    rowVirtualizer,
    listVirtualizer,
  });

  useImageGalleryKeyboardNavigation({
    images,
    selectedImageId,
    viewMode,
    galleryColumns,
    onSelectImage: handleClick,
    onNavigateToImage: handleRightClick,
  });

  if (!reconstruction) {
    return (
      <div className={emptyStateStyles.container}>
        Load COLMAP data to view images
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className={emptyStateStyles.container}>
        No images found
      </div>
    );
  }

  return (
    <div
      className="relative h-full flex flex-col bg-ds-secondary"
      data-idle-ignore="true"
      data-testid="image-gallery"
    >
      <div
        className={
          touchMode
            ? 'h-10 overflow-hidden bg-ds-secondary'
            : 'absolute left-0 right-0 top-0 z-30 h-10 overflow-hidden bg-transparent'
        }
        data-testid="image-gallery-toolbar-slot"
        aria-hidden={!showToolbar}
        onMouseEnter={handleGalleryHeaderMouseEnter}
        onMouseLeave={handleGalleryHeaderMouseLeave}
      >
        {showToolbar && (
          <ImageGalleryToolbar
            borderColorMode={borderColorMode}
            cameraFilter={cameraFilter}
            cameras={cameras}
            sortDirection={sortDirection}
            sortField={sortField}
            showSplatMetricSort={showSplatMetrics}
            touchMode={touchMode}
            viewMode={viewMode}
            onBorderColorModeChange={setBorderColorMode}
            onCameraFilterChange={setCameraFilter}
            onSortDirectionToggle={() => setSortDirection(d => d === 'asc' ? 'desc' : 'asc')}
            onSortFieldChange={setSortField}
            onViewModeChange={setViewMode}
          />
        )}
      </div>

      <ImageGalleryVirtualizedContent
        containerRef={containerRef}
        viewMode={viewMode}
        rows={rows}
        listRows={listRows}
        galleryColumns={galleryColumns}
        rowVirtualizer={rowVirtualizer}
        listVirtualizer={listVirtualizer}
        selectedImageId={selectedImageId}
        borderColorMode={borderColorMode}
        matchedImageIds={matchedImageIds}
        pendingDeletions={pendingDeletions}
        matchesColor={matchesColor}
        matchesBlink={showMatches && matchesDisplayMode === 'blink'}
        metricBorderColorScale={metricBorderColorScale}
        debouncedIsScrolling={debouncedIsScrolling}
        isSettling={isSettling}
        isResizing={isResizing}
        lastNavigationToImageId={lastNavigationToImageId}
        touchMode={touchMode}
        hideImageOverlay={hideImageOverlay}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onRightClick={handleRightClick}
      />
    </div>
  );
}
