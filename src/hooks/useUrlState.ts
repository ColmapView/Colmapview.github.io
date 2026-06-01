import { useEffect, useRef, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import { useCameraStore, useReconstructionStore, usePointCloudStore, useUIStore, useTransformStore, useRigStore } from '../store';
import type { CameraViewState } from '../store/types';
import type { ColmapManifest } from '../types/manifest';
import { buildShareableFieldsFromRegistry } from '../config/registry';
import type { ShareConfig } from '../utils/shareDataCodec';
import { buildShareConfigFromStoreStates } from './urlStateShareConfigPolicy';
import { encodeCameraState } from '../utils/urlCameraStateCodec';
import {
  buildEmbedUrl,
  buildShareableUrl,
  getShareBaseUrl,
} from '../utils/shareUrl';
import { appLogger } from '../utils/logger';
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
  return buildShareConfigFromStoreStates(
    {
      pointCloud: usePointCloudStore.getState(),
      ui: useUIStore.getState(),
      camera: useCameraStore.getState(),
      rig: useRigStore.getState(),
      transform: useTransformStore.getState().transform,
    },
    SHAREABLE_FIELDS
  );
}

/**
 * Apply share config to all stores.
 * Automatically applies all fields using setState.
 */
export function applyShareConfig(config: ShareConfig): void {
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
