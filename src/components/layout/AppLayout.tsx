import { Panel, Group, Separator } from 'react-resizable-panels';
import { useState, useEffect } from 'react';
import { StatusBar } from './StatusBar';
import { Scene3D } from '../viewer3d';
import { ImageGallery } from '../gallery/ImageGallery';
import { ImageDetailModal } from '../modals/ImageDetailModal';
import { useHotkeyScope } from '../../hooks/useHotkeyScope';
import { separatorStyles, mobileMessageStyles, BREAKPOINTS, LAYOUT_PANELS } from '../../theme';

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

function MobileMessage() {
  return (
    <div className={mobileMessageStyles.container}>
      <svg
        className="w-16 h-16 text-ds-secondary mb-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
      <h1 className={mobileMessageStyles.title}>Desktop Only</h1>
      <p className={mobileMessageStyles.message}>
        COLMAP WebView requires a desktop browser for the best experience.
        Please open this application on a device with a larger screen.
      </p>
      <div className={mobileMessageStyles.badge}>
        Minimum width: 1080px
      </div>
    </div>
  );
}

export function AppLayout() {
  const isMobile = useIsMobile();
  useHotkeyScope(); // Manage hotkey scopes based on modal state

  if (isMobile) {
    return <MobileMessage />;
  }

  return (
    <div className="h-screen flex flex-col bg-ds-primary">
      <Group orientation="horizontal" className="flex-1">
        <Panel defaultSize={LAYOUT_PANELS.viewer.defaultSize} minSize={LAYOUT_PANELS.viewer.minSize}>
          <Scene3D />
        </Panel>

        <Separator className={separatorStyles.vertical} />

        <Panel defaultSize={LAYOUT_PANELS.gallery.defaultSize} minSize={LAYOUT_PANELS.gallery.minSize}>
          <ImageGallery />
        </Panel>
      </Group>

      <StatusBar />
      <ImageDetailModal />
    </div>
  );
}
