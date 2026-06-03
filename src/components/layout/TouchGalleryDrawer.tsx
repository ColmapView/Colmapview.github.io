import { useEffect, useRef, useCallback } from 'react';
import { ImageGallery } from '../gallery/ImageGallery';
import { GalleryErrorBoundary } from '../gallery/GalleryErrorBoundary';
import { TOUCH } from '../../theme/sizing';
import {
  getTouchGalleryDrawerPanelStyle,
  getTouchGalleryDrawerEndAction,
  getTouchGalleryDrawerMoveState,
  TOUCH_GALLERY_DRAWER_BACKDROP_CLASS,
  TOUCH_GALLERY_DRAWER_BODY_OPEN_OVERFLOW,
  TOUCH_GALLERY_DRAWER_BODY_RESET_OVERFLOW,
  TOUCH_GALLERY_DRAWER_PANEL_CLASS,
} from './touchGalleryDrawerPolicy';

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

  // Handle swipe-to-close gesture
  const handleTouchStart = useCallback((e: TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    currentXRef.current = 0;
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    const moveState = getTouchGalleryDrawerMoveState({
      startX: startXRef.current,
      clientX: e.touches[0].clientX,
    });
    if (moveState.type === 'dragging') {
      currentXRef.current = moveState.deltaX;
      if (drawerRef.current) {
        drawerRef.current.style.transform = moveState.transform;
      }
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    const action = getTouchGalleryDrawerEndAction({
      startX: startXRef.current,
      deltaX: currentXRef.current,
      drawerWidth: TOUCH.drawerWidth,
    });
    if (action === 'none') return;

    if (action === 'close') {
      onClose();
    } else {
      // Snap back
      if (drawerRef.current) {
        drawerRef.current.style.transform = '';
      }
    }

    startXRef.current = null;
    currentXRef.current = 0;
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
    document.body.style.overflow = TOUCH_GALLERY_DRAWER_BODY_OPEN_OVERFLOW;
    return () => {
      document.body.style.overflow = TOUCH_GALLERY_DRAWER_BODY_RESET_OVERFLOW;
    };
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div
        className={TOUCH_GALLERY_DRAWER_BACKDROP_CLASS}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={TOUCH_GALLERY_DRAWER_PANEL_CLASS}
        style={getTouchGalleryDrawerPanelStyle(TOUCH.drawerWidth)}
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
