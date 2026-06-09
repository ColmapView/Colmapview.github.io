import type { DeflateOptions } from 'fflate';
import type { CameraViewState } from '../store/types';
import type { ColmapManifest } from '../types/manifest';
import type { Sim3dEuler } from '../types/sim3d';
import { validateColmapManifest } from './manifestValidation';
import {
  decodeCameraFromBytes,
  encodeCameraStateBinary,
  fromBase64Url,
  toBase64Url,
} from './urlCameraStateCodec';

// Lazy-loaded fflate functions. Compression is used only after the module has been loaded.
let deflateSync: ((data: Uint8Array, opts?: DeflateOptions) => Uint8Array) | null = null;
let inflateSync: ((data: Uint8Array) => Uint8Array) | null = null;
let fflateLoaded = false;
const SHARE_DATA_FLAG_CAMERA = 1;
const SHARE_DATA_FLAG_CONFIG = 2;
const SHARE_DATA_FLAG_INLINE_MANIFEST = 4;
const SHARE_DATA_FLAG_COMPRESSED = 8;
const SHARE_DATA_FLAG_WIDE_LENGTHS = 16;
const UINT16_MAX = 0xffff;
type ShareDataLengthBytes = 2 | 4;

export async function loadShareDataCompression(): Promise<void> {
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
  splat?: {
    activeSourceId?: string;
  };
  transform?: Sim3dEuler;
}

/**
 * Decoded share data structure.
 */
export interface DecodedShareData {
  /** Manifest URL (set when loading from URL, null for inline manifest) */
  manifestUrl: string | null;
  /** Inline manifest (set when loading from inline manifest, null for URL) */
  manifest: ColmapManifest | null;
  viewState: CameraViewState | null;
  config: ShareConfig | null;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalConfigRecord(value: unknown): boolean {
  return value === undefined || isObjectRecord(value);
}

function isSim3dEuler(value: unknown): value is Sim3dEuler {
  if (!isObjectRecord(value)) return false;
  return (
    typeof value.scale === 'number' &&
    typeof value.rotationX === 'number' &&
    typeof value.rotationY === 'number' &&
    typeof value.rotationZ === 'number' &&
    typeof value.translationX === 'number' &&
    typeof value.translationY === 'number' &&
    typeof value.translationZ === 'number'
  );
}

function isShareSplatConfig(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isObjectRecord(value)) return false;
  return value.activeSourceId === undefined || typeof value.activeSourceId === 'string';
}

function isShareConfig(value: unknown): value is ShareConfig {
  if (!isObjectRecord(value)) return false;
  return (
    isOptionalConfigRecord(value.pointCloud) &&
    isOptionalConfigRecord(value.ui) &&
    isOptionalConfigRecord(value.camera) &&
    isOptionalConfigRecord(value.rig) &&
    isShareSplatConfig(value.splat) &&
    (value.transform === undefined || isSim3dEuler(value.transform))
  );
}

function getLengthFieldBytes(usesWideLengths: boolean): ShareDataLengthBytes {
  return usesWideLengths ? 4 : 2;
}

function writeShareDataLength(
  view: DataView,
  offset: number,
  value: number,
  lengthFieldBytes: ShareDataLengthBytes
): number {
  if (lengthFieldBytes === 4) {
    view.setUint32(offset, value, true);
  } else {
    view.setUint16(offset, value, true);
  }
  return offset + lengthFieldBytes;
}

function readShareDataLength(
  view: DataView,
  offset: number,
  lengthFieldBytes: ShareDataLengthBytes
): number {
  return lengthFieldBytes === 4
    ? view.getUint32(offset, true)
    : view.getUint16(offset, true);
}

/**
 * Encode combined share data into one hash parameter.
 *
 * Format:
 * d=<Base64URL([flags:1][url_or_manifest_length][url_or_manifest_bytes][camera:72 if bit0][config_length + config_json if bit1])>
 *
 * Flags: bit 0 = has camera, bit 1 = has config, bit 2 = inline manifest, bit 3 = compressed,
 * bit 4 = 32-bit little-endian length fields instead of legacy 16-bit lengths.
 */
export function encodeShareData(
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
  const configBytes = hasConfig ? new TextEncoder().encode(JSON.stringify(config)) : null;
  const configLength = configBytes?.length ?? 0;
  const usesWideLengths = dataLength > UINT16_MAX || configLength > UINT16_MAX;
  const lengthFieldBytes = getLengthFieldBytes(usesWideLengths);

  const payloadLength = lengthFieldBytes + dataLength + (hasCamera ? 72 : 0) + (hasConfig ? lengthFieldBytes + configLength : 0);
  const payloadBuffer = new ArrayBuffer(payloadLength);
  const payloadView = new DataView(payloadBuffer);
  const payloadBytes = new Uint8Array(payloadBuffer);

  let offset = 0;
  offset = writeShareDataLength(payloadView, offset, dataLength, lengthFieldBytes);

  payloadBytes.set(dataBytes, offset);
  offset += dataLength;

  if (hasCamera && viewState) {
    payloadBytes.set(encodeCameraStateBinary(viewState), offset);
    offset += 72;
  }

  if (hasConfig && configBytes) {
    offset = writeShareDataLength(payloadView, offset, configLength, lengthFieldBytes);
    payloadBytes.set(configBytes, offset);
  }

  let finalPayload: Uint8Array = payloadBytes;
  let isCompressed = false;

  if (deflateSync) {
    try {
      const compressed = deflateSync(payloadBytes, { level: 9 });
      if (compressed.length < payloadBytes.length) {
        finalPayload = compressed;
        isCompressed = true;
      }
    } catch {
      finalPayload = payloadBytes;
    }
  }

  const flags =
    (hasCamera ? SHARE_DATA_FLAG_CAMERA : 0) |
    (hasConfig ? SHARE_DATA_FLAG_CONFIG : 0) |
    (isInlineManifest ? SHARE_DATA_FLAG_INLINE_MANIFEST : 0) |
    (isCompressed ? SHARE_DATA_FLAG_COMPRESSED : 0) |
    (usesWideLengths ? SHARE_DATA_FLAG_WIDE_LENGTHS : 0);
  const result = new Uint8Array(1 + finalPayload.length);
  result[0] = flags;
  result.set(finalPayload, 1);

  return `d=${toBase64Url(result)}`;
}

/**
 * Decode combined share data from a hash.
 * Either manifestUrl or manifest will be set, not both.
 */
export async function decodeShareData(hash: string): Promise<DecodedShareData | null> {
  const hashContent = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(hashContent);

  const data = params.get('d');
  if (!data) return null;

  const bytes = fromBase64Url(data);
  if (!bytes || bytes.length < 3) return null;

  const flags = bytes[0];
  const hasCamera = (flags & SHARE_DATA_FLAG_CAMERA) !== 0;
  const hasConfig = (flags & SHARE_DATA_FLAG_CONFIG) !== 0;
  const isInlineManifest = (flags & SHARE_DATA_FLAG_INLINE_MANIFEST) !== 0;
  const isCompressed = (flags & SHARE_DATA_FLAG_COMPRESSED) !== 0;
  const usesWideLengths = (flags & SHARE_DATA_FLAG_WIDE_LENGTHS) !== 0;
  const lengthFieldBytes = getLengthFieldBytes(usesWideLengths);

  let payload: Uint8Array = bytes.slice(1);

  if (isCompressed) {
    if (!inflateSync) {
      await loadShareDataCompression();
    }
    if (!inflateSync) {
      return null;
    }
    try {
      payload = new Uint8Array(inflateSync(payload));
    } catch {
      return null;
    }
  }

  if (payload.length < lengthFieldBytes) return null;

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  let offset = 0;

  const dataLength = readShareDataLength(view, offset, lengthFieldBytes);
  offset += lengthFieldBytes;

  if (payload.length < offset + dataLength) return null;

  const dataBytes = payload.slice(offset, offset + dataLength);
  const dataString = new TextDecoder().decode(dataBytes);
  offset += dataLength;

  let manifestUrl: string | null = null;
  let manifest: ColmapManifest | null = null;

  if (isInlineManifest) {
    try {
      const parsedManifest: unknown = JSON.parse(dataString);
      const result = validateColmapManifest(parsedManifest);
      if (!result.success) return null;
      manifest = result.manifest;
    } catch {
      return null;
    }
  } else {
    manifestUrl = dataString;
  }

  let viewState: CameraViewState | null = null;
  if (hasCamera) {
    if (payload.length < offset + 72) return null;
    viewState = decodeCameraFromBytes(payload.slice(offset, offset + 72));
    offset += 72;
  }

  let config: ShareConfig | null = null;
  if (hasConfig) {
    if (payload.length < offset + lengthFieldBytes) return null;
    const configLength = readShareDataLength(view, offset, lengthFieldBytes);
    offset += lengthFieldBytes;

    if (payload.length < offset + configLength) return null;
    const configBytes = payload.slice(offset, offset + configLength);
    try {
      const parsedConfig: unknown = JSON.parse(new TextDecoder().decode(configBytes));
      if (isShareConfig(parsedConfig)) {
        config = parsedConfig;
      }
    } catch {
      // Keep compatibility with existing links: malformed config does not invalidate data.
    }
  }

  return { manifestUrl, manifest, viewState, config };
}
