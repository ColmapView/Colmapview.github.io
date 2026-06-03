import { memo } from 'react';
import { useThumbnail } from '../../hooks/useThumbnail';
import {
  listStyles,
  galleryStyles,
} from '../../theme';
import { ImageGalleryDeletedOverlay } from './ImageGalleryDeletedOverlay';
import { ImageGalleryItemHoverCard } from './ImageGalleryItemHoverCard';
import {
  getDeletionImageStyle,
  getDeletionPlaceholderStyle,
  getGalleryItemFrameStyle,
  getGalleryItemVignetteStyle,
  getListItemFrameStyle,
} from './imageGalleryStyleViewModel';
import { useImageGalleryItemInteractions } from './useImageGalleryItemInteractions';
import { useImageGalleryItemStoreFacade } from './useImageGalleryItemStoreFacade';
import type { ImageData } from './useImageGalleryViewModel';

export interface GalleryItemProps {
  img: ImageData;
  isSelected: boolean;
  isMatched: boolean;
  isMarkedForDeletion: boolean;
  matchesColor: string;
  matchesBlink: boolean;
  onClick: (id: number) => void;
  onDoubleClick: (id: number) => void;
  onRightClick: (id: number) => void;
  isScrolling: boolean;
  skipImages: boolean;
  isSettling: boolean;
  isResizing: boolean;
  wouldGoBack: boolean;
  touchMode?: boolean;
}

export const GalleryItem = memo(function GalleryItem({
  img,
  isSelected,
  isMatched,
  isMarkedForDeletion,
  matchesColor,
  matchesBlink,
  onClick,
  onDoubleClick,
  onRightClick,
  isScrolling,
  skipImages,
  isSettling,
  isResizing,
  wouldGoBack,
  touchMode = false,
}: GalleryItemProps) {
  const { multiCamera } = useImageGalleryItemStoreFacade();
  const src = useThumbnail(img.file, img.name, !isScrolling && !skipImages && !isSettling && !isResizing);
  const { hovered, mousePos, itemHandlers } = useImageGalleryItemInteractions({
    imageId: img.imageId,
    isSelected,
    isScrolling,
    touchMode,
    onClick,
    onDoubleClick,
    onRightClick,
  });

  const borderClass = isSelected
    ? galleryStyles.itemSelected
    : isMatched
      ? `${matchesBlink ? 'matches-blink' : ''}`
      : galleryStyles.itemHover;
  return (
    <div
      className={`${galleryStyles.itemAspect} group ${galleryStyles.item} ${borderClass}`}
      style={getGalleryItemFrameStyle({ isMatched, isSelected, matchesColor })}
      {...itemHandlers}
    >
      <div className={galleryStyles.itemInner}>
        {src ? (
          <img
            src={src}
            alt={img.name}
            className={galleryStyles.itemImage}
            style={getDeletionImageStyle(isMarkedForDeletion)}
            draggable={false}
          />
        ) : (
          <div
            className={galleryStyles.placeholder}
            style={getDeletionPlaceholderStyle(isMarkedForDeletion)}
          >
            {isScrolling ? '...' : img.name}
          </div>
        )}
        {isMarkedForDeletion && <ImageGalleryDeletedOverlay className="absolute inset-0 pointer-events-none z-20" strokeWidth={1.5} />}
        {!isSelected && !isMarkedForDeletion && (
          <div
            className="absolute inset-0 pointer-events-none z-10"
            style={getGalleryItemVignetteStyle()}
          />
        )}
      </div>
      <div className={`${galleryStyles.overlay} z-20`}>
        <div className={galleryStyles.overlayText}>{img.name}</div>
      </div>
      {!touchMode && hovered && mousePos && (
        <ImageGalleryItemHoverCard
          img={img}
          multiCamera={multiCamera}
          isSelected={isSelected}
          isMatched={isMatched}
          wouldGoBack={wouldGoBack}
          mousePos={mousePos}
        />
      )}
    </div>
  );
});

export const ListItem = memo(function ListItem({
  img,
  isSelected,
  isMatched,
  isMarkedForDeletion,
  matchesColor,
  matchesBlink,
  onClick,
  onDoubleClick,
  onRightClick,
  isScrolling,
  skipImages,
  isSettling,
  isResizing,
  wouldGoBack,
  touchMode = false,
}: GalleryItemProps) {
  const { multiCamera } = useImageGalleryItemStoreFacade();
  const src = useThumbnail(img.file, img.name, !isScrolling && !skipImages && !isSettling && !isResizing);
  const { hovered, mousePos, itemHandlers } = useImageGalleryItemInteractions({
    imageId: img.imageId,
    isSelected,
    isScrolling,
    touchMode,
    onClick,
    onDoubleClick,
    onRightClick,
  });

  const borderClass = isSelected
    ? listStyles.itemSelected
    : isMatched
      ? `${matchesBlink ? 'matches-blink' : ''}`
      : listStyles.itemHover;
  return (
    <div
      style={getListItemFrameStyle({ isMatched, isSelected, matchesColor })}
      className={`${listStyles.item} px-3 list-stats-container ${borderClass}`}
      {...itemHandlers}
    >
      <div className={`${listStyles.thumbnail} ${listStyles.thumbnailSize} relative`}>
        {src ? (
          <img
            src={src}
            alt={img.name}
            className="w-full h-full object-cover"
            style={getDeletionImageStyle(isMarkedForDeletion)}
            draggable={false}
          />
        ) : (
          <div
            className={listStyles.thumbnailPlaceholder}
            style={getDeletionPlaceholderStyle(isMarkedForDeletion)}
          >
            {img.imageId}
          </div>
        )}
        {isMarkedForDeletion && <ImageGalleryDeletedOverlay />}
      </div>
      <div className={listStyles.content}>
        <div className={listStyles.title}>{img.name}</div>
        <div className={listStyles.subtitle}>{multiCamera ? `#${img.cameraId}:${img.imageId}` : `#${img.imageId}`} · {img.cameraWidth}×{img.cameraHeight}</div>
      </div>
      <div className="flex-shrink-0 text-right list-stats-compact">
        <div className="text-ds-primary text-xs whitespace-nowrap">{img.numPoints3D}<span className="text-ds-muted">/{img.numPoints2D}</span> · {img.covisibleCount} · {img.avgError.toFixed(2)}</div>
        <div className="text-ds-muted text-xs whitespace-nowrap">pts · covis · err</div>
      </div>
      <div className="flex-shrink-0 text-right list-stats-full">
        <div className="text-ds-primary text-sm">{img.numPoints3D}<span className="text-ds-muted">/{img.numPoints2D}</span></div>
        <div className="text-ds-muted text-xs">3D/2D pts</div>
      </div>
      <div className="flex-shrink-0 text-right w-16 list-stats-full">
        <div className="text-ds-primary text-sm">{img.covisibleCount}</div>
        <div className="text-ds-muted text-xs">covisible</div>
      </div>
      <div className="flex-shrink-0 text-right w-16 list-stats-full">
        <div className="text-ds-primary text-sm">{img.avgError.toFixed(2)}</div>
        <div className="text-ds-muted text-xs">avg err</div>
      </div>
      {!touchMode && hovered && mousePos && (
        <ImageGalleryItemHoverCard
          img={img}
          multiCamera={multiCamera}
          isSelected={isSelected}
          isMatched={isMatched}
          wouldGoBack={wouldGoBack}
          mousePos={mousePos}
          showStats={false}
        />
      )}
    </div>
  );
});
