import { useEffect, useRef, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import { useCameraStore, useImageMetricsStore, useReconstructionStore, usePointCloudStore, useUIStore, useTransformStore, useRigStore } from '../store';
import type { CameraViewState } from '../store/types';
import type { ColmapManifest } from '../types/manifest';
import { buildShareableFieldsFromRegistry } from '../config/registry';
import type { ShareConfig } from '../utils/shareDataCodec';
import { buildShareConfigFromStoreStates, restoreNullableNumbers } from './urlStateShareConfigPolicy';
import { encodeCameraState } from '../utils/urlCameraStateCodec';
import {
  buildEmbedUrl,
  buildShareableUrl,
  getShareBaseUrl,
} from '../utils/shareUrl';
import { appLogger } from '../utils/logger';
import { findSplatSourceById, getShareActiveSplatSourceId } from '../utils/splatFileSourcePolicy';
import { SHARED_CONFIG_SECTIONS, sanitizeShareConfig, type PublishedViewerState } from '../utils/publishedViewerState';
import { decodeShareData } from '../utils/shareDataCodec';
import { getSplatAutoLoadDecision } from './urlLoaderPolicy';
import { detectTouchDevice } from './useIsTouchDevice';
import { createIdentityEuler } from '../utils/sim3dTransforms';
import { getControlsViewState } from './urlStateControlsPolicy';
import {
  decodeCameraStateFromHash,
  getNextCameraHashUpdate,
  URL_UPDATE_DEBOUNCE_MS,
} from './urlStateHashPolicy';

export { decodeShareData } from '../utils/shareDataCodec';
export { decodeCameraStateFromHash as decodeCameraState } from './urlStateHashPolicy';
export { copyToClipboard, copyWithFeedback } from '../utils/clipboard';
export { generateIframeHtml } from '../utils/shareUrl';
export { getControlsViewState } from './urlStateControlsPolicy';
export type { DecodedShareData, ShareConfig } from '../utils/shareDataCodec';

/**
 * Shareable fields are auto-derived from the config registry.
 * Fields with `persist: true` in the registry are automatically included in URL sharing.
 * To add a new shareable field, add it to the corresponding registry definition file
 * in src/config/registry/definitions/ with `persist: true`.
 */
const SHAREABLE_FIELDS = buildShareableFieldsFromRegistry();

/**
 * Collect current shareable config from all stores.
 * Uses explicit field lists to ensure only visual state is shared.
 */
export function collectShareConfig(): ShareConfig {
  const transformStore = useTransformStore.getState();
  const config = buildShareConfigFromStoreStates(
    {
      pointCloud: usePointCloudStore.getState(),
      ui: useUIStore.getState(),
      camera: useCameraStore.getState(),
      rig: useRigStore.getState(),
      transform: transformStore.transform,
      splatTransform: transformStore.splatTransform,
    },
    SHAREABLE_FIELDS
  );
  const activeSplatSourceId = getShareActiveSplatSourceId(useReconstructionStore.getState().loadedFiles);
  if (activeSplatSourceId !== null) {
    config.splat = { ...config.splat, activeSourceId: activeSplatSourceId };
  }
  return config;
}

/** Settings carried by the viewer URL itself, which take precedence over a dataset's saved state. */
export interface SharedViewerOverrides { config?: ShareConfig; viewState?: CameraViewState | null }

export async function decodeSharedViewerOverrides(hash: string): Promise<SharedViewerOverrides | null> {
  const shared = await decodeShareData(hash);
  const viewState = shared?.viewState ?? await decodeCameraStateFromHash(hash);
  return shared?.config || viewState ? { config: shared?.config ?? undefined, viewState } : null;
}

/**
 * Saved settings explicitly select a lazy remote splat. Desktop restores it at any size;
 * constrained touch devices keep the download prompt.
 */
async function activateSavedSplat(sourceId: string, assertCurrent: () => void): Promise<void> {
  if (sourceId === '') {
    await useReconstructionStore.getState().selectSplatSource('', { restore: true });
    assertCurrent();
    return;
  }
  const source = findSplatSourceById(useReconstructionStore.getState().loadedFiles, sourceId);
  const touch = detectTouchDevice();
  if (!source || (!source.url && !source.file)) return;
  if (!source.file && touch && !getSplatAutoLoadDecision([{ path: source.path, size: source.size ?? 0 }], { isTouchDevice: touch }).autoLoad) return;
  await useReconstructionStore.getState().selectSplatSource(source.id, { restore: true });
  assertCurrent();
}

/**
 * The one place a finished load restores viewer settings: the dataset's saved state first, then the
 * viewer URL's shared settings on top. Without saved state only the URL config applies; useUrlState
 * restores a URL camera itself.
 */
export async function applySavedViewerState(saved: PublishedViewerState | null, shared: SharedViewerOverrides | null,
  assertCurrent: () => void = () => undefined,
  initialSplatSelectionRevision = useReconstructionStore.getState().splatSelectionRevision,
  autoSplatSourceId?: string): Promise<void> {
  const canRestoreSplatSelection = () => useReconstructionStore.getState().splatSelectionRevision === initialSplatSelectionRevision;
  const restorationConfig = (config: ShareConfig): ShareConfig => {
    if (!config.splat) return config;
    // Apply the effective selection once, after merging saved and URL choices.
    const splat = { ...config.splat };
    delete splat.activeSourceId;
    return { ...config, splat };
  };
  const sourceId = shared?.config?.splat?.activeSourceId ?? saved?.config.splat?.activeSourceId ?? autoSplatSourceId;
  assertCurrent();
  if (sourceId !== undefined && canRestoreSplatSelection()) await activateSavedSplat(sourceId, assertCurrent);
  // A choice made before or during activation wins over both saved and URL source selections.
  if (saved) applyShareConfig(restorationConfig(saved.config));
  if (shared?.config) applyShareConfig(restorationConfig(shared.config));
  if (sourceId !== undefined && canRestoreSplatSelection()) {
    useReconstructionStore.getState().setRequestedSplatSourceId(sourceId || null);
    if (sourceId === '' || useReconstructionStore.getState().loadedFiles?.splatFile) {
      useReconstructionStore.getState().setShowSplatPicker(false);
    }
  }
  const view = saved ? shared?.viewState ?? saved.viewState : null;
  if (view) useCameraStore.getState().flyToState(view);
}

/**
 * Apply share config to all stores.
 * Automatically applies all fields using setState.
 */
export function applyShareConfig(input: ShareConfig): void {
  const config = sanitizeShareConfig(input);
  for (const key of SHARED_CONFIG_SECTIONS) {
    const values = config[key];
    if (values) config[key] = restoreNullableNumbers(values);
  }
  if (config.splat?.activeSourceId !== undefined) {
    if (config.splat.activeSourceId === '') {
      void useReconstructionStore.getState().selectSplatSource('', { restore: true });
      useReconstructionStore.getState().setShowSplatPicker(false);
    } else useReconstructionStore.getState().setRequestedSplatSourceId(config.splat.activeSourceId);
    useImageMetricsStore.getState().clearSplatPsnr();
  }
  // Activating a file can reset its alignment; restore saved transforms afterwards.
  if (config.splat?.transform) {
    useTransformStore.getState().setSplatTransform(config.splat.transform);
    useTransformStore.getState().setTransform(config.transform ?? createIdentityEuler());
  }

  // Point cloud store
  if (config.pointCloud) {
    usePointCloudStore.setState(config.pointCloud);
  }

  // UI store
  if (config.ui) {
    useUIStore.setState(config.ui);
  }

  // Camera store
  if (config.camera) {
    useCameraStore.setState(config.camera);
  }

  // Rig store
  if (config.rig) {
    useRigStore.setState(config.rig);
  }

  // Transform store
  if (config.transform) {
    useTransformStore.getState().setTransform(config.transform);
  }
}

/**
 * Hook for bidirectional sync between camera state and URL hash.
 * - Restores camera state from URL hash on mount
 * - Updates URL hash when camera moves (debounced)
 * - Handles browser back/forward navigation
 */
export function useUrlState() {
  const { controls } = useThree();
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const flyToState = useCameraStore((s) => s.flyToState);

  // Track whether we've applied initial state from URL
  const hasAppliedInitialState = useRef(false);
  const updateTimeoutRef = useRef<number | null>(null);
  const lastEncodedState = useRef<string>('');

  /**
   * Update URL hash with current camera state (debounced)
   */
  const updateUrlHash = useCallback(() => {
    if (updateTimeoutRef.current !== null) {
      window.clearTimeout(updateTimeoutRef.current);
    }

    updateTimeoutRef.current = window.setTimeout(() => {
      const viewState = getControlsViewState(controls);
      if (!viewState) return;

      const encoded = encodeCameraState(viewState);
      const hashUpdate = getNextCameraHashUpdate({
        href: window.location.href,
        encodedState: encoded,
        lastEncodedState: lastEncodedState.current,
      });
      if (!hashUpdate) return;

      lastEncodedState.current = hashUpdate.encodedState;
      window.history.replaceState(null, '', hashUpdate.url);
    }, URL_UPDATE_DEBOUNCE_MS);
  }, [controls]);

  /**
   * Restore camera state from URL hash
   */
  const restoreFromHash = useCallback(async () => {
    const hash = window.location.hash;
    if (!hash) return false;

    const state = await decodeCameraStateFromHash(hash);
    if (!state) return false;

    flyToState(state);
    lastEncodedState.current = encodeCameraState(state);
    return true;
  }, [flyToState]);

  // Apply initial state from URL when reconstruction loads
  useEffect(() => {
    if (!reconstruction || hasAppliedInitialState.current) return;

    restoreFromHash().then((applied) => {
      hasAppliedInitialState.current = true;
      if (applied) {
        appLogger.info('[URL State] Restored camera state from URL hash');
      }
    });
  }, [reconstruction, restoreFromHash]);

  // Handle browser back/forward (popstate)
  useEffect(() => {
    const handlePopState = async () => {
      const state = await decodeCameraStateFromHash(window.location.hash);
      if (state) {
        flyToState(state);
        lastEncodedState.current = encodeCameraState(state);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [flyToState]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current !== null) {
        window.clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  return {
    updateUrlHash,
    restoreFromHash,
  };
}

/**
 * Generate a shareable URL with current manifest URL (or inline manifest) and camera state
 * Uses combined format (d=...) when manifest URL or inline manifest is present
 * @param manifestUrlOrManifest - Manifest URL string, ColmapManifest object for inline embedding, or null
 */
// Declare global version constant injected by Vite
declare const __APP_VERSION__: string;

export function generateShareableUrl(
  manifestUrlOrManifest: string | ColmapManifest | null,
  viewState: CameraViewState | null,
  config?: ShareConfig | null
): string {
  const shareConfig = manifestUrlOrManifest && config === undefined ? collectShareConfig() : config;
  return buildShareableUrl({
    baseUrl: getShareBaseUrl(window.location, __APP_VERSION__),
    manifestUrlOrManifest,
    viewState,
    config: shareConfig,
  });
}

/**
 * Generate an embed-friendly URL with ?embed=1 query parameter.
 * The embed parameter is placed before the hash to allow detection on page load.
 * @param manifestUrlOrManifest - Manifest URL string, ColmapManifest object for inline embedding, or null
 */
export function generateEmbedUrl(
  manifestUrlOrManifest: string | ColmapManifest | null,
  viewState: CameraViewState | null,
  config?: ShareConfig | null
): string {
  const shareableUrl = generateShareableUrl(manifestUrlOrManifest, viewState, config);
  return buildEmbedUrl(shareableUrl);
}
