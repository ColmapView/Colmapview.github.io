import { useEffect, useRef, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import { useCameraStore, useReconstructionStore, usePointCloudStore, useUIStore, useTransformStore, useRigStore } from '../store';
import type { CameraViewState } from '../store/types';
import type { Sim3dEuler } from '../types/sim3d';
import type { ColmapManifest } from '../types/manifest';
import { isIdentityEuler } from '../utils/sim3dTransforms';
import { buildShareableFieldsFromRegistry } from '../config/registry';

// Lazy-loaded fflate functions (loaded on first use)
// Using 'any' for the options type to avoid fflate's strict literal types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let deflateSync: ((data: Uint8Array, opts?: any) => Uint8Array) | null = null;
let inflateSync: ((data: Uint8Array) => Uint8Array) | null = null;
let fflateLoaded = false;

async function loadFflate(): Promise<void> {
  if (fflateLoaded) return;
  const fflate = await import('fflate');
  deflateSync = fflate.deflateSync;
  inflateSync = fflate.inflateSync;
  fflateLoaded = true;
}

/**
 * Shareable UI configuration that gets embedded in the URL.
 * Uses the same structure as the stores' persisted state for automatic compatibility.
 */
export interface ShareConfig {
  // Each key matches a store's persisted state - automatically includes all partialize fields
  pointCloud?: Record<string, unknown>;
  ui?: Record<string, unknown>;
  camera?: Record<string, unknown>;
  rig?: Record<string, unknown>;
  transform?: Sim3dEuler;
}

// Debounce time for URL updates (ms)
const URL_UPDATE_DEBOUNCE = 500;

/**
 * Convert Uint8Array to Base64URL string (URL-safe, no padding)
 */
function toBase64Url(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Convert Base64URL string to Uint8Array
 */
function fromBase64Url(str: string): Uint8Array | null {
  try {
    // Restore standard Base64: - → +, _ → /
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if needed
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Shareable fields are auto-derived from the config registry.
 * Fields with `persist: true` in the registry are automatically included in URL sharing.
 * To add a new shareable field, add it to the corresponding registry definition file
 * in src/config/registry/definitions/ with `persist: true`.
 */
const SHAREABLE_FIELDS = buildShareableFieldsFromRegistry();

/**
 * Extract shareable fields from a store state object using explicit include list
 */
function extractShareableFields(
  state: Record<string, unknown>,
  allowedFields: Set<string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    if (!allowedFields.has(key)) continue;
    if (typeof value === 'function') continue;
    // Handle Infinity (JSON doesn't support it)
    if (value === Infinity) continue;
    result[key] = value;
  }
  return result;
}

/**
 * Collect current shareable config from all stores.
 * Uses explicit field lists to ensure only visual state is shared.
 */
export function collectShareConfig(): ShareConfig {
  const config: ShareConfig = {};

  // Point cloud store
  const pointCloudState = extractShareableFields(
    usePointCloudStore.getState() as unknown as Record<string, unknown>,
    SHAREABLE_FIELDS.pointCloud
  );
  if (Object.keys(pointCloudState).length > 0) {
    config.pointCloud = pointCloudState;
  }

  // UI store
  const uiState = extractShareableFields(
    useUIStore.getState() as unknown as Record<string, unknown>,
    SHAREABLE_FIELDS.ui
  );
  if (Object.keys(uiState).length > 0) {
    config.ui = uiState;
  }

  // Camera store
  const cameraState = extractShareableFields(
    useCameraStore.getState() as unknown as Record<string, unknown>,
    SHAREABLE_FIELDS.camera
  );
  // Include selectedImageId in URL shares (transient — not persisted to localStorage)
  const { selectedImageId } = useCameraStore.getState();
  if (selectedImageId !== null) {
    cameraState.selectedImageId = selectedImageId;
  }
  if (Object.keys(cameraState).length > 0) {
    config.camera = cameraState;
  }

  // Rig store
  const rigState = extractShareableFields(
    useRigStore.getState() as unknown as Record<string, unknown>,
    SHAREABLE_FIELDS.rig
  );
  if (Object.keys(rigState).length > 0) {
    config.rig = rigState;
  }

  // Transform store - only include if non-identity
  const transformStore = useTransformStore.getState();
  if (!isIdentityEuler(transformStore.transform)) {
    config.transform = transformStore.transform;
  }

  return config;
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
 * Encode camera state to binary (72 bytes: 9 Float64 values)
 * Quaternion is normalized to qw >= 0, qw derived on decode from unit length
 */
function encodeCameraStateBinary(state: CameraViewState): Uint8Array {
  const buffer = new ArrayBuffer(72);
  const view = new DataView(buffer);

  const [px, py, pz] = state.position;
  const [tx, ty, tz] = state.target;
  const [origQx, origQy, origQz, qw] = state.quaternion;

  // Normalize quaternion to have qw >= 0 (q and -q represent the same rotation)
  const qx = qw < 0 ? -origQx : origQx;
  const qy = qw < 0 ? -origQy : origQy;
  const qz = qw < 0 ? -origQz : origQz;

  view.setFloat64(0, px, true);  // little-endian
  view.setFloat64(8, py, true);
  view.setFloat64(16, pz, true);
  view.setFloat64(24, tx, true);
  view.setFloat64(32, ty, true);
  view.setFloat64(40, tz, true);
  view.setFloat64(48, qx, true);
  view.setFloat64(56, qy, true);
  view.setFloat64(64, qz, true);

  return new Uint8Array(buffer);
}

/**
 * Encode camera state to URL hash string (legacy format for camera-only)
 */
function encodeCameraState(state: CameraViewState): string {
  return `c=${toBase64Url(encodeCameraStateBinary(state))}`;
}

/**
 * Encode combined share data (manifest URL or inline manifest + optional camera state + optional config) into a single blob
 * Format: d=<Base64URL([flags:1][url_or_manifest_length:2][url_or_manifest_bytes][camera:72 if bit0][config_length:2 + config_json if bit1])>
 * Flags: bit 0 = has camera, bit 1 = has config, bit 2 = inline manifest (instead of URL), bit 3 = compressed
 * When bit 3 is set, the entire payload (after flags byte) is DEFLATE compressed
 */
function encodeShareData(
  manifestUrlOrManifest: string | ColmapManifest,
  viewState: CameraViewState | null,
  config?: ShareConfig | null
): string {
  const isInlineManifest = typeof manifestUrlOrManifest !== 'string';
  const dataString = isInlineManifest
    ? JSON.stringify(manifestUrlOrManifest)
    : manifestUrlOrManifest;
  const dataBytes = new TextEncoder().encode(dataString);
  const dataLength = dataBytes.length;

  const hasCamera = viewState !== null;
  const hasConfig = config !== null && config !== undefined;

  // Encode config as JSON if present
  const configBytes = hasConfig ? new TextEncoder().encode(JSON.stringify(config)) : null;
  const configLength = configBytes?.length ?? 0;

  // Build the uncompressed payload (without flags byte)
  // 2 bytes data length + data bytes + optional 72 bytes camera + optional (2 bytes config length + config bytes)
  const payloadLength = 2 + dataLength + (hasCamera ? 72 : 0) + (hasConfig ? 2 + configLength : 0);

  const payloadBuffer = new ArrayBuffer(payloadLength);
  const payloadView = new DataView(payloadBuffer);
  const payloadBytes = new Uint8Array(payloadBuffer);

  let offset = 0;

  // Write data length (2 bytes, little-endian)
  payloadView.setUint16(offset, dataLength, true);
  offset += 2;

  // Write data bytes (URL or manifest JSON)
  payloadBytes.set(dataBytes, offset);
  offset += dataLength;

  // Write camera state if present (72 bytes)
  if (hasCamera && viewState) {
    const cameraBytes = encodeCameraStateBinary(viewState);
    payloadBytes.set(cameraBytes, offset);
    offset += 72;
  }

  // Write config if present
  if (hasConfig && configBytes) {
    payloadView.setUint16(offset, configLength, true);
    offset += 2;
    payloadBytes.set(configBytes, offset);
  }

  // Try to compress the payload (if fflate is loaded)
  let finalPayload: Uint8Array;
  let isCompressed = false;

  if (deflateSync) {
    try {
      const compressed = deflateSync(payloadBytes, { level: 9 });
      // Only use compression if it actually reduces size
      if (compressed.length < payloadBytes.length) {
        finalPayload = compressed;
        isCompressed = true;
      } else {
        finalPayload = payloadBytes;
      }
    } catch {
      // Compression failed, use uncompressed
      finalPayload = payloadBytes;
    }
  } else {
    // fflate not loaded yet, use uncompressed
    finalPayload = payloadBytes;
  }

  // Build final result with flags byte
  const result = new Uint8Array(1 + finalPayload.length);
  const flags = (hasCamera ? 1 : 0) | (hasConfig ? 2 : 0) | (isInlineManifest ? 4 : 0) | (isCompressed ? 8 : 0);
  result[0] = flags;
  result.set(finalPayload, 1);

  return `d=${toBase64Url(result)}`;
}

/**
 * Decoded share data structure
 */
export interface DecodedShareData {
  /** Manifest URL (set when loading from URL, null for inline manifest) */
  manifestUrl: string | null;
  /** Inline manifest (set when loading from inline manifest, null for URL) */
  manifest: ColmapManifest | null;
  viewState: CameraViewState | null;
  config: ShareConfig | null;
}

/**
 * Decode combined share data from hash
 * Returns { manifestUrl, manifest, viewState, config } or null if invalid
 * Either manifestUrl or manifest will be set (not both)
 */
export async function decodeShareData(hash: string): Promise<DecodedShareData | null> {
  const hashContent = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(hashContent);

  const data = params.get('d');
  if (!data) return null;

  const bytes = fromBase64Url(data);
  if (!bytes || bytes.length < 3) return null; // Minimum: 1 flag + 2 data length

  // Read flags from first byte
  const flags = bytes[0];
  const hasCamera = (flags & 1) !== 0;
  const hasConfig = (flags & 2) !== 0;
  const isInlineManifest = (flags & 4) !== 0;
  const isCompressed = (flags & 8) !== 0;

  // Get payload (everything after flags byte)
  let payload: Uint8Array = bytes.slice(1);

  // Decompress if needed
  if (isCompressed) {
    // Load fflate if not already loaded
    if (!inflateSync) {
      await loadFflate();
    }
    if (!inflateSync) {
      // Failed to load fflate
      return null;
    }
    try {
      payload = new Uint8Array(inflateSync(payload));
    } catch {
      // Decompression failed
      return null;
    }
  }

  if (payload.length < 2) return null;

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  let offset = 0;

  // Read data length (URL or manifest JSON)
  const dataLength = view.getUint16(offset, true);
  offset += 2;

  if (payload.length < offset + dataLength) return null;

  // Decode URL or manifest JSON
  const dataBytes = payload.slice(offset, offset + dataLength);
  const dataString = new TextDecoder().decode(dataBytes);
  offset += dataLength;

  let manifestUrl: string | null = null;
  let manifest: ColmapManifest | null = null;

  if (isInlineManifest) {
    // Inline manifest - parse JSON
    try {
      manifest = JSON.parse(dataString) as ColmapManifest;
    } catch {
      // Invalid JSON, return null
      return null;
    }
  } else {
    // URL format
    manifestUrl = dataString;
  }

  // Decode camera state if present
  let viewState: CameraViewState | null = null;
  if (hasCamera) {
    if (payload.length < offset + 72) return null;
    const cameraBytes = payload.slice(offset, offset + 72);
    viewState = decodeCameraFromBytes(cameraBytes);
    offset += 72;
  }

  // Decode config if present
  let config: ShareConfig | null = null;
  if (hasConfig) {
    if (payload.length < offset + 2) return null;
    const configLength = view.getUint16(offset, true);
    offset += 2;

    if (payload.length < offset + configLength) return null;
    const configBytes = payload.slice(offset, offset + configLength);
    try {
      config = JSON.parse(new TextDecoder().decode(configBytes));
    } catch {
      // Invalid JSON, ignore config
    }
  }

  return { manifestUrl, manifest, viewState, config };
}

/**
 * Decode camera state from raw bytes (72 bytes)
 */
function decodeCameraFromBytes(bytes: Uint8Array): CameraViewState | null {
  if (bytes.length !== 72) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const px = view.getFloat64(0, true);
  const py = view.getFloat64(8, true);
  const pz = view.getFloat64(16, true);
  const tx = view.getFloat64(24, true);
  const ty = view.getFloat64(32, true);
  const tz = view.getFloat64(40, true);
  const qx = view.getFloat64(48, true);
  const qy = view.getFloat64(56, true);
  const qz = view.getFloat64(64, true);

  // Derive qw from unit quaternion constraint: |q| = 1
  const qwSquared = 1 - qx * qx - qy * qy - qz * qz;
  if (qwSquared < 0) return null;
  const qw = Math.sqrt(qwSquared);

  return {
    position: [px, py, pz],
    target: [tx, ty, tz],
    quaternion: [qx, qy, qz, qw],
    distance: Math.sqrt(
      (px - tx) * (px - tx) +
      (py - ty) * (py - ty) +
      (pz - tz) * (pz - tz)
    ),
  };
}

/**
 * Decode camera state from Base64URL binary format (legacy c=... format)
 */
function decodeCameraStateBinary(data: string): CameraViewState | null {
  const bytes = fromBase64Url(data);
  if (!bytes || bytes.length !== 72) return null;
  return decodeCameraFromBytes(bytes);
}

/**
 * Decode camera state from legacy text format (for backwards compatibility)
 * Format: camera=px,py,pz,tx,ty,tz,qx,qy,qz,qw
 */
function decodeCameraStateLegacy(data: string): CameraViewState | null {
  const values = data.split(',').map(v => parseFloat(v));
  if (values.length !== 10 || values.some(isNaN)) return null;

  const [px, py, pz, tx, ty, tz, qx, qy, qz, qw] = values;

  // Validate quaternion (should be approximately unit length)
  const quatLength = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);
  if (quatLength < 0.9 || quatLength > 1.1) return null;

  return {
    position: [px, py, pz],
    target: [tx, ty, tz],
    quaternion: [qx, qy, qz, qw],
    distance: Math.sqrt(
      (px - tx) * (px - tx) +
      (py - ty) * (py - ty) +
      (pz - tz) * (pz - tz)
    ),
  };
}

/**
 * Decode camera state from URL hash string
 * Supports: combined format (d=...), binary format (c=...), legacy text format (camera=...)
 */
export async function decodeCameraState(hash: string): Promise<CameraViewState | null> {
  // Remove leading # if present
  const hashContent = hash.startsWith('#') ? hash.slice(1) : hash;

  const params = new URLSearchParams(hashContent);

  // Try combined format first (d=...)
  const combinedParam = params.get('d');
  if (combinedParam) {
    const shareData = await decodeShareData(hash);
    return shareData?.viewState ?? null;
  }

  // Try binary camera-only format (c=...)
  const binaryParam = params.get('c');
  if (binaryParam) {
    return decodeCameraStateBinary(binaryParam);
  }

  // Fall back to legacy text format (camera=...)
  const legacyParam = params.get('camera');
  if (legacyParam) {
    return decodeCameraStateLegacy(legacyParam);
  }

  return null;
}

/**
 * Get current camera view state from R3F controls.
 * Exported for use in ShareButton and other components.
 */
export function getControlsViewState(controls: unknown): CameraViewState | null {
  if (!controls || typeof controls !== 'object') return null;
  const ctrl = controls as { getCurrentViewState?: () => CameraViewState };
  if (typeof ctrl.getCurrentViewState !== 'function') return null;
  return ctrl.getCurrentViewState();
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

      // Skip update if state hasn't changed significantly
      if (encoded === lastEncodedState.current) return;
      lastEncodedState.current = encoded;

      // Preserve existing URL search params
      const url = new URL(window.location.href);
      url.hash = encoded;

      // Use replaceState to avoid cluttering browser history
      window.history.replaceState(null, '', url.toString());
    }, URL_UPDATE_DEBOUNCE);
  }, [controls]);

  /**
   * Restore camera state from URL hash
   */
  const restoreFromHash = useCallback(async () => {
    const hash = window.location.hash;
    if (!hash) return false;

    const state = await decodeCameraState(hash);
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
        console.log('[URL State] Restored camera state from URL hash');
      }
    });
  }, [reconstruction, restoreFromHash]);

  // Handle browser back/forward (popstate)
  useEffect(() => {
    const handlePopState = async () => {
      const state = await decodeCameraState(window.location.hash);
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
  // Use versioned URL for production site (colmapview.github.io)
  // This ensures shared links are stable and don't break when new versions are released
  const isProductionSite = window.location.hostname === 'colmapview.github.io';
  const baseUrl = isProductionSite
    ? `https://colmapview.github.io/v${__APP_VERSION__}/`
    : window.location.origin + window.location.pathname;
  const url = new URL(baseUrl);

  if (manifestUrlOrManifest) {
    // Use combined format: everything in hash, no query params
    // Collect current config if not provided
    const shareConfig = config !== undefined ? config : collectShareConfig();
    url.hash = encodeShareData(manifestUrlOrManifest, viewState, shareConfig);
    return url.toString();
  }

  // No manifest URL/manifest - use camera-only format if view state present
  if (viewState) {
    url.hash = encodeCameraState(viewState);
  }

  return url.toString();
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
  // Start with the shareable URL
  const shareableUrl = generateShareableUrl(manifestUrlOrManifest, viewState, config);
  const url = new URL(shareableUrl);

  // Add embed=1 query parameter
  url.searchParams.set('embed', '1');

  return url.toString();
}

/**
 * Generate an iframe HTML snippet for embedding.
 */
export function generateIframeHtml(embedUrl: string): string {
  return `<iframe src="${embedUrl}" width="100%" height="600" frameborder="0" allowfullscreen></iframe>`;
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

/** Duration for "copied" feedback state in milliseconds */
const COPY_FEEDBACK_DURATION = 2000;

/**
 * Copy text to clipboard and trigger feedback state.
 * Helper that encapsulates the common copy-with-feedback pattern.
 */
export async function copyWithFeedback(
  text: string,
  setCopied: (copied: boolean) => void
): Promise<void> {
  const success = await copyToClipboard(text);
  if (success) {
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION);
  }
}
