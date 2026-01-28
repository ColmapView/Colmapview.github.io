import { useState, useEffect, useCallback, useRef } from 'react';
import { StatusBar } from './StatusBar';
import { TouchStatusBar } from './TouchStatusBar';
import { TouchGalleryDrawer } from './TouchGalleryDrawer';
import { Scene3D } from '../viewer3d';
import { ImageGallery } from '../gallery/ImageGallery';
import { GalleryErrorBoundary } from '../gallery/GalleryErrorBoundary';
import { ImageDetailModal } from '../modals/ImageDetailModal';
import { GalleryFAB } from '../ui/TouchFAB';
import { useHotkeyScope } from '../../hooks/useHotkeyScope';
import { LAYOUT_PANELS } from '../../theme';
import { useUIStore } from '../../store/stores/uiStore';
import { useReconstructionStore } from '../../store/reconstructionStore';
import { useGuideStore } from '../../store/stores/guideStore';

const MIN_PANEL_WIDTH = 300;
const MAX_PANEL_WIDTH_PERCENT = 0.6; // 60% of window width

function useResizablePanel(defaultWidthPercent: number) {
  const [panelWidth, setPanelWidth] = useState(() => {
    return Math.round(window.innerWidth * (defaultWidthPercent / 100));
  });
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const newWidth = window.innerWidth - e.clientX;
      const maxWidth = window.innerWidth * MAX_PANEL_WIDTH_PERCENT;
      const clampedWidth = Math.max(MIN_PANEL_WIDTH, Math.min(maxWidth, newWidth));
      setPanelWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
        document.body.style.cursor = '';
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
    };
  }, [isResizing]);

  // Adjust panel width when window resizes
  useEffect(() => {
    const handleResize = () => {
      const maxWidth = window.innerWidth * MAX_PANEL_WIDTH_PERCENT;
      setPanelWidth((prev) => Math.min(prev, maxWidth));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return { panelWidth, handleMouseDown, isResizing };
}

export function AppLayout() {
  useHotkeyScope(); // Manage hotkey scopes based on modal state

  const galleryCollapsed = useUIStore((s) => s.galleryCollapsed);
  const embedMode = useUIStore((s) => s.embedMode);
  const touchMode = useUIStore((s) => s.touchMode);
  const touchUI = useUIStore((s) => s.touchUI);
  const setTouchUIVisible = useUIStore((s) => s.setTouchUIVisible);
  const toggleTouchUI = useUIStore((s) => s.toggleTouchUI);
  const { panelWidth, handleMouseDown, isResizing } = useResizablePanel(LAYOUT_PANELS.gallery.defaultSize);

  // In embed mode or touch mode, always hide inline gallery
  const hideGallery = embedMode || touchMode || galleryCollapsed;

  // Show context menu tip when reconstruction is first loaded (only on desktop)
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const urlLoading = useReconstructionStore((s) => s.urlLoading);
  const hasShownContextMenuTipRef = useRef(false);

  useEffect(() => {
    if (reconstruction && !urlLoading && !hasShownContextMenuTipRef.current && !touchMode) {
      hasShownContextMenuTipRef.current = true;
      useGuideStore.getState().showTip(
        'contextMenu',
        'Right-click anywhere for quick actions'
      );
    }
  }, [reconstruction, urlLoading, touchMode]);

  // Show touch tip for touch mode
  useEffect(() => {
    if (reconstruction && !urlLoading && touchMode && !hasShownContextMenuTipRef.current) {
      hasShownContextMenuTipRef.current = true;
      useGuideStore.getState().showTip(
        'touchMode',
        'Tap to select, long-press for options'
      );
    }
  }, [reconstruction, urlLoading, touchMode]);

  // Touch mode layout - simplified like embed mode, no gallery
  if (touchMode && !embedMode) {
    return (
      <div className="h-screen flex flex-col bg-ds-primary" data-touch-mode="true">
        {/* Full-screen 3D Viewer */}
        <div className="flex-1 overflow-hidden">
          <Scene3D />
        </div>

        {/* Simplified status bar */}
        <TouchStatusBar />

        {/* Gallery FAB and drawer */}
        {touchUI.galleryFAB && (
          <GalleryFAB
            isOpen={touchUI.galleryDrawer}
            onToggle={() => toggleTouchUI('galleryDrawer')}
          />
        )}
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
    <div className="h-screen flex flex-col bg-ds-primary">
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
            style={{
              width: hideGallery ? 0 : panelWidth,
            }}
          >
            <div className="h-full border-l border-ds" style={{ minWidth: `${MIN_PANEL_WIDTH}px` }}>
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
