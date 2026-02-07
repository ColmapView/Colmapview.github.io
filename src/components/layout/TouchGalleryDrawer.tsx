import { useEffect, useRef, useCallback } from 'react';
import { ImageGallery } from '../gallery/ImageGallery';
import { GalleryErrorBoundary } from '../gallery/GalleryErrorBoundary';
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

  const swipeProgressRef = useRef(0);

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
      swipeProgressRef.current = progress;
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
    swipeProgressRef.current = 0;
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
