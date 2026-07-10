import { create } from 'zustand';
import type { Reconstruction, LoadedFiles, SplatFileSource } from '../types/colmap';
import type { WasmReconstructionWrapper } from '../wasm/reconstruction';
import type { UrlLoadProgress, UrlLoadError, ColmapManifest } from '../types/manifest';
import { useUIStore } from './stores/uiStore';
import {
  usePointCloudStore,
  POINT_CLOUD_DEFAULT_SIZE,
  POINT_CLOUD_DEFAULT_OPACITY,
} from './stores/pointCloudStore';
import { useSplatBackendStore } from './stores/splatBackendStore';
import { useTransformStore } from './stores/transformStore';
import { getDefaultBackgroundColorForSplatLoad } from './splatBackgroundPolicy';
import {
  applyActiveSplatFile,
  applyActiveSplatPlaceholder,
  clearActiveSplatFile,
  findSplatSourceById,
  getLoadedFilesWithActiveSplatSource,
  loadedFilesHaveSplatData,
  mergeRemoteSplatCatalog as mergeRemoteSplatCatalogIntoLoadedFiles,
} from '../utils/splatFileSourcePolicy';
import { isSplatColorMode } from './types';
import { fetchRemoteSplatBytes, fetchRemoteSplatFile, toArrayBuffer } from '../utils/urlUtils';
import { getSplatDownloadProgress, getSplatPhaseProgress } from '../utils/splatLoadingProgressPolicy';
import {
  canUseByteLessSplatLoader,
  TOUCH_SPLAT_BYTELESS_RETENTION_MIN_BYTES,
} from '../hooks/urlLoaderPolicy';
import { detectTouchDevice } from '../hooks/useIsTouchDevice';

const SPLAT_POINT_CLOUD_DEFAULT_SIZE = 1;
const SPLAT_POINT_CLOUD_DEFAULT_OPACITY = 0.2;

// Monotonic token for lazy splat selection. Each selectSplatSource call claims a
// new id; an in-flight fetch only applies its result if it is still the latest
// (latest-wins), so out-of-order resolutions can't show a stale tile or let a
// superseded fetch's failure clobber the winner's state.
let activeSplatRequestId = 0;

/** Switch the point cloud into a splat-visible display mode with splat defaults. */
function applySplatPointDisplayDefaults(): void {
  const pointCloudStore = usePointCloudStore.getState();
  pointCloudStore.setColorMode('splatPoints');
  pointCloudStore.setPointSize(SPLAT_POINT_CLOUD_DEFAULT_SIZE);
  pointCloudStore.setPointOpacity(SPLAT_POINT_CLOUD_DEFAULT_OPACITY);
}

/**
 * Inverse of applySplatPointDisplayDefaults: when a dataset without any splat loads,
 * undo the splat-visible preset carried over from a previous splat dataset. That
 * preset — a splat color mode AND the shrunken point size/opacity (1 / 0.2) — is
 * persisted across sessions, so without this restore it leaks into a later splat-less
 * dataset: the COLMAP points render as tiny, near-invisible dots behind a splat that
 * will never appear, leaving a near-blank view. Drops the splat color mode back to RGB
 * (setShowSplats(false) maps a splat mode to 'rgb' and keeps showSplats in sync) and
 * restores the plain point size/opacity defaults. No-op unless the current mode is
 * actually a splat mode, so a user's own non-splat size/opacity choices are preserved.
 */
function restorePointDisplayForSplatlessDataset(): void {
  const pointCloudStore = usePointCloudStore.getState();
  if (isSplatColorMode(pointCloudStore.colorMode)) {
    pointCloudStore.setShowSplats(false);
    pointCloudStore.setPointSize(POINT_CLOUD_DEFAULT_SIZE);
    pointCloudStore.setPointOpacity(POINT_CLOUD_DEFAULT_OPACITY);
  }
}

/**
 * When a splat first becomes active (picked from the splat picker, or a lazy tile
 * selected from COLMAP-only), switch the viewer to a splat-visible mode and dark
 * background so the splat actually shows. Mirrors the first-load behavior in
 * setLoadedFiles; callers skip this for tile-to-tile switches so a display mode
 * the user chose is preserved.
 */
function applySplatActivationVisuals(): void {
  const uiStore = useUIStore.getState();
  const nextBackgroundColor = getDefaultBackgroundColorForSplatLoad(uiStore.backgroundColor, true);
  if (nextBackgroundColor !== uiStore.backgroundColor) {
    uiStore.setBackgroundColor(nextBackgroundColor);
  }
  applySplatPointDisplayDefaults();
}

/**
 * Byte-less gate for a lazily-selected remote splat: touch hardware, above the
 * retention budget, AND a backend context where the seeded WebGPU decode cache
 * will actually serve the render. The Spark fallback streams `splatFile` bytes
 * directly and would render a byte-less placeholder as empty, so Spark-bound
 * devices (and desktop, and small tiles) keep the byte-retaining path.
 */
function shouldActivateSplatSourceByteLess(source: SplatFileSource): boolean {
  const isTouchDevice = detectTouchDevice();
  if (!isTouchDevice || (source.size ?? 0) <= TOUCH_SPLAT_BYTELESS_RETENTION_MIN_BYTES) {
    return false;
  }
  const { requestedBackend, availability } = useSplatBackendStore.getState();
  return canUseByteLessSplatLoader({
    isTouchDevice,
    requestedBackend,
    webGpuAvailability: availability.webGpu,
    sparkBackendAvailable: availability.spark,
  });
}

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

/**
 * Inverse of hasUrlToLoad(): strip the auto-load request from the current URL so
 * hasUrlToLoad() returns false. Removes the legacy `?url=` query param and the
 * `#d=` share-data hash param (leaving any other hash params intact). Used when the
 * user declines a crash-loop reload — without this the DropZone landing panels stay
 * gated behind a load request that will never run, showing a permanent "Loading…".
 */
export function clearUrlLoadRequestFromLocation(
  win: Pick<Window, 'location' | 'history'> = window
): void {
  try {
    const url = new URL(win.location.href);
    url.searchParams.delete('url');
    const hashContent = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
    const hashParams = new URLSearchParams(hashContent);
    if (hashParams.has('d')) {
      hashParams.delete('d');
      const nextHash = hashParams.toString();
      url.hash = nextHash ? `#${nextHash}` : '';
    }
    win.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Best-effort: never let a URL rewrite block declining a load.
  }
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
  /**
   * Per-image absolute image URLs (COLMAP name -> URL) for datasets with an
   * explicit mapping. Used in preference to imageUrlBase + name; unmapped names
   * fall back to imageUrlBase. Each value is final and used verbatim.
   */
  imageNameToUrl: Record<string, string> | null;
  /** Manifest object (only set when sourceType is 'manifest', for inline embedding in URLs) */
  sourceManifest: ColmapManifest | null;
  requestedSplatSourceId: string | null;
  /** Whether to show the "select a splat" popup (set when >1 splat is discovered). */
  showSplatPicker: boolean;
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
  setSourceInfo: (type: ReconstructionSourceType, url?: string | null, imageUrlBase?: string | null, maskUrlBase?: string | null, manifest?: ColmapManifest | null, imageNameToUrl?: Record<string, string> | null) => void;
  setRequestedSplatSourceId: (sourceId: string | null) => void;
  /** Merge a discovered remote splat catalog so all tiles are listed (lazy). */
  mergeRemoteSplatCatalog: (
    catalog: ReadonlyArray<{ path: string; size: number; splatCount?: number | null }>,
    baseUrl: string
  ) => void;
  /** Activate a splat source by id, fetching it on demand if not yet downloaded. */
  selectSplatSource: (sourceId: string) => Promise<void>;
  /** Show or hide the splat picker popup. */
  setShowSplatPicker: (show: boolean) => void;
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
  imageNameToUrl: null,
  sourceManifest: null,
  requestedSplatSourceId: null,
  showSplatPicker: false,
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
    if (hasSplatFile && !isActiveSplatFileSwitch) {
      applySplatPointDisplayDefaults();
    } else if (!loadedFilesHaveSplatData(resolvedLoadedFiles)) {
      // Splat-less dataset (not even a lazy/pickable source): undo a leftover splat
      // preset (color mode + shrunken point size/opacity) so the points stay visible.
      // Inverse of applySplatPointDisplayDefaults for the no-splat case; unreachable
      // when a splat file is present (that hits the branch above), and
      // pickable-but-inactive sources still count as having splats.
      restorePointDisplayForSplatlessDataset();
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

  setSourceInfo: (sourceType, sourceUrl = null, imageUrlBase = null, maskUrlBase = null, sourceManifest = null, imageNameToUrl = null) => set({ sourceType, sourceUrl, imageUrlBase, maskUrlBase, sourceManifest, imageNameToUrl }),

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

  mergeRemoteSplatCatalog: (catalog, baseUrl) => {
    const loadedFiles = get().loadedFiles;
    if (!loadedFiles) {
      return;
    }
    set({ loadedFiles: mergeRemoteSplatCatalogIntoLoadedFiles(loadedFiles, catalog, baseUrl) });
    // Splats that weren't auto-loaded (multiple candidates, or a lone one over
    // the auto-load size budget) need an explicit choice; pop up the picker so
    // the user picks one (or stays on COLMAP) as part of finishing the load.
    if (catalog.length >= 1 && !get().loadedFiles?.splatFile) {
      set({ showSplatPicker: true });
    }
  },

  selectSplatSource: async (sourceId) => {
    const loadedFiles = get().loadedFiles;
    if (!loadedFiles) {
      return;
    }
    // Every selection supersedes any in-flight lazy fetch (latest-wins).
    const requestId = ++activeSplatRequestId;
    // Whether a splat was already showing: a fresh activation (COLMAP-only -> splat)
    // switches the viewer into a splat display mode; a tile-to-tile switch keeps the
    // user's current mode.
    const hadSplatBefore = Boolean(loadedFiles.splatFile);

    // Empty selection -> "COLMAP only": unload the active splat. Also clear any
    // in-flight download indicator so a superseded lazy fetch can't leave the
    // loading overlay stuck (there is nothing left to render that would reset it).
    if (!sourceId) {
      set({
        requestedSplatSourceId: null,
        loadedFiles: clearActiveSplatFile(loadedFiles),
        urlLoading: false,
        urlProgress: null,
      });
      return;
    }
    const source = findSplatSourceById(loadedFiles, sourceId);
    if (!source) {
      return;
    }

    // Already downloaded: activate immediately (and offload the previous tile).
    // Clear any download indicator left by a superseded in-flight fetch — this
    // switch is instant, so no "Downloading…" overlay should linger.
    if (source.file) {
      set({
        requestedSplatSourceId: source.id,
        loadedFiles: applyActiveSplatFile(loadedFiles, source.id, source.file),
        urlLoading: false,
        urlProgress: null,
      });
      if (!hadSplatBefore) {
        applySplatActivationVisuals();
      }
      return;
    }

    // Lazy: fetch the tile on demand, then activate. The renderer disposes the
    // previous SplatMesh when splatFile changes, and applyActiveSplatFile drops
    // the previous tile's bytes so memory stays bounded.
    if (!source.url) {
      return;
    }
    const splatName = source.path.split('/').pop() ?? source.path;
    set({ urlLoading: true, urlProgress: getSplatDownloadProgress(splatName, 0, 0) });
    const onDownloadProgress = (loaded: number, total: number) => {
      // Ignore progress from a fetch a newer selection has superseded.
      if (requestId !== activeSplatRequestId) {
        return;
      }
      set({ urlProgress: getSplatDownloadProgress(splatName, loaded, total) });
    };
    try {
      if (shouldActivateSplatSourceByteLess(source)) {
        // Oversized tile on WebGPU-capable touch hardware: keep ONE copy of the
        // bytes (download buffer -> decoder), seed the decode cache under a
        // zero-byte placeholder File, and leave the source file-less so it
        // stays re-fetchable. This avoids the blob+buffer coexistence that
        // caps phones around ~300 MB tiles.
        const { bytes, name } = await fetchRemoteSplatBytes(source.url, onDownloadProgress);
        if (requestId !== activeSplatRequestId) {
          return;
        }
        const {
          getGaussianCloudFormatForFile,
          loadGaussianCloudFromBytes,
          seedGaussianCloudLoad,
        } = await import('../splat/gaussianCloudLoader');
        // Re-check after the dynamic import's await (mirrors the post-fetch and
        // post-decode latest-wins checks): a selection made while the import was
        // resolving supersedes this one, and starting its worker decode anyway
        // would run two 100-416MB decodes at once — the transient double memory
        // this byte-less path exists to avoid on constrained phones. A decode
        // already begun can't be cancelled; the goal is to not START the loser's.
        if (requestId !== activeSplatRequestId) {
          return;
        }
        // FRESH placeholder per attempt: a rejected seeded promise never
        // self-evicts from the decode cache, so a reused placeholder would stay
        // poisoned across retries; a fresh one leaves a failed attempt's seed
        // unreachable (WeakMap-collected).
        const placeholder = new File([], name);
        const format = getGaussianCloudFormatForFile(placeholder);
        const seeded = loadGaussianCloudFromBytes(toArrayBuffer(bytes), format, {})
          // The bytes entry carries a synthetic empty file; rewrite it to the
          // placeholder so the cached result matches its cache key.
          .then((loaded) => ({ ...loaded, file: placeholder }));
        // Seed BEFORE activation so the renderer's first
        // loadGaussianCloudFromFile(placeholder) is a guaranteed cache hit.
        seedGaussianCloudLoad(placeholder, seeded);
        // Advance the overlay to the decode phase before the multi-second worker
        // decode: unlike the byte-retaining path there is no renderer-side file
        // read left to drive progress, so without this the overlay would sit on
        // the last download frame for the whole phone decode.
        set({ urlProgress: getSplatPhaseProgress(placeholder, 'decodingFile') });
        await seeded;
        if (requestId !== activeSplatRequestId) {
          return;
        }
        const latest = get().loadedFiles ?? loadedFiles;
        set({
          requestedSplatSourceId: source.id,
          loadedFiles: applyActiveSplatPlaceholder(latest, source.id, placeholder),
          // Download AND decode are done; unlike the retaining path there is no
          // renderer-side file read left to clear the indicator, so clear it here.
          urlLoading: false,
          urlProgress: null,
        });
        if (!hadSplatBefore) {
          applySplatActivationVisuals();
        }
        return;
      }
      const file = await fetchRemoteSplatFile(source.url, onDownloadProgress);
      // A newer selection won the race: drop this stale result and leave the
      // winner's state untouched.
      if (requestId !== activeSplatRequestId) {
        return;
      }
      const latest = get().loadedFiles ?? loadedFiles;
      set({
        requestedSplatSourceId: source.id,
        loadedFiles: applyActiveSplatFile(latest, source.id, file),
      });
      if (!hadSplatBefore) {
        applySplatActivationVisuals();
      }
    } catch (err) {
      // Fetch and byte-less decode failures land here alike; a superseded
      // attempt's failure must not clobber the winner's state.
      if (requestId !== activeSplatRequestId) {
        return;
      }
      set({
        urlLoading: false,
        urlProgress: null,
        urlError: {
          type: 'network',
          message: 'Failed to load splat',
          details: err instanceof Error ? err.message : String(err),
          failedFile: source.url,
        },
      });
    }
  },

  setShowSplatPicker: (showSplatPicker) => set({ showSplatPicker }),

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
      imageNameToUrl: null,
      sourceManifest: null,
      requestedSplatSourceId: null,
      showSplatPicker: false,
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

/**
 * Reset the URL-loading UI after the user declines a crash-loop reload so the
 * landing page becomes reachable again. Clears the loading indicator/progress
 * (fixes the permanent status-bar "Loading…") and strips the request from the URL
 * so hasUrlToLoad() — which gates the DropZone landing panels — returns false.
 */
export function abandonUrlAutoLoadRequest(
  win: Pick<Window, 'location' | 'history'> = window
): void {
  clearUrlLoadRequestFromLocation(win);
  const store = useReconstructionStore.getState();
  store.setUrlLoading(false);
  store.setUrlProgress(null);
}

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
