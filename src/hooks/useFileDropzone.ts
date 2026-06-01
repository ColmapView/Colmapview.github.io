import { useCallback } from 'react';
import { useReconstructionStore, useUIStore, usePointCloudStore, useNotificationStore } from '../store';
import { clearAllCaches } from '../cache';
import { isArchiveFile, loadZipFromFile, setActiveZipArchive } from '../utils/zipLoader';
import { scanDirectoryHandle, scanEntry } from '../utils/fileScanning';
import { appLogger } from '../utils/logger';
import { collectDroppedFiles, collectFileDropPayload, isFileDrop } from './fileDropzoneDropPayload';
import { loadBrowsedDirectory, loadDropPayload, loadLocalZipFile } from './fileDropzoneLocalSources';
import { processFileDropzoneFiles } from './fileDropzoneWorkflow';

export function useFileDropzone() {
  const {
    setReconstruction,
    setWasmReconstruction,
    setLoadedFiles,
    setDroppedFiles,
    setError,
    setSourceInfo,
    setUrlLoading,
    setUrlProgress,
  } = useReconstructionStore();
  const resetView = useUIStore((s) => s.resetView);

  /**
   * Process COLMAP files and build reconstruction.
   * @param files Map of file paths to File objects
   * @param progressRange Optional range for progress reporting. Default is 0-100.
   *                      When called from URL loader (files already downloaded), use { start: 80, end: 100 }
   */
  const processFiles = useCallback(async (files: Map<string, File>, progressRange?: { start: number; end: number }) => {
    await processFileDropzoneFiles(files, {
      addNotification: useNotificationStore.getState().addNotification,
      getMinTrackLength: () => usePointCloudStore.getState().minTrackLength,
      getSourceInfo: () => {
        const { imageUrlBase, sourceType } = useReconstructionStore.getState();
        return { imageUrlBase, sourceType };
      },
      getUrlLoading: () => useReconstructionStore.getState().urlLoading,
      logger: appLogger,
      resetView,
      setDroppedFiles,
      setError,
      setLoadedFiles,
      setReconstruction,
      setUrlLoading,
      setUrlProgress,
      setWasmReconstruction,
    }, progressRange);
  }, [
    setReconstruction,
    setWasmReconstruction,
    setLoadedFiles,
    setDroppedFiles,
    setError,
    setUrlLoading,
    setUrlProgress,
    resetView,
  ]);

  /**
   * Process a ZIP file: extract COLMAP files and set up lazy image extraction.
   */
  const processZipFile = useCallback(async (zipFile: File) => {
    await loadLocalZipFile(zipFile, {
      isLoading: () => useReconstructionStore.getState().urlLoading,
      setUrlLoading,
      setUrlProgress,
      setError,
      setSourceInfo,
      clearCaches: clearAllCaches,
      processFiles,
      loadZipFromFile,
      log: appLogger.info,
      errorLog: appLogger.error,
      setActiveZipArchive,
    });
  }, [processFiles, setUrlLoading, setUrlProgress, setError, setSourceInfo]);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();

    // Prevent file drops during active loading
    const state = useReconstructionStore.getState();
    if (state.urlLoading) {
      appLogger.info('[File Dropzone] Ignoring drop during active loading');
      return;
    }

    // Only process actual file drops, not internal UI drags
    if (!isFileDrop(e.dataTransfer)) return;

    await loadDropPayload(collectFileDropPayload(e.dataTransfer), {
      isLoading: () => useReconstructionStore.getState().urlLoading,
      setUrlLoading,
      setUrlProgress,
      setError,
      setSourceInfo,
      clearCaches: clearAllCaches,
      processFiles,
      collectDroppedFiles: (payload, scanDroppedEntry) => collectDroppedFiles(payload, scanDroppedEntry, appLogger.info),
      isArchiveFile,
      log: appLogger.info,
      errorLog: appLogger.error,
      processZipFile,
      scanEntry,
    });
  }, [processFiles, processZipFile, setUrlLoading, setUrlProgress, setError, setSourceInfo]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleBrowse = useCallback(async () => {
    await loadBrowsedDirectory({
      isLoading: () => useReconstructionStore.getState().urlLoading,
      setUrlLoading,
      setUrlProgress,
      setError,
      setSourceInfo,
      clearCaches: clearAllCaches,
      processFiles,
      log: appLogger.info,
      errorLog: appLogger.error,
      pickDirectory: 'showDirectoryPicker' in window
        ? () => window.showDirectoryPicker()
        : undefined,
      scanDirectoryHandle,
    });
  }, [processFiles, setError, setUrlLoading, setUrlProgress, setSourceInfo]);

  return {
    handleDrop,
    handleDragOver,
    processFiles,
    processZipFile,
    handleBrowse,
  };
}
