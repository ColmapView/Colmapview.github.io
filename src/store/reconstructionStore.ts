import { create } from 'zustand';
import type { Reconstruction, LoadedFiles } from '../types/colmap';
import type { WasmReconstructionWrapper } from '../wasm/reconstruction';
import type { UrlLoadProgress, UrlLoadError, ColmapManifest } from '../types/manifest';
import { useUIStore } from './stores/uiStore';
import { usePointCloudStore } from './stores/pointCloudStore';
import { useTransformStore } from './stores/transformStore';
import { getDefaultBackgroundColorForSplatLoad } from './splatBackgroundPolicy';
import { getLoadedFilesWithActiveSplatSource } from '../utils/splatFileSourcePolicy';

const SPLAT_POINT_CLOUD_DEFAULT_SIZE = 1;
const SPLAT_POINT_CLOUD_DEFAULT_OPACITY = 0.2;

/** Source type for loaded reconstruction */
export type ReconstructionSourceType = 'local' | 'url' | 'manifest' | 'zip' | null;

/**
 * Check if the current URL contains parameters that will trigger URL loading.
 * Checks for hash format (#d=...) and legacy query format (?url=...).
 * Also detects inline manifest format (flag bit 2 set in #d=... data).
 */
export function hasUrlToLoad(): boolean {
  if (typeof window === 'undefined') return false;

  // Hash format: #d=...
  const hash = window.location.hash;
  if (hash) {
    const hashContent = hash.startsWith('#') ? hash.slice(1) : hash;
    const hashParams = new URLSearchParams(hashContent);
    if (hashParams.get('d')) return true;
  }

  // Legacy query format: ?url=...
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.get('url')) return true;

  return false;
}

// Pre-compute at module load to show loading indicator immediately
const initialUrlLoading = hasUrlToLoad();

interface ReconstructionState {
  reconstruction: Reconstruction | null;
  wasmReconstruction: WasmReconstructionWrapper | null;
  loadedFiles: LoadedFiles | null;
  droppedFiles: Map<string, File> | null;
  loading: boolean;
  error: string | null;
  progress: number;
  /** Source type: 'local' for drag-drop, 'url' for manifest URL loading, 'manifest' for inline manifest */
  sourceType: ReconstructionSourceType;
  /** URL of the manifest file (only set when sourceType is 'url') */
  sourceUrl: string | null;
  /** Base URL for fetching images (baseUrl + imagesPath, only set when sourceType is 'url' or 'manifest') */
  imageUrlBase: string | null;
  /** Base URL for fetching masks (baseUrl + masksPath, only set when sourceType is 'url' or 'manifest') */
  maskUrlBase: string | null;
  /** Manifest object (only set when sourceType is 'manifest', for inline embedding in URLs) */
  sourceManifest: ColmapManifest | null;
  requestedSplatSourceId: string | null;
  /** URL loading state (shared across components) */
  urlLoading: boolean;
  urlLoadActive: boolean;
  urlProgress: UrlLoadProgress | null;
  urlError: UrlLoadError | null;

  setReconstruction: (rec: Reconstruction) => void;
  setWasmReconstruction: (wasm: WasmReconstructionWrapper | null) => void;
  setLoadedFiles: (files: LoadedFiles) => void;
  setDroppedFiles: (files: Map<string, File>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setProgress: (progress: number) => void;
  setSourceInfo: (type: ReconstructionSourceType, url?: string | null, imageUrlBase?: string | null, maskUrlBase?: string | null, manifest?: ColmapManifest | null) => void;
  setRequestedSplatSourceId: (sourceId: string | null) => void;
  tryStartUrlLoad: () => boolean;
  finishUrlLoad: () => void;
  setUrlLoading: (loading: boolean) => void;
  setUrlProgress: (progress: UrlLoadProgress | null) => void;
  setUrlError: (error: UrlLoadError | null) => void;
  clear: () => void;
}

export const useReconstructionStore = create<ReconstructionState>((set, get) => ({
  reconstruction: null,
  wasmReconstruction: null,
  loadedFiles: null,
  droppedFiles: null,
  loading: false,
  error: null,
  progress: 0,
  sourceType: null,
  sourceUrl: null,
  imageUrlBase: null,
  maskUrlBase: null,
  sourceManifest: null,
  requestedSplatSourceId: null,
  // Initialize loading state based on URL params so indicator shows immediately
  urlLoading: initialUrlLoading,
  urlLoadActive: false,
  urlProgress: initialUrlLoading ? { percent: 0, message: 'Initializing...' } : null,
  urlError: null,

  setReconstruction: (reconstruction) => {
    // Note: wasmReconstruction is managed separately via setWasmReconstruction
    // The caller should call setWasmReconstruction BEFORE setReconstruction
    // to ensure the WASM wrapper is kept alive for the fast rendering path
    set({
      reconstruction,
      loading: false,
      progress: 100,
      error: null
    });
  },

  setWasmReconstruction: (wasmReconstruction) => {
    // Dispose old wrapper before setting new one
    const oldWasm = get().wasmReconstruction;
    if (oldWasm && oldWasm !== wasmReconstruction) {
      oldWasm.dispose();
    }
    set({ wasmReconstruction });
  },

  setLoadedFiles: (loadedFiles) => {
    const previousLoadedFiles = get().loadedFiles;
    const requestedSplatSourceId = get().requestedSplatSourceId;
    const resolvedLoadedFiles = requestedSplatSourceId
      ? getLoadedFilesWithActiveSplatSource(loadedFiles, requestedSplatSourceId)
      : loadedFiles;
    const hasSplatFile = Boolean(resolvedLoadedFiles.splatFile);
    const isActiveSplatFileSwitch = Boolean(
      previousLoadedFiles?.splatFile
      && resolvedLoadedFiles.splatFile
      && isSplatFileSwitchWithinLoadedDataset(previousLoadedFiles, resolvedLoadedFiles)
    );
    const uiStore = useUIStore.getState();
    const nextBackgroundColor = getDefaultBackgroundColorForSplatLoad(
      uiStore.backgroundColor,
      hasSplatFile
    );
    if (nextBackgroundColor !== uiStore.backgroundColor) {
      uiStore.setBackgroundColor(nextBackgroundColor);
    }
    if (hasSplatFile) {
      const pointCloudStore = usePointCloudStore.getState();
      pointCloudStore.setColorMode('splatPoints');
      if (!isActiveSplatFileSwitch) {
        pointCloudStore.setPointSize(SPLAT_POINT_CLOUD_DEFAULT_SIZE);
        pointCloudStore.setPointOpacity(SPLAT_POINT_CLOUD_DEFAULT_OPACITY);
      }
    }
    if (!isActiveSplatFileSwitch) {
      useTransformStore.getState().resetSplatTransform();
    }

    set({
      loadedFiles: resolvedLoadedFiles,
      requestedSplatSourceId: requestedSplatSourceId ? null : get().requestedSplatSourceId,
    });
  },

  setDroppedFiles: (droppedFiles) => set({ droppedFiles }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({
    error,
    loading: false
  }),

  setProgress: (progress) => set({ progress }),

  setSourceInfo: (sourceType, sourceUrl = null, imageUrlBase = null, maskUrlBase = null, sourceManifest = null) => set({ sourceType, sourceUrl, imageUrlBase, maskUrlBase, sourceManifest }),

  setRequestedSplatSourceId: (requestedSplatSourceId) => {
    if (!requestedSplatSourceId) {
      set({ requestedSplatSourceId: null });
      return;
    }

    const loadedFiles = get().loadedFiles;
    if (!loadedFiles) {
      set({ requestedSplatSourceId });
      return;
    }

    set({ requestedSplatSourceId });
    get().setLoadedFiles(loadedFiles);
  },

  tryStartUrlLoad: () => {
    if (get().urlLoadActive) {
      return false;
    }
    set({ urlLoadActive: true });
    return true;
  },

  finishUrlLoad: () => set({ urlLoadActive: false }),

  setUrlLoading: (urlLoading) => set({ urlLoading }),

  setUrlProgress: (urlProgress) => set({ urlProgress }),

  // Only set urlLoading to false when there's an actual error, not when clearing
  setUrlError: (urlError) => set(urlError ? { urlError, urlLoading: false } : { urlError }),

  clear: () => {
    // Dispose WASM wrapper on clear
    const oldWasm = get().wasmReconstruction;
    if (oldWasm) {
      oldWasm.dispose();
    }
    set({
      reconstruction: null,
      wasmReconstruction: null,
      loadedFiles: null,
      droppedFiles: null,
      error: null,
      progress: 0,
      loading: false,
      sourceType: null,
      sourceUrl: null,
      imageUrlBase: null,
      maskUrlBase: null,
      sourceManifest: null,
      requestedSplatSourceId: null,
      urlLoading: false,
      urlLoadActive: false,
      urlProgress: null,
      urlError: null,
    });
    useTransformStore.getState().resetSplatTransform();
  },
}));

export const selectPointCount = (state: ReconstructionState) => {
  // Prefer WASM point count (always accurate), fall back to JS Map
  if (state.wasmReconstruction?.hasPoints()) {
    return state.wasmReconstruction.pointCount;
  }
  return state.reconstruction?.points3D?.size ?? 0;
};

export const selectImageCount = (state: ReconstructionState) =>
  state.reconstruction?.images.size ?? 0;

export const selectCameraCount = (state: ReconstructionState) =>
  state.reconstruction?.cameras.size ?? 0;

function isSplatFileSwitchWithinLoadedDataset(
  previousLoadedFiles: LoadedFiles | null,
  nextLoadedFiles: LoadedFiles
): boolean {
  if (!previousLoadedFiles) return false;
  return previousLoadedFiles.camerasFile === nextLoadedFiles.camerasFile
    && previousLoadedFiles.imagesFile === nextLoadedFiles.imagesFile
    && previousLoadedFiles.points3DFile === nextLoadedFiles.points3DFile
    && previousLoadedFiles.databaseFile === nextLoadedFiles.databaseFile
    && previousLoadedFiles.rigsFile === nextLoadedFiles.rigsFile
    && previousLoadedFiles.framesFile === nextLoadedFiles.framesFile
    && previousLoadedFiles.imageFiles === nextLoadedFiles.imageFiles
    && previousLoadedFiles.hasMasks === nextLoadedFiles.hasMasks;
}
