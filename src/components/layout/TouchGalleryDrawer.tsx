import { useState, useEffect, useRef, useCallback } from 'react';
import { ImageGallery } from '../gallery/ImageGallery';
import { GalleryErrorBoundary } from '../gallery/GalleryErrorBoundary';
import { CloseIcon } from '../../icons/ui';
import { TOUCH } from '../../theme/sizing';

interface TouchGalleryDrawerProps {
  onClose: () => void;
}

/**
 * Slide-out gallery drawer for touch mode.
 * Opens from the right edge of the screen.
 * Includes backdrop tap-to-close and close button.
 * Visibility is controlled by parent conditional rendering.
 */
export function TouchGalleryDrawer({ onClose }: TouchGalleryDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef<number | null>(null);
  const currentXRef = useRef<number>(0);

  // Swipe progress indicator (0-1)
  const [swipeProgress, setSwipeProgress] = useState(0);

  // Handle swipe-to-close gesture
  const handleTouchStart = useCallback((e: TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    currentXRef.current = 0;
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (startXRef.current === null) return;

    const deltaX = e.touches[0].clientX - startXRef.current;
    // Only track rightward swipes (positive delta)
    if (deltaX > 0) {
      currentXRef.current = deltaX;
      if (drawerRef.current) {
        drawerRef.current.style.transform = `translateX(${deltaX}px)`;
      }
      // Calculate swipe progress (0-1) based on close threshold
      const threshold = Math.min(100, TOUCH.drawerWidth * 0.3);
      const progress = Math.min(1, deltaX / threshold);
      setSwipeProgress(progress);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (startXRef.current === null) return;

    // If swiped more than 100px or 30% of drawer width, close it
    const threshold = Math.min(100, TOUCH.drawerWidth * 0.3);
    if (currentXRef.current > threshold) {
      onClose();
    } else {
      // Snap back
      if (drawerRef.current) {
        drawerRef.current.style.transform = '';
      }
    }

    startXRef.current = null;
    currentXRef.current = 0;
    setSwipeProgress(0);
  }, [onClose]);

  // Attach touch listeners for swipe-to-close
  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer) return;

    drawer.addEventListener('touchstart', handleTouchStart, { passive: true });
    drawer.addEventListener('touchmove', handleTouchMove, { passive: true });
    drawer.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      drawer.removeEventListener('touchstart', handleTouchStart);
      drawer.removeEventListener('touchmove', handleTouchMove);
      drawer.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[997] bg-ds-void/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="fixed inset-y-0 right-0 z-[998] bg-ds-secondary border-l border-ds shadow-ds-lg flex flex-col"
        style={{
          width: `min(${TOUCH.drawerWidth}px, 85vw)`,
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Image gallery"
      >
        {/* Header with close button */}
        <div className="h-12 flex items-center justify-between px-4 border-b border-ds bg-ds-tertiary flex-shrink-0">
          <h2 className="text-ds-primary text-base font-medium">Gallery</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-12 h-12 flex items-center justify-center text-ds-secondary hover:text-ds-primary active:bg-ds-hover transition-colors rounded-lg"
            aria-label="Close gallery"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Swipe indicator - grows and brightens as user swipes to close */}
        <div className="h-1 flex items-center justify-center py-2 bg-ds-tertiary border-b border-ds">
          <div
            className="h-1 bg-ds-secondary rounded-full transition-all duration-100"
            style={{
              width: 12 + swipeProgress * 24, // 12px to 36px
              opacity: 0.5 + swipeProgress * 0.5, // 0.5 to 1.0
            }}
          />
        </div>

        {/* Gallery content */}
        <div className="flex-1 overflow-hidden">
          <GalleryErrorBoundary>
            <ImageGallery isResizing={false} />
          </GalleryErrorBoundary>
        </div>
      </div>
    </>
  );
}
