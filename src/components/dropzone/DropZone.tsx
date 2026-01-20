import { useState, useCallback, useEffect, useRef } from 'react';
import { useFileDropzone } from '../../hooks/useFileDropzone';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useReconstructionStore } from '../../store';
import { STORAGE_KEYS } from '../../store/migration';
import { parseConfigYaml, applyConfigurationToStores } from '../../config/configuration';
import { TIMING, buttonStyles, loadingStyles, toastStyles, dragOverlayStyles, emptyStateStyles } from '../../theme';
import { ResetIcon, UploadIcon } from '../../icons';

interface DropZoneProps {
  children: React.ReactNode;
}

export function DropZone({ children }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isPanelDismissed, setIsPanelDismissed] = useState(false);
  const { handleDrop, handleDragOver, handleBrowse } = useFileDropzone();
  const { loading, progress, error, setError, reconstruction } = useReconstructionStore();
  const configInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

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

      {!reconstruction && !loading && !isDragOver && !isPanelDismissed && !isMobile && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="flex flex-col bg-ds-secondary rounded-lg border border-ds p-6">
            {/* Header row: action buttons */}
            <div className="flex justify-between -mt-4 -mx-4 mb-2">
              <div className="flex gap-1">
                <button
                  type="button"
                  className="w-8 h-8 flex items-center justify-center text-ds-muted hover-ds-text-primary hover-bg-white-10 rounded transition-colors"
                  onClick={handleResetConfig}
                  title="Reset all settings to defaults"
                >
                  <ResetIcon className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  className="w-8 h-8 flex items-center justify-center text-ds-muted hover-ds-text-primary hover-bg-white-10 rounded transition-colors"
                  onClick={handleConfigUpload}
                  title="Upload configuration file (.yaml)"
                >
                  <UploadIcon className="w-4 h-4" />
                </button>
              </div>
              <button
                type="button"
                className="w-8 h-8 flex items-center justify-center text-ds-muted hover-ds-text-primary hover-bg-white-10 rounded transition-colors"
                onClick={() => setIsPanelDismissed(true)}
                title="Dismiss this panel"
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

            {/* Content area */}
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

    </div>
  );
}
