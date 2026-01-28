import { useEffect, useRef } from 'react';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { DropZone } from './components/dropzone';
import { AppLayout } from './components/layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HotkeyHelpModal } from './components/modals/HotkeyHelpModal';
import { MouseTooltip } from './components/ui/MouseTooltip';
import { NotificationContainer } from './components/ui/NotificationContainer';
import { initStoreMigration, useUIStore } from './store';
import { useUrlLoader } from './hooks/useUrlLoader';
import { decodeShareData, applyShareConfig } from './hooks/useUrlState';
import { detectTouchDevice } from './hooks/useIsTouchDevice';

// Run store migration on app startup (migrates from old monolithic store to domain stores)
initStoreMigration();

function App() {
  const { loadFromUrl, loadFromManifest } = useUrlLoader();
  const hasCheckedUrl = useRef(false);

  // Check for URL parameter on mount
  useEffect(() => {
    // Only run once
    if (hasCheckedUrl.current) return;
    hasCheckedUrl.current = true;

    // Check for embed mode parameter (?embed=1 or ?embed=true)
    const params = new URLSearchParams(window.location.search);
    const embedParam = params.get('embed');
    if (embedParam === '1' || embedParam === 'true') {
      console.log('[App] Embed mode enabled');
      useUIStore.getState().setEmbedMode(true);
    }

    // Check for touch mode parameter (?touch=1, ?touch=true, ?touch=0, ?touch=false)
    // If not specified, auto-detect based on device capabilities
    const touchParam = params.get('touch');
    if (touchParam !== null) {
      const enabled = touchParam === '1' || touchParam === 'true';
      console.log(`[App] Touch mode ${enabled ? 'enabled' : 'disabled'} (URL override)`);
      useUIStore.getState().setTouchMode(enabled, 'url');
    } else {
      // Auto-detect touch capability
      const isTouchDevice = detectTouchDevice();
      if (isTouchDevice) {
        console.log('[App] Touch mode enabled (auto-detected)');
        useUIStore.getState().setTouchMode(true, 'auto');
      }
    }

    // Async function to handle URL loading
    const checkUrlAndLoad = async () => {
      // First check for combined format in hash (d=...)
      const shareData = await decodeShareData(window.location.hash);
      if (shareData) {
        // Apply config if present (before loading data so UI is ready)
        if (shareData.config) {
          console.log('[App] Applying shared config');
          applyShareConfig(shareData.config);
        }

        // Check for inline manifest first (takes priority)
        if (shareData.manifest) {
          console.log(`[App] Loading from inline manifest in URL hash: ${shareData.manifest.name || 'unnamed'}`);
          loadFromManifest(shareData.manifest);
          return;
        }

        // Otherwise use manifest URL
        if (shareData.manifestUrl) {
          console.log(`[App] Loading from combined URL hash: ${shareData.manifestUrl}`);
          loadFromUrl(shareData.manifestUrl);
          return;
        }
      }

      // Fall back to legacy query parameter format (?url=...)
      const manifestUrl = params.get('url');

      if (manifestUrl) {
        console.log(`[App] Loading from URL parameter: ${manifestUrl}`);
        loadFromUrl(manifestUrl);
      }
    };

    checkUrlAndLoad();
  }, [loadFromUrl, loadFromManifest]);

  return (
    <ErrorBoundary>
      <HotkeysProvider initiallyActiveScopes={['global', 'viewer']}>
        <DropZone>
          <AppLayout />
        </DropZone>
        <HotkeyHelpModal />
        <MouseTooltip />
        <NotificationContainer />
      </HotkeysProvider>
    </ErrorBoundary>
  );
}

export default App;
