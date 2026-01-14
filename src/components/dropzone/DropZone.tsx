import { useState, useCallback, useEffect } from 'react';
import { useFileDropzone } from '../../hooks/useFileDropzone';
import { useReconstructionStore } from '../../store';
import { TIMING, buttonStyles, loadingStyles, toastStyles, dragOverlayStyles } from '../../theme';

interface DropZoneProps {
  children: React.ReactNode;
}

export function DropZone({ children }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const { handleDrop, handleDragOver } = useFileDropzone();
  const { loading, progress, error, setError } = useReconstructionStore();

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
    setIsDragOver(true);
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
        <div className={`${toastStyles.container} ${toastStyles.error} max-w-md flex items-start gap-3`}>
          <div className={toastStyles.content}>
            <div className={`${toastStyles.title} text-ds-error`}>Error loading data</div>
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
