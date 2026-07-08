import { useEffect, useRef } from 'react';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { DropZone } from './components/dropzone';
import { AppLayout } from './components/layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HotkeyHelpModal } from './components/modals/HotkeyHelpModal';
import { SplatPickerModal } from './components/modals/SplatPickerModal';
import { ConfirmationHost } from './components/ui/ConfirmationHost';
import { MouseTooltip } from './components/ui/MouseTooltip';
import { NotificationContainer } from './components/ui/NotificationContainer';
import {
  initStoreMigration,
  useCameraStore,
  useExportStore,
  usePointCloudStore,
  useRigStore,
  useUIStore,
} from './store';
import { useUrlLoader } from './hooks/useUrlLoader';
import { decodeShareData, applyShareConfig } from './hooks/useUrlState';
import { detectTouchDevice } from './hooks/useIsTouchDevice';
import { appLogger } from './utils/logger';
import { requestConfirmation } from './utils/confirmation';
import {
  clearUrlLoadAttempt,
  markUrlLoadAttemptStarted,
  readUnfinishedUrlLoadAttempt,
  shouldConfirmUrlAutoLoad,
} from './utils/urlLoadAttemptGuard';
import {
  APP_EMBED_MODE_LOG_MESSAGE,
  APP_SHARED_CONFIG_LOG_MESSAGE,
  getAppStartupLoadPlan,
  getTouchModeAutoAction,
  getTouchModeUrlActionFromSearch,
  shouldEnableEmbedModeFromSearch,
} from './appStartupPolicy';

function rehydrateLegacyMigratedStores(): void {
  void usePointCloudStore.persist.rehydrate();
  void useCameraStore.persist.rehydrate();
  void useUIStore.persist.rehydrate();
  void useExportStore.persist.rehydrate();
  void useRigStore.persist.rehydrate();
}

// Run store migration on app startup (migrates from old monolithic store to domain stores)
if (initStoreMigration()) {
  rehydrateLegacyMigratedStores();
}

function App() {
  const { loadFromUrl, loadFromManifest } = useUrlLoader();
  const hasCheckedUrl = useRef(false);

  // Check for URL parameter on mount
  useEffect(() => {
    // Only run once
    if (hasCheckedUrl.current) return;
    hasCheckedUrl.current = true;

    const search = window.location.search;

    if (shouldEnableEmbedModeFromSearch(search)) {
      appLogger.info(APP_EMBED_MODE_LOG_MESSAGE);
      useUIStore.getState().setEmbedMode(true);
    }

    const touchAction = getTouchModeUrlActionFromSearch(search) ?? getTouchModeAutoAction(detectTouchDevice());
    if (touchAction) {
      appLogger.info(touchAction.logMessage);
      useUIStore.getState().setTouchMode(touchAction.enabled, touchAction.source);
    }

    // Async function to handle URL loading
    const checkUrlAndLoad = async () => {
      const shareData = await decodeShareData(window.location.hash);
      const loadPlan = getAppStartupLoadPlan({
        shareData,
        legacyManifestUrl: new URLSearchParams(search).get('url'),
      });

      if (loadPlan.config) {
        appLogger.info(APP_SHARED_CONFIG_LOG_MESSAGE);
        applyShareConfig(loadPlan.config);
      }

      if (loadPlan.kind === 'inline-manifest') {
        appLogger.info(loadPlan.logMessage);
        const loaded = await loadFromManifest(loadPlan.manifest);
        if (loaded && loadPlan.config) {
          applyShareConfig(loadPlan.config);
        }
        if (loaded && loadPlan.selectedImageId !== null) {
          useCameraStore.getState().setSelectedImageId(loadPlan.selectedImageId);
        }
        return;
      }

      const runGuardedUrlLoad = async (manifestUrl: string): Promise<boolean> => {
        const previousAttempt = readUnfinishedUrlLoadAttempt();
        if (shouldConfirmUrlAutoLoad(previousAttempt, manifestUrl)) {
          const retry = await requestConfirmation({
            title: 'Reload this dataset?',
            message: 'The previous attempt to load this dataset did not finish - it may have run out of memory on this device. Load it again?',
            confirmLabel: 'Load again',
            cancelLabel: 'Not now',
            size: 'compact',
          });
          if (!retry) {
            clearUrlLoadAttempt();
            return false;
          }
        }
        markUrlLoadAttemptStarted(manifestUrl);
        const loaded = await loadFromUrl(manifestUrl);
        clearUrlLoadAttempt();
        return loaded;
      };

      if (loadPlan.kind === 'manifest-url') {
        appLogger.info(loadPlan.logMessage);
        const loaded = await runGuardedUrlLoad(loadPlan.manifestUrl);
        if (loaded && loadPlan.config) {
          applyShareConfig(loadPlan.config);
        }
        if (loaded && loadPlan.selectedImageId !== null) {
          useCameraStore.getState().setSelectedImageId(loadPlan.selectedImageId);
        }
        return;
      }

      if (loadPlan.kind === 'legacy-url') {
        appLogger.info(loadPlan.logMessage);
        await runGuardedUrlLoad(loadPlan.manifestUrl);
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
        <SplatPickerModal />
        <ConfirmationHost />
        <MouseTooltip />
        <NotificationContainer />
      </HotkeysProvider>
    </ErrorBoundary>
  );
}

export default App;
