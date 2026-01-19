import { useState, useEffect, useCallback, useRef } from 'react';
import { StatusBar } from './StatusBar';
import { Scene3D } from '../viewer3d';
import { ImageGallery } from '../gallery/ImageGallery';
import { ImageDetailModal } from '../modals/ImageDetailModal';
import { useHotkeyScope } from '../../hooks/useHotkeyScope';
import { mobileMessageStyles, BREAKPOINTS, LAYOUT_PANELS } from '../../theme';
import { useUIStore } from '../../store/stores/uiStore';
import { useReconstructionStore } from '../../store/reconstructionStore';
import { useGuideStore } from '../../store/stores/guideStore';

const MIN_PANEL_WIDTH = 300;
const MAX_PANEL_WIDTH_PERCENT = 0.6; // 60% of window width

function useIsMobile(breakpoint = BREAKPOINTS.mobile) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [breakpoint]);

  return isMobile;
}

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

function MobileMessage() {
  return (
    <div className="h-screen flex flex-col bg-ds-primary">
      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center cursor-default select-none">
        <div className="relative w-32 h-28 mb-6 pointer-events-none">
          <svg
            className="w-full h-full"
            viewBox="0 0 120 100"
            fill="none"
          >
            {/* Monitor screen */}
            <rect
              x="10"
              y="5"
              width="100"
              height="65"
              rx="4"
              fill="#4a4a4a"
              stroke="#888"
              strokeWidth="2"
            />
            {/* Screen inner bezel */}
            <rect
              x="15"
              y="10"
              width="90"
              height="55"
              rx="2"
              fill="#2a2a2a"
            />
            {/* Stand neck */}
            <path
              d="M50 70 L50 82 L70 82 L70 70"
              fill="#666"
            />
            {/* Stand base */}
            <ellipse
              cx="60"
              cy="88"
              rx="25"
              ry="6"
              fill="#666"
            />
          </svg>
        </div>
        <h1 className={mobileMessageStyles.title}>Desktop Only</h1>
        <p className={mobileMessageStyles.message}>
          Drag and drop a COLMAP folder into ColmapView is difficult on mobile devices.
        </p>
        <a
          href="https://github.com/ColmapView/colmapview.github.io"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 no-underline"
          style={{ color: '#facc15' }}
        >
          &#9733; Save on GitHub to try on desktop later
        </a>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between p-5">
        {/* Logo on left */}
        <a
          href="https://opsiclear.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img src="/LOGO.png" alt="OpsiClear" style={{ height: '32px' }} />
        </a>

        {/* Social links on right */}
        <div className="flex items-center gap-5">
          <a
            href="https://x.com/OpsiClear"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ds-secondary"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
          </a>
          <a
            href="https://www.linkedin.com/company/opsiclear"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ds-secondary"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
          </a>
          <a
            href="https://github.com/ColmapView/colmapview.github.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ds-secondary"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}

export function AppLayout() {
  const isMobile = useIsMobile();
  useHotkeyScope(); // Manage hotkey scopes based on modal state

  const galleryCollapsed = useUIStore((s) => s.galleryCollapsed);
  const { panelWidth, handleMouseDown, isResizing } = useResizablePanel(LAYOUT_PANELS.gallery.defaultSize);

  // Show context menu tip when reconstruction is first loaded
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const loading = useReconstructionStore((s) => s.loading);
  const hasShownContextMenuTipRef = useRef(false);

  useEffect(() => {
    if (reconstruction && !loading && !hasShownContextMenuTipRef.current) {
      hasShownContextMenuTipRef.current = true;
      useGuideStore.getState().showTip(
        'contextMenu',
        'Right-click anywhere for quick actions'
      );
    }
  }, [reconstruction, loading]);

  if (isMobile) {
    return <MobileMessage />;
  }

  return (
    <div className="h-screen flex flex-col bg-ds-primary">
      <div className="flex-1 flex overflow-hidden">
        {/* 3D Viewer - takes remaining space */}
        <div className="flex-1 min-w-0">
          <Scene3D />
        </div>

        {/* Resize handle - hairline with hover highlight */}
        {!galleryCollapsed && (
          <div
            className="resize-handle"
            onMouseDown={handleMouseDown}
          />
        )}

        {/* Gallery panel with smooth transition (disabled during resize) */}
        <div
          className={`overflow-hidden flex-shrink-0 ${isResizing ? '' : 'transition-all duration-300 ease-in-out'}`}
          style={{
            width: galleryCollapsed ? 0 : panelWidth,
          }}
        >
          <div className="h-full border-l border-ds" style={{ minWidth: `${MIN_PANEL_WIDTH}px` }}>
            <ImageGallery isResizing={isResizing} />
          </div>
        </div>
      </div>

      <StatusBar />
      <ImageDetailModal />
    </div>
  );
}
