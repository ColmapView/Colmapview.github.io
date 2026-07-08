import { useState, useEffect, useCallback, useRef } from 'react';
import { StatusBar } from './StatusBar';
import { TouchStatusBar } from './TouchStatusBar';
import { TouchGalleryDrawer } from './TouchGalleryDrawer';
import { Scene3D } from '../viewer3d';
import { ImageGallery } from '../gallery/ImageGallery';
import { GalleryErrorBoundary } from '../gallery/GalleryErrorBoundary';
import { ImageDetailModal } from '../modals/ImageDetailModal';
import { useHotkeyScope } from '../../hooks/useHotkeyScope';
import { LAYOUT_PANELS } from '../../theme';
import { clearBodyCursor, setBodyCursor } from '../../utils/bodyCursor';
import {
  APP_LAYOUT_CURSOR_OWNER,
  getAppLayoutGuideTip,
  getDraggedGalleryPanelWidth,
  getGalleryPanelInnerStyle,
  getGalleryPanelStyle,
  getInitialGalleryPanelWidth,
  getWindowResizedGalleryPanelWidth,
  shouldHideInlineGallery,
  TOUCH_LAYOUT_ROOT_CLASS,
} from './appLayoutPolicy';
import { useAppLayoutStoreFacade } from './useAppLayoutStoreFacade';

function useResizablePanel(defaultWidthPercent: number) {
  const [panelWidth, setPanelWidth] = useState(() => {
    return getInitialGalleryPanelWidth(window.innerWidth, defaultWidthPercent);
  });
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    setBodyCursor(APP_LAYOUT_CURSOR_OWNER, 'col-resize');
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      setPanelWidth(getDraggedGalleryPanelWidth({
        windowWidth: window.innerWidth,
        clientX: e.clientX,
      }));
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
        clearBodyCursor(APP_LAYOUT_CURSOR_OWNER);
        document.body.style.userSelect = '';
      }
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (isResizing) {
        clearBodyCursor(APP_LAYOUT_CURSOR_OWNER);
        document.body.style.userSelect = '';
      }
    };
  }, [isResizing]);

  // Adjust panel width when window resizes
  useEffect(() => {
    const handleResize = () => {
      setPanelWidth((prev) => getWindowResizedGalleryPanelWidth({
        currentWidth: prev,
        windowWidth: window.innerWidth,
      }));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return { panelWidth, handleMouseDown, isResizing };
}

export function AppLayout() {
  useHotkeyScope(); // Manage hotkey scopes based on modal state

  const {
    data: {
      galleryCollapsed,
      embedMode,
      touchMode,
      touchUI,
      reconstruction,
      urlLoading,
    },
    actions: {
      setTouchUIVisible,
      showGuideTip,
    },
  } = useAppLayoutStoreFacade();
  const { panelWidth, handleMouseDown, isResizing } = useResizablePanel(LAYOUT_PANELS.gallery.defaultSize);

  // In embed mode or touch mode, always hide inline gallery
  const hideGallery = shouldHideInlineGallery({ embedMode, touchMode, galleryCollapsed });

  // Prevent browser-level pinch-to-zoom and two-finger scroll in touch mode
  // so gestures are handled exclusively by the 3D canvas
  useEffect(() => {
    if (!touchMode) return;

    // Prevent multi-touch zoom/pan on the page (lets Three.js handle it)
    const preventTouch = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };

    // Prevent Safari gesture zoom
    const preventGesture = (e: Event) => { e.preventDefault(); };

    document.addEventListener('touchmove', preventTouch, { passive: false });
    document.addEventListener('gesturestart', preventGesture);
    document.addEventListener('gesturechange', preventGesture);

    return () => {
      document.removeEventListener('touchmove', preventTouch);
      document.removeEventListener('gesturestart', preventGesture);
      document.removeEventListener('gesturechange', preventGesture);
    };
  }, [touchMode]);

  // Show context menu tip when reconstruction is first loaded (only on desktop)
  const hasShownLayoutTipRef = useRef(false);

  useEffect(() => {
    const guideTip = getAppLayoutGuideTip({
      hasReconstruction: Boolean(reconstruction),
      urlLoading,
      touchMode,
      hasShownTip: hasShownLayoutTipRef.current,
    });

    if (!guideTip) return;

    hasShownLayoutTipRef.current = true;
    showGuideTip(guideTip.id, guideTip.message);
  }, [reconstruction, urlLoading, touchMode, showGuideTip]);

  // Touch mode layout - simplified like embed mode, no gallery
  if (touchMode && !embedMode) {
    return (
      <div className={TOUCH_LAYOUT_ROOT_CLASS} data-touch-mode="true">
        {/* Full-screen 3D Viewer */}
        <div className="flex-1 overflow-hidden">
          <Scene3D />
        </div>

        {/* Simplified status bar */}
        <TouchStatusBar />

        {/* Gallery drawer (toggled by gallery button in ViewerControls) */}
        {touchUI.galleryDrawer && (
          <TouchGalleryDrawer
            onClose={() => setTouchUIVisible('galleryDrawer', false)}
          />
        )}

        <ImageDetailModal />
      </div>
    );
  }

  // Desktop layout - keep content visible during loading so translucent overlay shows through
  return (
    <div className="h-screen flex flex-col bg-ds-primary relative">
      <div className="flex-1 flex overflow-hidden">
        {/* 3D Viewer - takes remaining space */}
        <div className="flex-1 min-w-0">
          <Scene3D />
        </div>

        {/* Resize handle - hairline with hover highlight (hidden in embed mode) */}
        {!hideGallery && (
          <div
            className="resize-handle"
            onMouseDown={handleMouseDown}
          />
        )}

        {/* Gallery panel with smooth transition (disabled during resize, hidden in embed mode) */}
        {!embedMode && (
          <div
            className={`overflow-hidden flex-shrink-0 ${isResizing ? '' : 'transition-all duration-300 ease-in-out'}`}
            style={getGalleryPanelStyle({ hideGallery, panelWidth })}
          >
            <div className="h-full border-l border-ds" style={getGalleryPanelInnerStyle()}>
              <GalleryErrorBoundary>
                <ImageGallery isResizing={isResizing} />
              </GalleryErrorBoundary>
            </div>
          </div>
        )}
      </div>

      {!embedMode && <StatusBar />}
      <ImageDetailModal />
    </div>
  );
}
