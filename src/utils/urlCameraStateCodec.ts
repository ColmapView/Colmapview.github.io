import type { CameraViewState } from '../store/types';
import { parseFiniteNumberString } from './numberParsing';

/**
 * Convert Uint8Array to Base64URL string (URL-safe, no padding).
 */
export function toBase64Url(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
  }
  const base64 = btoa(chunks.join(''));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Convert Base64URL string to Uint8Array.
 */
export function fromBase64Url(str: string): Uint8Array | null {
  try {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
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
 * Encode camera state to binary (72 bytes: 9 Float64 values).
 * Quaternion is normalized to qw >= 0, with qw derived on decode from unit length.
 */
export function encodeCameraStateBinary(state: CameraViewState): Uint8Array {
  const buffer = new ArrayBuffer(72);
  const view = new DataView(buffer);

  const [px, py, pz] = state.position;
  const [tx, ty, tz] = state.target;
  const [origQx, origQy, origQz, qw] = state.quaternion;

  const qx = qw < 0 ? -origQx : origQx;
  const qy = qw < 0 ? -origQy : origQy;
  const qz = qw < 0 ? -origQz : origQz;

  view.setFloat64(0, px, true);
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
 * Encode camera state to URL hash string.
 */
export function encodeCameraState(state: CameraViewState): string {
  return `c=${toBase64Url(encodeCameraStateBinary(state))}`;
}

/**
 * Decode camera state from raw bytes (72 bytes).
 */
export function decodeCameraFromBytes(bytes: Uint8Array): CameraViewState | null {
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
 * Decode camera state from Base64URL binary format.
 */
export function decodeCameraStateBinary(data: string): CameraViewState | null {
  const bytes = fromBase64Url(data);
  if (!bytes || bytes.length !== 72) return null;
  return decodeCameraFromBytes(bytes);
}

/**
 * Decode camera state from legacy text format.
 * Format: camera=px,py,pz,tx,ty,tz,qx,qy,qz,qw
 */
export function decodeCameraStateLegacy(data: string): CameraViewState | null {
  const values = data.split(',').map(v => parseFiniteNumberString(v));
  if (values.length !== 10 || values.some(value => value === null)) return null;

  const [px, py, pz, tx, ty, tz, qx, qy, qz, qw] = values as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];

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
