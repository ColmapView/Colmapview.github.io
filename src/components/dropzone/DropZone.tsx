import { useState, useCallback, useEffect, useRef } from 'react';
import { useFileDropzone } from '../../hooks/useFileDropzone';
import { useUrlLoader } from '../../hooks/useUrlLoader';
import { runUrlLoadPreparation, type UrlLoadPreparation } from '../../hooks/urlLoaderLoadGuard';
import { clearPersistedSettings } from '../../store/migration';
import { importConfigFile } from '../../config/configuration';
import { getRandomDataset, getDatasetUrl } from '../../constants/exampleDatasets';
import { TIMING, buttonStyles, loadingStyles, toastStyles, dragOverlayStyles } from '../../theme';
import { UrlInputModal } from '../modals/UrlInputModal';
import { publicAsset } from '../../utils/paths';
import { requestConfirmation } from '../../utils/confirmation';
import { containsEventTarget } from '../../utils/domTargetGuards';
import { downloadBlob } from '../../utils/download';
import { appLogger } from '../../utils/logger';
import { DesktopDropZonePanel, TouchDropZonePanel } from './DropZonePanels';
import { getDropZoneProgressFillStyle } from './dropZoneLoadingViewModel';
import { createExampleManifest, parseManifestContent } from './dropZoneManifestPolicy';
import { useDropZoneStoreFacade } from './useDropZoneStoreFacade';
import { CloseIcon, PlusIcon } from '../../icons';
import { StorageAccessPrompt } from './StorageAccessPrompt';

interface DropZoneProps {
  children: React.ReactNode;
}

/** An open dialog covers the page: files dropped on it are not a dataset for the scene underneath. */
function isOverModalDialog(target: EventTarget): boolean {
  return target instanceof Element && target.closest('[aria-modal="true"]') !== null;
}

export function DropZone({ children }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isPanelDismissed, setIsPanelDismissed] = useState(false);
  const [isUrlModalOpen, setIsUrlModalOpen] = useState(false);
  const { handleDrop, handleDragOver, handleBrowse } = useFileDropzone();
  const { loadFromUrl, loadFromManifest, urlLoading, urlProgress, setUrlLoading, setUrlProgress } = useUrlLoader();
  const {
    data: {
      error,
      reconstruction,
      touchMode,
      hasUrlLoadRequest,
    },
    actions: {
      setError,
      cancelLoading,
    },
  } = useDropZoneStoreFacade();
  const configInputRef = useRef<HTMLInputElement>(null);
  const manifestInputRef = useRef<HTMLInputElement>(null);

  const prepareUrlLoad = useCallback((message: string, prepare: UrlLoadPreparation) =>
    runUrlLoadPreparation({ setError, setUrlLoading, setUrlProgress }, message, prepare), [setError, setUrlLoading, setUrlProgress]);

  // Handle URL loading from modal
  const handleUrlLoad = useCallback(async (url: string) => {
    setIsUrlModalOpen(false);
    await prepareUrlLoad('Starting...', async (_assertCurrent, initialSplatSelectionRevision) =>
      () => loadFromUrl(url, { initialSplatSelectionRevision }));
  }, [loadFromUrl, prepareUrlLoad]);

  // Handle manifest JSON file selection
  const handleManifestFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await prepareUrlLoad('Loading manifest...', async (assertCurrent, initialSplatSelectionRevision) => {
        let content: string;
        try {
          content = await file.text();
        } catch (err) {
          throw new Error(`Failed to load manifest: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
        assertCurrent();
        const result = parseManifestContent(content);
        if (!result.success) throw new Error(result.errorMessage);
        return () => loadFromManifest(result.manifest, { initialSplatSelectionRevision });
      });
    } finally {
      // Reset input so same file can be selected again.
      e.target.value = '';
    }
  }, [loadFromManifest, prepareUrlLoad]);

  // Handle Try a Toy! button - load random example
  const handleLucky = useCallback(async () => {
    await prepareUrlLoad('Starting...', async (_assertCurrent, initialSplatSelectionRevision) => {
      const dataset = getRandomDataset();
      appLogger.info(`[Try a Toy] Loading random dataset: ${dataset.name}`);
      return () => loadFromUrl(getDatasetUrl(dataset.scanId), { initialSplatSelectionRevision });
    });
  }, [loadFromUrl, prepareUrlLoad]);

  // Download example manifest.json
  const handleDownloadExampleJson = useCallback(() => {
    const exampleManifest = createExampleManifest();
    const blob = new Blob([JSON.stringify(exampleManifest, null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'manifest.json');
  }, []);

  // Reset all persisted configuration to defaults
  const handleResetConfig = useCallback(async () => {
    if (await requestConfirmation({
      title: 'Reset settings?',
      message: 'This will clear your saved preferences and reload the app.',
      confirmLabel: 'Reset',
      tone: 'danger',
      size: 'compact',
    })) {
      clearPersistedSettings();
      window.location.reload();
    }
  }, []);

  // Upload and apply configuration from YAML file
  const handleConfigUpload = useCallback(() => {
    configInputRef.current?.click();
  }, []);

  const handleConfigFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = await importConfigFile(file);
    if (!result.applied && result.errorMessage) {
      setError(result.errorMessage);
    }

    // Reset input so same file can be selected again
    e.target.value = '';
  }, [setError]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, TIMING.errorToastDuration);
      return () => clearTimeout(timer);
    }
  }, [error, setError]);

  const onDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Only respond to file drags, not internal UI drags (e.g., dragging in popup panels)
    if (e.dataTransfer.types.includes('Files') && !isOverModalDialog(e.target)) {
      setIsDragOver(true);
    }
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!containsEventTarget(e.currentTarget, e.relatedTarget)) {
      setIsDragOver(false);
    }
  }, []);

  const onDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    setIsDragOver(false);
    if (isOverModalDialog(e.target)) {
      // Prevented, so the browser does not open the file in place of the viewer either.
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    await handleDrop(e);
  }, [handleDrop]);

  return (
    <div
      className="relative w-full h-full"
      data-testid="drop-zone"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={handleDragOver}
      onDrop={onDrop}
    >
      {children}

      {isDragOver && (
        <div className={dragOverlayStyles.container}>
          <div className={dragOverlayStyles.content}>
            <div className={dragOverlayStyles.icon}><PlusIcon className="w-12 h-12" /></div>
            <div className={dragOverlayStyles.title}>
              Drop dataset folder or ZIP here
            </div>
            <div className={dragOverlayStyles.subtitle}>
              COLMAP binaries, image-only folders, and optional splats are supported
            </div>
          </div>
        </div>
      )}

      <input
        ref={configInputRef}
        type="file"
        accept=".yaml,.yml"
        className="hidden"
        onChange={handleConfigFileChange}
      />

      <input
        ref={manifestInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleManifestFileChange}
      />

      {!reconstruction && !urlLoading && !hasUrlLoadRequest && !isDragOver && !isPanelDismissed && !touchMode && (
        <DesktopDropZonePanel
          urlLoading={urlLoading}
          onOpenUrlModal={() => setIsUrlModalOpen(true)}
          onLoadRemoteDataset={handleUrlLoad}
          onOpenManifestFile={() => manifestInputRef.current?.click()}
          onLoadToy={handleLucky}
          onBrowse={handleBrowse}
          onUploadConfig={handleConfigUpload}
          onResetConfig={handleResetConfig}
          onDismiss={() => setIsPanelDismissed(true)}
          onOpenExampleDataset={() => window.open('https://huggingface.co/datasets/OpsiClear/NGS', '_blank', 'noopener,noreferrer')}
          onDownloadExampleManifest={handleDownloadExampleJson}
        />
      )}

      {!reconstruction && !urlLoading && !hasUrlLoadRequest && !isPanelDismissed && touchMode && (
        <TouchDropZonePanel
          urlLoading={urlLoading}
          onOpenUrlModal={() => setIsUrlModalOpen(true)}
          onLoadRemoteDataset={handleUrlLoad}
          onLoadToy={handleLucky}
          onDismiss={() => setIsPanelDismissed(true)}
        />
      )}

      {urlLoading && urlProgress && (
        <div className={loadingStyles.overlay}>
          <div className={loadingStyles.container}>
            <div className="flex justify-center mb-4">
              <img
                src={publicAsset('LOGO.png')}
                alt="Loading"
                className="w-12 h-12 animate-bounce"
              />
            </div>
            <div className={loadingStyles.text}>{urlProgress.message}</div>
            <div className={loadingStyles.progressBar}>
              <div
                className={loadingStyles.progressFill}
                style={getDropZoneProgressFillStyle(urlProgress.percent)}
              />
            </div>
            <div className={loadingStyles.percentage}>{Math.round(urlProgress.percent)}%</div>
            {urlProgress.currentFile && (
              <div className="text-white/70 text-xs mt-2 max-w-xs truncate">
                {urlProgress.currentFile}
              </div>
            )}
            {urlProgress.filesDownloaded !== undefined && urlProgress.totalFiles !== undefined && (
              <div className="text-white/70 text-xs mt-1">
                {urlProgress.filesDownloaded} / {urlProgress.totalFiles} files
              </div>
            )}
            {urlProgress.bytesLoaded !== undefined && urlProgress.bytesTotal !== undefined && (
              <div className="text-white/70 text-xs mt-1">
                {formatByteProgress(urlProgress.bytesLoaded)} / {formatByteProgress(urlProgress.bytesTotal)}
              </div>
            )}
            <button type="button" className="mt-4 text-sm text-white underline" onClick={cancelLoading}>Cancel loading</button>
          </div>
        </div>
      )}

      {error && (
        <div className={`${toastStyles.containerWithLayout} ${toastStyles.error}`}>
          <div className={toastStyles.content}>
            <div className={toastStyles.titleError}>Error loading data</div>
            <div className={toastStyles.message}>{error}</div>
          </div>
          <button
            onClick={() => setError(null)}
            className={buttonStyles.close}
            aria-label="Dismiss error"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* URL Input Modal */}
      <StorageAccessPrompt onOpenUrlModal={() => setIsUrlModalOpen(true)} onLoadRemoteDataset={handleUrlLoad} />
      <UrlInputModal
        isOpen={isUrlModalOpen}
        onClose={() => setIsUrlModalOpen(false)}
        onLoad={handleUrlLoad}
        loading={urlLoading}
      />

    </div>
  );
}

function formatByteProgress(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
