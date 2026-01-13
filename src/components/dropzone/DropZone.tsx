import { useState, useCallback, useEffect } from 'react';
import { useFileDropzone } from '../../hooks/useFileDropzone';
import { useReconstructionStore } from '../../store';

interface DropZoneProps {
  children: React.ReactNode;
}

export function DropZone({ children }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const { handleDrop, handleDragOver } = useFileDropzone();
  const { loading, progress, error, setError, reconstruction, loadedFiles } = useReconstructionStore();

  // Determine what's missing for guidance
  const hasReconstruction = !!reconstruction;
  const hasImages = (loadedFiles?.imageFiles?.size ?? 0) > 0;
  const needsImages = hasReconstruction && !hasImages;
  const needsReconstruction = hasImages && !hasReconstruction;

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, 5000);
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
        <div className="absolute inset-0 bg-ds-accent/10 border-4 border-dashed border-ds-accent z-[500] flex items-center justify-center backdrop-blur-sm">
          <div className="text-center">
            <div className="text-4xl mb-4">+</div>
            <div className="text-xl font-semibold text-ds-primary">
              Drop COLMAP folder here
            </div>
            <div className="text-base text-ds-secondary mt-2">
              Expected: sparse/0/cameras.bin, images.bin, points3D.bin
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 bg-ds-void/80 z-[500] flex items-center justify-center">
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <div className="flex space-x-2">
                <div className="w-3 h-3 rounded-full bg-ds-accent animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-3 h-3 rounded-full bg-ds-accent animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-3 h-3 rounded-full bg-ds-accent animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
            <div className="text-xl mb-4 text-ds-primary">Loading...</div>
            <div className="w-64 h-2 bg-ds-tertiary rounded-full overflow-hidden">
              <div
                className="h-full bg-ds-accent transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-base text-ds-secondary mt-2">{progress}%</div>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] bg-ds-tertiary border border-ds-error text-ds-primary px-6 py-3 rounded-lg shadow-ds-lg max-w-md flex items-start gap-3">
          <div>
            <div className="font-semibold mb-1 text-ds-error">Error loading data</div>
            <div className="text-base text-ds-secondary">{error}</div>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-ds-muted hover:text-ds-primary text-xl leading-none"
          >
            ×
          </button>
        </div>
      )}

      {!loading && (needsImages || needsReconstruction) && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] bg-ds-tertiary/90 border border-ds text-ds-primary px-4 py-2 rounded-lg shadow-ds text-sm">
          {needsImages && "Drop images folder to view thumbnails"}
          {needsReconstruction && "Drop sparse folder to load 3D reconstruction"}
        </div>
      )}
    </div>
  );
}
