import { createPortal } from 'react-dom';
import {
  hoverCardStyles,
  ICON_SIZES,
} from '../../theme';
import { formatSplatPsnrMetric, hasSplatPsnrValue } from '../viewer3d/splatPsnrMetric';
import { getImageGalleryHoverCardStyle } from './imageGalleryStyleViewModel';
import type { ImageData } from './useImageGalleryViewModel';

type MousePosition = {
  x: number;
  y: number;
};

interface ImageGalleryItemHoverCardProps {
  img: ImageData;
  multiCamera: boolean;
  isSelected: boolean;
  isMatched: boolean;
  wouldGoBack: boolean;
  mousePos: MousePosition;
  showStats?: boolean;
}

function MouseButtonIcon({ button }: { button: 'left' | 'right' }) {
  return (
    <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="6" y="2" width="12" height="20" rx="6" />
      <path d="M12 2v8" />
      <rect
        x={button === 'left' ? '6' : '12'}
        y="2"
        width="6"
        height="8"
        rx="3"
        fill="currentColor"
        opacity="0.5"
      />
    </svg>
  );
}

export function ImageGalleryItemHoverCard({
  img,
  multiCamera,
  isSelected,
  isMatched,
  wouldGoBack,
  mousePos,
  showStats = true,
}: ImageGalleryItemHoverCardProps) {
  const imageLabel = multiCamera ? `#${img.cameraId}:${img.imageId}` : `#${img.imageId}`;
  const leftHint = isSelected ? 'Left: details' : 'Left: select';
  const rightHint = isMatched ? 'Right: matches' : wouldGoBack ? 'Right: back' : 'Right: fly to';

  return createPortal(
    <div
      data-testid="image-gallery-hover-card"
      style={getImageGalleryHoverCardStyle(mousePos)}
    >
      <div className={hoverCardStyles.container}>
        {showStats && (
          <>
            <div className={hoverCardStyles.title}>{img.name}</div>
            <div className={hoverCardStyles.subtitle}>{imageLabel}</div>
            <div className={hoverCardStyles.subtitle}>{img.numPoints3D} 3D points</div>
            <div className={hoverCardStyles.subtitle}>{img.numPoints2D} 2D points</div>
            <div className={hoverCardStyles.subtitle}>{img.covisibleCount} covisible</div>
            <div className={hoverCardStyles.subtitle}>{img.avgError.toFixed(2)} avg error</div>
            {hasSplatPsnrValue(img.splatPsnr) && (
              <div className={hoverCardStyles.subtitle}>{formatSplatPsnrMetric(img.splatPsnr)}</div>
            )}
          </>
        )}
        <div className={hoverCardStyles.hint}>
          <div className={hoverCardStyles.hintRow}>
            <MouseButtonIcon button="left" />
            {leftHint}
          </div>
          <div className={hoverCardStyles.hintRow}>
            <MouseButtonIcon button="right" />
            {rightHint}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
