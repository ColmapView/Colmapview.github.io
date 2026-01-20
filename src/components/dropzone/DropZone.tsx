import { useState, useCallback, useEffect, useRef } from 'react';
import { useFileDropzone } from '../../hooks/useFileDropzone';
import { useUrlLoader } from '../../hooks/useUrlLoader';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useReconstructionStore, hasUrlToLoad } from '../../store';
import { STORAGE_KEYS } from '../../store/migration';
import { parseConfigYaml, applyConfigurationToStores } from '../../config/configuration';
import { ColmapManifestSchema } from '../../types/manifest';
import { getRandomDataset, getDatasetUrl } from '../../constants/exampleDatasets';
import { TIMING, buttonStyles, loadingStyles, toastStyles, dragOverlayStyles, emptyStateStyles } from '../../theme';
import { ResetIcon, UploadIcon, LinkIcon, FileJsonIcon } from '../../icons';
import { UrlInputModal } from '../modals/UrlInputModal';
import { publicAsset } from '../../utils/paths';

interface DropZoneProps {
  children: React.ReactNode;
}

export function DropZone({ children }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isPanelDismissed, setIsPanelDismissed] = useState(false);
  const [isUrlModalOpen, setIsUrlModalOpen] = useState(false);
  const { handleDrop, handleDragOver, handleBrowse } = useFileDropzone();
  const { loadFromUrl, loadFromManifest, urlLoading, urlProgress } = useUrlLoader();
  const { loading, progress, error, setError, reconstruction } = useReconstructionStore();
  const configInputRef = useRef<HTMLInputElement>(null);
  const manifestInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  // Handle URL loading from modal
  const handleUrlLoad = useCallback(async (url: string) => {
    setIsUrlModalOpen(false);
    await loadFromUrl(url);
  }, [loadFromUrl]);

  // Handle manifest JSON file selection
  const handleManifestFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const data = JSON.parse(content);

      // Validate with Zod
      const result = ColmapManifestSchema.safeParse(data);
      if (!result.success) {
        const errors = result.error.issues.map((err) => `${err.path.join('.')}: ${err.message}`).join('; ');
        setError(`Invalid manifest: ${errors}`);
        return;
      }

      await loadFromManifest(result.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to load manifest: ${message}`);
    }

    // Reset input so same file can be selected again
    e.target.value = '';
  }, [loadFromManifest, setError]);

  // Handle Try a Toy! button - load random example
  const handleLucky = useCallback(async () => {
    const dataset = getRandomDataset();
    console.log(`[Try a Toy] Loading random dataset: ${dataset.name}`);
    await loadFromUrl(getDatasetUrl(dataset.scanId));
  }, [loadFromUrl]);

  // Reset all persisted configuration to defaults
  const handleResetConfig = useCallback(() => {
    if (confirm('Reset all settings to defaults? This will clear your saved preferences.')) {
      Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
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

    try {
      const content = await file.text();
      const result = parseConfigYaml(content);

      if (result.valid && result.config) {
        applyConfigurationToStores(result.config);
        console.log(`[Config] Applied settings from ${file.name}`);
      } else {
        const errorMessages = result.errors
          .map(err => err.path ? `${err.path}: ${err.message}` : err.message)
          .join(', ');
        setError(`Config error: ${errorMessages}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Config error: ${message}`);
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
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
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
              Drop COLMAP folder here
            </div>
            <div className={dragOverlayStyles.subtitle}>
              Expected: sparse/0/cameras.bin, images.bin, points3D.bin
            </div>
          </div>
        </div>
      )}

      {!reconstruction && !loading && !urlLoading && !hasUrlToLoad() && !isDragOver && !isPanelDismissed && !isMobile && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="flex flex-col bg-ds-secondary rounded-lg border border-ds p-6 min-w-[420px]">
            {/* Header row: action buttons */}
            <div className="flex justify-between -mt-4 -mx-4 mb-2">
              <div className="flex gap-1">
                <button
                  type="button"
                  className={`${buttonStyles.base} w-8 h-8 ${buttonStyles.variants.ghost}`}
                  onClick={handleResetConfig}
                  data-tooltip="Reset all settings to defaults"
                >
                  <ResetIcon className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  className={`${buttonStyles.base} w-8 h-8 ${buttonStyles.variants.ghost}`}
                  onClick={handleConfigUpload}
                  data-tooltip="Upload configuration file (.yaml)"
                >
                  <UploadIcon className="w-4 h-4" />
                </button>
              </div>
              <button
                type="button"
                className={`${buttonStyles.base} w-8 h-8 ${buttonStyles.variants.ghost}`}
                onClick={() => setIsPanelDismissed(true)}
                data-tooltip="Dismiss this panel"
              >
                ×
              </button>
            </div>

            {/* Hidden file input for config upload */}
            <input
              ref={configInputRef}
              type="file"
              accept=".yaml,.yml"
              className="hidden"
              onChange={handleConfigFileChange}
            />

            {/* Hidden file input for manifest.json upload */}
            <input
              ref={manifestInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleManifestFileChange}
            />

            {/* Main content area */}
            <div className="flex flex-col items-center">
              {/* Drop zone button with dotted border */}
              <div
                className="w-32 h-32 mb-6 flex items-center justify-center border-2 border-dashed border-ds-muted rounded-lg cursor-pointer hover-border-ds-primary transition-colors"
                onClick={handleBrowse}
              >
                <span className="text-ds-muted font-light leading-none" style={{ fontSize: '72px' }}>+</span>
              </div>
              <h2 className={emptyStateStyles.title}>Load COLMAP Data</h2>
              <p className={emptyStateStyles.message}>
                Drag and drop a COLMAP dataset folder here.<br />Or click the box above to browse.
              </p>
              <style>{`.info-line:hover { color: rgba(255,255,255,0.9); }`}</style>
              <div className="text-ds-muted text-sm text-left max-w-md mt-6 mb-4">
                <div className="info-line px-2 rounded"><strong>Drop the project root folder</strong> — subfolders are scanned automatically</div>
                <div className="info-line px-2 rounded"><strong>Required:</strong> cameras, images, points3D (.bin or .txt preferred)</div>
                <div className="info-line px-2 rounded"><strong>Auto-detected:</strong> sparse/0/, sparse/, or any subfolder</div>
                <div className="info-line px-2 rounded"><strong>Optional:</strong> source images (jpg, png, webp, tiff), config (.yaml), masks/</div>
                <div className="info-line px-2 rounded text-ds-muted/70">Without source images: point cloud and cameras only, no textures</div>
              </div>

              {/* Action buttons row */}
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setIsUrlModalOpen(true)}
                  disabled={urlLoading}
                  className={`${buttonStyles.base} ${buttonStyles.sizes.action} ${buttonStyles.variants.secondary} ${urlLoading ? buttonStyles.disabled : ''}`}
                  data-tooltip="Load from URL"
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  Load URL
                </button>
                <button
                  type="button"
                  onClick={() => manifestInputRef.current?.click()}
                  disabled={urlLoading}
                  className={`${buttonStyles.base} ${buttonStyles.sizes.action} ${buttonStyles.variants.secondary} ${urlLoading ? buttonStyles.disabled : ''}`}
                  data-tooltip="Load from manifest.json file"
                >
                  <FileJsonIcon className="w-3.5 h-3.5" />
                  Load JSON
                </button>
                <button
                  type="button"
                  onClick={handleLucky}
                  disabled={urlLoading}
                  className={`${buttonStyles.base} ${buttonStyles.sizes.action} ${buttonStyles.variants.secondary} ${urlLoading ? buttonStyles.disabled : ''}`}
                  data-tooltip="Play a random toy from OpsiClear"
                >
                  <img src={publicAsset('LOGO.png')} alt="" className="w-3.5 h-3.5" />
                  Try a Toy!
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {loading && (
        <div className={loadingStyles.overlay}>
          <div className={loadingStyles.container}>
            <div className={loadingStyles.dots}>
              <div className={loadingStyles.dot} style={{ animationDelay: `${TIMING.bounceDelays[0]}ms` }} />
              <div className={loadingStyles.dot} style={{ animationDelay: `${TIMING.bounceDelays[1]}ms` }} />
              <div className={loadingStyles.dot} style={{ animationDelay: `${TIMING.bounceDelays[2]}ms` }} />
            </div>
            <div className={loadingStyles.text}>Loading...</div>
            <div className={loadingStyles.progressBar}>
              <div
                className={loadingStyles.progressFill}
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className={loadingStyles.percentage}>{progress}%</div>
          </div>
        </div>
      )}

      {urlLoading && urlProgress && (
        <div className={loadingStyles.overlay}>
          <div className={loadingStyles.container}>
            <div className={loadingStyles.dots}>
              <div className={loadingStyles.dot} style={{ animationDelay: `${TIMING.bounceDelays[0]}ms` }} />
              <div className={loadingStyles.dot} style={{ animationDelay: `${TIMING.bounceDelays[1]}ms` }} />
              <div className={loadingStyles.dot} style={{ animationDelay: `${TIMING.bounceDelays[2]}ms` }} />
            </div>
            <div className={loadingStyles.text}>{urlProgress.message}</div>
            <div className={loadingStyles.progressBar}>
              <div
                className={loadingStyles.progressFill}
                style={{ width: `${urlProgress.percent}%` }}
              />
            </div>
            <div className={loadingStyles.percentage}>{urlProgress.percent}%</div>
            {urlProgress.currentFile && (
              <div className="text-ds-muted text-xs mt-2 max-w-xs truncate">
                {urlProgress.currentFile}
              </div>
            )}
            {urlProgress.filesDownloaded !== undefined && urlProgress.totalFiles !== undefined && (
              <div className="text-ds-muted/70 text-xs mt-1">
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
