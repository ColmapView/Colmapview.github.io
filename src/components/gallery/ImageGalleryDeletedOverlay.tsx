import { memo } from 'react';

interface ImageGalleryDeletedOverlayProps {
  className?: string;
  strokeWidth?: number;
}

export const ImageGalleryDeletedOverlay = memo(function ImageGalleryDeletedOverlay({
  className = 'absolute inset-0 pointer-events-none',
  strokeWidth = 2,
}: ImageGalleryDeletedOverlayProps) {
  return (
    <div className={className} data-testid="image-gallery-deleted-overlay">
      <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <line x1="0" y1="0" x2="100" y2="100" stroke="var(--bg-primary)" strokeWidth={strokeWidth} />
        <line x1="100" y1="0" x2="0" y2="100" stroke="var(--bg-primary)" strokeWidth={strokeWidth} />
      </svg>
    </div>
  );
});
