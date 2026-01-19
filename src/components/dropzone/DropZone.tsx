import { useState, useCallback, useEffect } from 'react';
import { useFileDropzone } from '../../hooks/useFileDropzone';
import { useReconstructionStore, useUIStore } from '../../store';
import type { ImageLoadMode } from '../../store/types';
import { TIMING, buttonStyles, loadingStyles, toastStyles, dragOverlayStyles, emptyStateStyles } from '../../theme';

interface DropZoneProps {
  children: React.ReactNode;
}

export function DropZone({ children }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isPanelDismissed, setIsPanelDismissed] = useState(false);
  const { handleDrop, handleDragOver, handleBrowse } = useFileDropzone();
  const { loading, progress, error, setError, reconstruction } = useReconstructionStore();
  const imageLoadMode = useUIStore((s) => s.imageLoadMode);
  const setImageLoadMode = useUIStore((s) => s.setImageLoadMode);
  const liteParserThresholdMB = useUIStore((s) => s.liteParserThresholdMB);
  const setLiteParserThresholdMB = useUIStore((s) => s.setLiteParserThresholdMB);

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

      {!reconstruction && !loading && !isDragOver && !isPanelDismissed && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div
            className="relative flex flex-col items-center justify-center p-8 text-center bg-ds-secondary rounded-lg cursor-pointer border border-ds"
            onClick={handleBrowse}
          >
            <button
              className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center text-ds-muted hover:text-ds-primary hover:bg-white/10 rounded transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setIsPanelDismissed(true);
              }}
            >
              ×
            </button>
            <div className="mb-6 text-ds-muted font-light leading-none" style={{ fontSize: '72px' }}>+</div>
            <h2 className={emptyStateStyles.title}>Load COLMAP Data</h2>
            <p className={emptyStateStyles.message}>
              Drag and drop a COLMAP dataset folder here.<br />Or click to browse for a folder.
            </p>
            <style>{`.info-line:hover { color: rgba(255,255,255,0.9); }`}</style>
            <div className="text-ds-muted text-sm text-left max-w-md">
              <div className="info-line px-2 rounded"><strong>Drop the project root folder</strong> — subfolders are scanned automatically</div>
              <div className="info-line px-2 rounded"><strong>Required:</strong> cameras, images, points3D (.bin or .txt preferred)</div>
              <div className="info-line px-2 rounded"><strong>Auto-detected:</strong> sparse/0/, sparse/, or any subfolder</div>
              <div className="info-line px-2 rounded"><strong>Optional:</strong> source images (jpg, png, webp, tiff), config (.yaml), masks/</div>
              <div className="info-line px-2 rounded text-ds-muted/70">Without source images: point cloud and cameras only, no textures</div>
            </div>
            <div
              className="mt-4 flex items-center gap-4 flex-wrap justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2">
                <label className="text-ds-secondary text-sm">Images:</label>
                <select
                  value={imageLoadMode}
                  onChange={(e) => setImageLoadMode(e.target.value as ImageLoadMode)}
                  className="bg-ds-tertiary text-ds-primary text-sm px-2 py-1 rounded border border-ds cursor-pointer"
                >
                  <option value="prefetch">Prefetch</option>
                  <option value="lazy">Lazy</option>
                  <option value="skip">Skip</option>
                </select>
              </div>
              <div className="flex items-center gap-2" title="Skip 2D keypoints for large images.bin to save memory. 0 = always load full data.">
                <label className="text-ds-secondary text-sm">Lite Parser:</label>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={liteParserThresholdMB}
                  onChange={(e) => setLiteParserThresholdMB(Math.max(0, parseInt(e.target.value) || 0))}
                  className="bg-ds-tertiary text-ds-primary text-sm px-2 py-1 rounded border border-ds w-16 text-right"
                />
                <span className="text-ds-muted text-sm">MB</span>
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
