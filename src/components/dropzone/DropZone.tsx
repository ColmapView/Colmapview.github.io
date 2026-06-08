import { useState, useCallback, useEffect, useRef } from 'react';
import { useFileDropzone } from '../../hooks/useFileDropzone';
import { useUrlLoader } from '../../hooks/useUrlLoader';
import { useIsMobile } from '../../hooks/useIsMobile';
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

interface DropZoneProps {
  children: React.ReactNode;
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
    },
  } = useDropZoneStoreFacade();
  const configInputRef = useRef<HTMLInputElement>(null);
  const manifestInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  // Handle URL loading from modal
  const handleUrlLoad = useCallback(async (url: string) => {
    // Set loading state IMMEDIATELY so UI responds instantly
    setUrlLoading(true);
    setUrlProgress({ percent: 0, message: 'Starting...' });
    setIsUrlModalOpen(false);
    // Yield to React to paint loading UI before starting heavy work
    await new Promise(resolve => setTimeout(resolve, 0));
    await loadFromUrl(url);
  }, [loadFromUrl, setUrlLoading, setUrlProgress]);

  // Handle manifest JSON file selection
  const handleManifestFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Set loading state IMMEDIATELY so UI responds instantly
    setUrlLoading(true);
    setUrlProgress({ percent: 0, message: 'Loading manifest...' });
    // Yield to React to paint loading UI before starting heavy work
    await new Promise(resolve => setTimeout(resolve, 0));

    try {
      const result = parseManifestContent(await file.text());
      if (!result.success) {
        setError(result.errorMessage);
        setUrlLoading(false);
        return;
      }

      await loadFromManifest(result.manifest);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to load manifest: ${message}`);
      setUrlLoading(false);
    }

    // Reset input so same file can be selected again
    e.target.value = '';
  }, [loadFromManifest, setError, setUrlLoading, setUrlProgress]);

  // Handle Try a Toy! button - load random example
  const handleLucky = useCallback(async () => {
    // Early return if already loading (urlLoading state may be stale due to React batching)
    if (urlLoading) return;

    // Set loading state IMMEDIATELY so UI responds instantly
    setUrlLoading(true);
    setUrlProgress({ percent: 0, message: 'Starting...' });
    // Yield to React to paint loading UI before starting heavy work
    await new Promise(resolve => setTimeout(resolve, 0));

    const dataset = getRandomDataset();
    appLogger.info(`[Try a Toy] Loading random dataset: ${dataset.name}`);
    await loadFromUrl(getDatasetUrl(dataset.scanId));
  }, [loadFromUrl, urlLoading, setUrlLoading, setUrlProgress]);

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
    if (e.dataTransfer.types.includes('Files')) {
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
            <div className={dragOverlayStyles.icon}>+</div>
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

      {!reconstruction && !urlLoading && !hasUrlLoadRequest && !isDragOver && !isPanelDismissed && !isMobile && !touchMode && (
        <DesktopDropZonePanel
          urlLoading={urlLoading}
          onOpenUrlModal={() => setIsUrlModalOpen(true)}
          onOpenManifestFile={() => manifestInputRef.current?.click()}
          onLoadToy={handleLucky}
          onBrowse={handleBrowse}
          onUploadConfig={handleConfigUpload}
          onResetConfig={handleResetConfig}
          onDismiss={() => setIsPanelDismissed(true)}
          onOpenExampleDataset={() => window.open('https://huggingface.co/datasets/OpsiClear/NGS', '_blank')}
          onDownloadExampleManifest={handleDownloadExampleJson}
        />
      )}

      {!reconstruction && !urlLoading && !hasUrlLoadRequest && !isPanelDismissed && (touchMode || isMobile) && (
        <TouchDropZonePanel
          urlLoading={urlLoading}
          onOpenUrlModal={() => setIsUrlModalOpen(true)}
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
          >
            ×
          </button>
        </div>
      )}

      {/* URL Input Modal */}
      <UrlInputModal
        isOpen={isUrlModalOpen}
        onClose={() => setIsUrlModalOpen(false)}
        onLoad={handleUrlLoad}
        loading={urlLoading}
      />

    </div>
  );
}
