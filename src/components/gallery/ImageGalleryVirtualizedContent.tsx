import type { Key, RefObject } from 'react';
import { GalleryItem, ListItem } from './ImageGalleryItems';
import {
  getGalleryVirtualizerSizerStyle,
  getGalleryVirtualRowStyle,
  getListVirtualRowStyle,
} from './imageGalleryStyleViewModel';
import type { ImageData, ViewMode } from './useImageGalleryViewModel';

type GalleryVirtualItem = {
  index: number;
  key: Key;
  start: number;
};

type GalleryContentVirtualizer = {
  getTotalSize: () => number;
  getVirtualItems: () => GalleryVirtualItem[];
  measureElement?: (element: Element | null) => void;
};

interface ImageGalleryVirtualizedContentProps {
  containerRef: RefObject<HTMLDivElement | null>;
  viewMode: ViewMode;
  rows: ImageData[][];
  listRows: ImageData[][];
  galleryColumns: number;
  rowVirtualizer: GalleryContentVirtualizer;
  listVirtualizer: GalleryContentVirtualizer;
  selectedImageId: number | null;
  matchedImageIds: Set<number>;
  pendingDeletions: Set<number>;
  matchesColor: string;
  matchesBlink: boolean;
  debouncedIsScrolling: boolean;
  isSettling: boolean;
  isResizing: boolean;
  lastNavigationToImageId: number | null;
  touchMode: boolean;
  hideImageOverlay: boolean;
  onClick: (imageId: number) => void;
  onDoubleClick: (imageId: number) => void;
  onRightClick: (imageId: number) => void;
}

export function ImageGalleryVirtualizedContent({
  containerRef,
  viewMode,
  rows,
  listRows,
  galleryColumns,
  rowVirtualizer,
  listVirtualizer,
  selectedImageId,
  matchedImageIds,
  pendingDeletions,
  matchesColor,
  matchesBlink,
  debouncedIsScrolling,
  isSettling,
  isResizing,
  lastNavigationToImageId,
  touchMode,
  hideImageOverlay,
  onClick,
  onDoubleClick,
  onRightClick,
}: ImageGalleryVirtualizedContentProps) {
  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto min-h-0 relative p-2"
    >
      {viewMode === 'gallery' ? (
        <div
          style={getGalleryVirtualizerSizerStyle(rowVirtualizer.getTotalSize())}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const rowImages = rows[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                ref={rowVirtualizer.measureElement}
                data-index={virtualRow.index}
                style={getGalleryVirtualRowStyle({
                  galleryColumns,
                  start: virtualRow.start,
                })}
              >
                {rowImages.map((img) => (
                  <GalleryItem
                    key={img.imageId}
                    img={img}
                    isSelected={selectedImageId === img.imageId}
                    isMatched={matchedImageIds.has(img.imageId)}
                    isMarkedForDeletion={pendingDeletions.has(img.imageId)}
                    matchesColor={matchesColor}
                    matchesBlink={matchesBlink}
                    onClick={onClick}
                    onDoubleClick={onDoubleClick}
                    onRightClick={onRightClick}
                    isScrolling={debouncedIsScrolling}
                    skipImages={false}
                    isSettling={isSettling}
                    isResizing={isResizing}
                    wouldGoBack={img.imageId === lastNavigationToImageId}
                    touchMode={touchMode}
                    hideOverlay={hideImageOverlay}
                  />
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div
          style={getGalleryVirtualizerSizerStyle(listVirtualizer.getTotalSize())}
        >
          {listVirtualizer.getVirtualItems().map((virtualRow) => {
            const img = listRows[virtualRow.index][0];
            return (
              <div
                key={virtualRow.key}
                style={getListVirtualRowStyle(virtualRow.start)}
              >
                <ListItem
                  img={img}
                  isSelected={selectedImageId === img.imageId}
                  isMatched={matchedImageIds.has(img.imageId)}
                  isMarkedForDeletion={pendingDeletions.has(img.imageId)}
                  matchesColor={matchesColor}
                  matchesBlink={matchesBlink}
                  onClick={onClick}
                  onDoubleClick={onDoubleClick}
                  onRightClick={onRightClick}
                  isScrolling={debouncedIsScrolling}
                  skipImages={false}
                  isSettling={isSettling}
                  isResizing={isResizing}
                  wouldGoBack={img.imageId === lastNavigationToImageId}
                  touchMode={touchMode}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
