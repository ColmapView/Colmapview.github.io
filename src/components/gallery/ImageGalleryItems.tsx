import { memo } from 'react';
import { useThumbnail } from '../../hooks/useThumbnail';
import {
  formatSplatPsnrValue,
  formatSplatSsimValue,
  hasSplatPsnrValue,
  hasSplatSsimValue,
} from '../viewer3d/splatPsnrMetric';
import {
  listStyles,
  galleryStyles,
} from '../../theme';
import type { SplatMetricColorScale } from '../viewer3d/splatPsnrMetric';
import { ImageGalleryDeletedOverlay } from './ImageGalleryDeletedOverlay';
import { ImageGalleryItemHoverCard } from './ImageGalleryItemHoverCard';
import { getGalleryImageBorderColor } from './imageGalleryBorderColorViewModel';
import {
  getDeletionImageStyle,
  getDeletionPlaceholderStyle,
  getGalleryItemFrameStyle,
  getGalleryItemVignetteStyle,
  getListItemFrameStyle,
} from './imageGalleryStyleViewModel';
import { useImageGalleryItemInteractions } from './useImageGalleryItemInteractions';
import { useImageGalleryItemStoreFacade } from './useImageGalleryItemStoreFacade';
import type { GalleryBorderColorMode, ImageData } from './useImageGalleryViewModel';

export interface GalleryItemProps {
  img: ImageData;
  borderColorMode: GalleryBorderColorMode;
  isSelected: boolean;
  isMatched: boolean;
  isMarkedForDeletion: boolean;
  matchesColor: string;
  matchesBlink: boolean;
  metricBorderColorScale: SplatMetricColorScale | null;
  onClick: (id: number) => void;
  onDoubleClick: (id: number) => void;
  onRightClick: (id: number) => void;
  isScrolling: boolean;
  skipImages: boolean;
  isSettling: boolean;
  isResizing: boolean;
  wouldGoBack: boolean;
  touchMode?: boolean;
  hideOverlay?: boolean;
}

export const GalleryItem = memo(function GalleryItem({
  img,
  borderColorMode,
  isSelected,
  isMatched,
  isMarkedForDeletion,
  matchesColor,
  matchesBlink,
  metricBorderColorScale,
  onClick,
  onDoubleClick,
  onRightClick,
  isScrolling,
  skipImages,
  isSettling,
  isResizing,
  wouldGoBack,
  touchMode = false,
  hideOverlay = false,
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
  const itemBorderColor = getGalleryImageBorderColor(img, borderColorMode, metricBorderColorScale);
  return (
    <div
      className={`${galleryStyles.itemAspect} group ${galleryStyles.item} ${borderClass}`}
      style={getGalleryItemFrameStyle({ isMatched, isSelected, itemBorderColor, matchesColor })}
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
      {!hideOverlay && (
        <div className={`${galleryStyles.overlay} z-20`}>
          <div className={galleryStyles.overlayText}>{img.name}</div>
        </div>
      )}
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
  borderColorMode,
  isSelected,
  isMatched,
  isMarkedForDeletion,
  matchesColor,
  matchesBlink,
  metricBorderColorScale,
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
  const itemBorderColor = getGalleryImageBorderColor(img, borderColorMode, metricBorderColorScale);
  const hasPsnr = hasSplatPsnrValue(img.splatPsnr);
  const hasSsim = hasSplatSsimValue(img.splatSsim);
  const hasSplatMetrics = hasPsnr || hasSsim;
  const splatMetricPairValue = `${formatSplatPsnrValue(img.splatPsnr)}/${formatSplatSsimValue(img.splatSsim)}`;
  const compactValues = [
    `${img.numPoints3D}/${img.numPoints2D}`,
    String(img.covisibleCount),
    img.avgError.toFixed(2),
    ...(hasSplatMetrics ? [splatMetricPairValue] : []),
  ];
  const compactLabels = [
    'pts',
    'covis',
    'err',
    ...(hasSplatMetrics ? ['psnr/ssim'] : []),
  ];

  return (
    <div
      style={getListItemFrameStyle({ isMatched, isSelected, itemBorderColor, matchesColor })}
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
        <div className="text-ds-primary text-xs whitespace-nowrap">{compactValues.join(' · ')}</div>
        <div className="text-ds-muted text-xs whitespace-nowrap">{compactLabels.join(' · ')}</div>
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
      {hasSplatMetrics && (
        <div className="flex-shrink-0 text-right w-24 list-stats-full">
          <div className="text-ds-primary text-sm whitespace-nowrap">{splatMetricPairValue}</div>
          <div className="text-ds-muted text-xs whitespace-nowrap">PSNR/SSIM</div>
        </div>
      )}
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
