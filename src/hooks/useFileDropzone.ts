import { useCallback } from 'react';
import {
  useImageMetricsStore,
  useNotificationStore,
  usePointCloudStore,
  useReconstructionStore,
  useSplatBackendStore,
  useUIStore,
} from '../store';
import { clearAllCaches } from '../cache';
import { isArchiveFile, loadZipFromFile, setActiveZipArchive } from '../utils/zipLoader';
import { scanDirectoryHandle, scanEntry } from '../utils/fileScanning';
import { appLogger } from '../utils/logger';
import { shouldStartSparkSplatRuntimePreload } from '../utils/splatBackendPolicy';
import { getSplatRendererRequirement } from '../utils/splatFilePolicy';
import { getShareActiveSplatSourceId } from '../utils/splatFileSourcePolicy';
import { collectDroppedFiles, collectFileDropPayload, isFileDrop } from './fileDropzoneDropPayload';
import { loadBrowsedDirectory, loadDropPayload, loadLocalZipFile } from './fileDropzoneLocalSources';
import { processFileDropzoneFiles, type FileDropzoneWorkflowOptions } from './fileDropzoneWorkflow';
import { applySavedViewerState } from './useUrlState';
import { beginReconstructionLoad } from '../wasm/reconstructionLoadLifecycle';

function cancelUrlLoad(): void {
  const { urlLoadController, finishUrlLoad } = useReconstructionStore.getState();
  if (urlLoadController) finishUrlLoad(urlLoadController.signal);
}

function beginLocalLoad() {
  const initialSplatSelectionRevision = useReconstructionStore.getState().splatSelectionRevision;
  const load = beginReconstructionLoad();
  return {
    ...load,
    initialSplatSelectionRevision,
    onViewerState: (state: Parameters<typeof applySavedViewerState>[0]) =>
      applySavedViewerState(state, null, load.assertCurrent, initialSplatSelectionRevision),
  };
}

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
  const processFiles = useCallback(async (
    files: Map<string, File>,
    progressRange?: { start: number; end: number },
    options: Pick<FileDropzoneWorkflowOptions, 'onSceneReplaced' | 'replaceSplatScene' | 'throwOnError' | 'onViewerState' | 'load' | 'signal' | 'initialSplatSelectionRevision'> = {}
  ) => {
    const initialSplatSelectionRevision = options.initialSplatSelectionRevision ?? useReconstructionStore.getState().splatSelectionRevision;
    const load = options.load ?? beginReconstructionLoad();
    const assertCurrent = () => { load.assertCurrent(); options.signal?.throwIfAborted(); };
    const onViewerState = options.onViewerState ?? ((state: Parameters<typeof applySavedViewerState>[0]) =>
      applySavedViewerState(state, null, assertCurrent, initialSplatSelectionRevision));
    try {
      return await processFileDropzoneFiles(files, {
        addNotification: useNotificationStore.getState().addNotification,
        clearSplatPsnr: useImageMetricsStore.getState().clearSplatPsnr,
        getLoadedFiles: () => useReconstructionStore.getState().loadedFiles,
        getMinTrackLength: () => usePointCloudStore.getState().minTrackLength,
        getSourceInfo: () => {
          const { imageUrlBase, sourceType } = useReconstructionStore.getState();
          return { imageUrlBase, sourceType };
        },
        getUrlLoading: () => useReconstructionStore.getState().urlLoading,
        logger: appLogger,
        // Local files carry no URL settings; URL loads pass their own handler.
        onViewerState,
        resetView,
        setDroppedFiles,
        setError,
        setLoadedFiles,
        setReconstruction,
        setUrlLoading,
        setUrlProgress,
        setWasmReconstruction,
        // Read at drop time, not at hook render: the WebGPU renderer flips
        // availability to 'ready' asynchronously, so the freshest answer is the
        // one taken the moment a splat actually arrives.
        shouldPreloadSplatRuntime: (splatFile) => {
          const { requestedBackend, availability } = useSplatBackendStore.getState();
          // The incoming file is not active yet, so state its renderer requirement explicitly.
          return shouldStartSparkSplatRuntimePreload(requestedBackend, {
            ...availability,
            activeSplatRenderer: getSplatRendererRequirement(splatFile.name),
          });
        },
        getSplatSelectionState: () => {
          const { splatSelectionRevision, loadedFiles } = useReconstructionStore.getState();
          return { revision: splatSelectionRevision, sourceId: getShareActiveSplatSourceId(loadedFiles) ?? undefined };
        },
        onSplatRuntimePreloadFailed: () => useSplatBackendStore.getState().setSparkPreloadFailed(),
      }, {
        progressRange,
        onSceneReplaced: options.onSceneReplaced,
        onViewerState,
        load,
        signal: options.signal,
        initialSplatSelectionRevision,
        replaceSplatScene: options.replaceSplatScene ?? false,
        throwOnError: options.throwOnError ?? false,
      });
    } finally {
      load.finish();
    }
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
      cancelUrlLoad,
      beginLoad: beginLocalLoad,
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
      cancelUrlLoad,
      beginLoad: beginLocalLoad,
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
      cancelUrlLoad,
      beginLoad: beginLocalLoad,
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
