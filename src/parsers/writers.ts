/**
 * COLMAP data export functions for text and binary formats.
 *
 * These writers produce files compatible with COLMAP's standard formats,
 * matching the specifications in reconstruction_io_text.cc and reconstruction_io_binary.cc.
 */

import { BinaryWriter } from './BinaryWriter';
import type {
  Camera,
  Image,
  Point3D,
  Reconstruction,
  CameraId,
  ImageId,
  Point3DId,
} from '../types/colmap';
import { CameraModelId, UNMATCHED_POINT3D_ID } from '../types/colmap';

// ============================================================================
// Constants
// ============================================================================

/**
 * COLMAP's invalid point3D ID is UINT64_MAX (std::numeric_limits<uint64_t>::max())
 * The web project uses BigInt(-1) which has the same bit pattern via two's complement.
 * For binary export, we write the unsigned value for COLMAP compatibility.
 */
const COLMAP_INVALID_POINT3D_ID = BigInt('18446744073709551615');

/**
 * Camera model ID to name mapping (inverse of parser's mapping)
 */
const CAMERA_MODEL_NAMES: Record<number, string> = {
  [CameraModelId.SIMPLE_PINHOLE]: 'SIMPLE_PINHOLE',
  [CameraModelId.PINHOLE]: 'PINHOLE',
  [CameraModelId.SIMPLE_RADIAL]: 'SIMPLE_RADIAL',
  [CameraModelId.RADIAL]: 'RADIAL',
  [CameraModelId.OPENCV]: 'OPENCV',
  [CameraModelId.OPENCV_FISHEYE]: 'OPENCV_FISHEYE',
  [CameraModelId.FULL_OPENCV]: 'FULL_OPENCV',
  [CameraModelId.FOV]: 'FOV',
  [CameraModelId.SIMPLE_RADIAL_FISHEYE]: 'SIMPLE_RADIAL_FISHEYE',
  [CameraModelId.RADIAL_FISHEYE]: 'RADIAL_FISHEYE',
  [CameraModelId.THIN_PRISM_FISHEYE]: 'THIN_PRISM_FISHEYE',
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format number with 17 significant digits (matches COLMAP's stream.precision(17))
 */
function formatDouble(value: number): string {
  // Use toPrecision for consistent formatting, trim trailing zeros
  return value.toPrecision(17).replace(/\.?0+$/, '');
}

/**
 * Sort map keys numerically.
 * COLMAP sorts entries by ID before writing (ExtractSortedIds in C++).
 */
function sortedKeys<K extends number | bigint>(map: Map<K, unknown>): K[] {
  return Array.from(map.keys()).sort((a, b) => {
    if (typeof a === 'bigint' && typeof b === 'bigint') {
      return a < b ? -1 : a > b ? 1 : 0;
    }
    return Number(a) - Number(b);
  });
}

/**
 * Convert internal point3D_id to binary format value.
 * UNMATCHED_POINT3D_ID (BigInt(-1)) becomes UINT64_MAX for COLMAP compatibility.
 */
function toBinaryPoint3DId(id: Point3DId): bigint {
  return id === UNMATCHED_POINT3D_ID ? COLMAP_INVALID_POINT3D_ID : id;
}

/**
 * Convert internal point3D_id to text format value.
 * UNMATCHED_POINT3D_ID becomes -1 (COLMAP reads "-1" and converts to kInvalidPoint3DId).
 */
function toTextPoint3DId(id: Point3DId): string {
  return id === UNMATCHED_POINT3D_ID ? '-1' : id.toString();
}

// ============================================================================
// TEXT WRITERS
// ============================================================================

/**
 * Write cameras.txt
 *
 * Format (from COLMAP):
 * # Camera list with one line of data per camera:
 * #   CAMERA_ID, MODEL, WIDTH, HEIGHT, PARAMS[]
 * # Number of cameras: N
 */
export function writeCamerasText(cameras: Map<CameraId, Camera>): string {
  const lines: string[] = [];

  // Header comments (matches COLMAP format exactly)
  lines.push('# Camera list with one line of data per camera:');
  lines.push('#   CAMERA_ID, MODEL, WIDTH, HEIGHT, PARAMS[]');
  lines.push(`# Number of cameras: ${cameras.size}`);

  // Camera entries (sorted by ID)
  for (const cameraId of sortedKeys(cameras)) {
    const cam = cameras.get(cameraId)!;
    const modelName = CAMERA_MODEL_NAMES[cam.modelId] ?? 'UNKNOWN';
    const params = cam.params.map(formatDouble).join(' ');
    lines.push(`${cameraId} ${modelName} ${cam.width} ${cam.height} ${params}`);
  }

  return lines.join('\n') + '\n';
}

/**
 * Write images.txt
 *
 * Format (from COLMAP):
 * # Image list with two lines of data per image:
 * #   IMAGE_ID, QW, QX, QY, QZ, TX, TY, TZ, CAMERA_ID, NAME
 * #   POINTS2D[] as (X, Y, POINT3D_ID)
 * # Number of images: N, mean observations per image: M
 */
export function writeImagesText(images: Map<ImageId, Image>): string {
  const lines: string[] = [];

  // Compute mean observations per image
  let totalObs = 0;
  for (const img of images.values()) {
    totalObs += img.points2D.filter((p) => p.point3DId !== UNMATCHED_POINT3D_ID).length;
  }
  const meanObs = images.size > 0 ? (totalObs / images.size).toFixed(6) : '0';

  // Header comments
  lines.push('# Image list with two lines of data per image:');
  lines.push('#   IMAGE_ID, QW, QX, QY, QZ, TX, TY, TZ, CAMERA_ID, NAME');
  lines.push('#   POINTS2D[] as (X, Y, POINT3D_ID)');
  lines.push(`# Number of images: ${images.size}, mean observations per image: ${meanObs}`);

  // Image entries (sorted by ID)
  for (const imageId of sortedKeys(images)) {
    const img = images.get(imageId)!;

    // Line 1: pose and metadata
    const [qw, qx, qy, qz] = img.qvec;
    const [tx, ty, tz] = img.tvec;
    lines.push(
      [
        imageId,
        formatDouble(qw),
        formatDouble(qx),
        formatDouble(qy),
        formatDouble(qz),
        formatDouble(tx),
        formatDouble(ty),
        formatDouble(tz),
        img.cameraId,
        img.name,
      ].join(' ')
    );

    // Line 2: 2D points (X Y POINT3D_ID triplets)
    const points2DStr = img.points2D
      .map((p) => `${formatDouble(p.xy[0])} ${formatDouble(p.xy[1])} ${toTextPoint3DId(p.point3DId)}`)
      .join(' ');
    lines.push(points2DStr);
  }

  return lines.join('\n') + '\n';
}

/**
 * Write points3D.txt
 *
 * Format (from COLMAP):
 * # 3D point list with one line of data per point:
 * #   POINT3D_ID, X, Y, Z, R, G, B, ERROR, TRACK[] as (IMAGE_ID, POINT2D_IDX)
 * # Number of points: N, mean track length: M
 */
export function writePoints3DText(points3D: Map<Point3DId, Point3D>): string {
  const lines: string[] = [];

  // Compute mean track length
  let totalTrackLen = 0;
  for (const pt of points3D.values()) {
    totalTrackLen += pt.track.length;
  }
  const meanTrackLen = points3D.size > 0 ? (totalTrackLen / points3D.size).toFixed(6) : '0';

  // Header comments
  lines.push('# 3D point list with one line of data per point:');
  lines.push('#   POINT3D_ID, X, Y, Z, R, G, B, ERROR, TRACK[] as (IMAGE_ID, POINT2D_IDX)');
  lines.push(`# Number of points: ${points3D.size}, mean track length: ${meanTrackLen}`);

  // Point entries (sorted by ID)
  for (const point3DId of sortedKeys(points3D)) {
    const pt = points3D.get(point3DId)!;
    const [x, y, z] = pt.xyz;
    const [r, g, b] = pt.rgb;

    // Track as pairs of IMAGE_ID POINT2D_IDX
    const trackStr = pt.track.map((t) => `${t.imageId} ${t.point2DIdx}`).join(' ');

    lines.push(
      [
        point3DId.toString(),
        formatDouble(x),
        formatDouble(y),
        formatDouble(z),
        r,
        g,
        b,
        formatDouble(pt.error),
        trackStr,
      ].join(' ')
    );
  }

  return lines.join('\n') + '\n';
}

// ============================================================================
// BINARY WRITERS
// ============================================================================

/**
 * Write cameras.bin
 *
 * Binary format:
 * - uint64: num_cameras
 * - Per camera:
 *   - uint32: camera_id
 *   - int32: model_id
 *   - uint64: width
 *   - uint64: height
 *   - double[N]: params (N from CAMERA_MODEL_NUM_PARAMS)
 */
export function writeCamerasBinary(cameras: Map<CameraId, Camera>): ArrayBuffer {
  const writer = new BinaryWriter();

  writer.writeUint64FromNumber(cameras.size);

  for (const cameraId of sortedKeys(cameras)) {
    const cam = cameras.get(cameraId)!;
    writer.writeUint32(cameraId);
    writer.writeInt32(cam.modelId);
    writer.writeUint64FromNumber(cam.width);
    writer.writeUint64FromNumber(cam.height);
    for (const param of cam.params) {
      writer.writeFloat64(param);
    }
  }

  return writer.toArrayBuffer();
}

/**
 * Write images.bin
 *
 * Binary format:
 * - uint64: num_images
 * - Per image:
 *   - uint32: image_id
 *   - double[4]: quaternion (qw, qx, qy, qz)
 *   - double[3]: translation (tx, ty, tz)
 *   - uint32: camera_id
 *   - string: name (null-terminated)
 *   - uint64: num_points2D
 *   - Per point2D:
 *     - double: x
 *     - double: y
 *     - uint64: point3D_id (UINT64_MAX if unmatched)
 */
export function writeImagesBinary(images: Map<ImageId, Image>): ArrayBuffer {
  const writer = new BinaryWriter();

  writer.writeUint64FromNumber(images.size);

  for (const imageId of sortedKeys(images)) {
    const img = images.get(imageId)!;

    writer.writeUint32(imageId);

    // Quaternion (qw, qx, qy, qz) - cam_from_world rotation
    writer.writeFloat64(img.qvec[0]);
    writer.writeFloat64(img.qvec[1]);
    writer.writeFloat64(img.qvec[2]);
    writer.writeFloat64(img.qvec[3]);

    // Translation (tx, ty, tz)
    writer.writeFloat64(img.tvec[0]);
    writer.writeFloat64(img.tvec[1]);
    writer.writeFloat64(img.tvec[2]);

    writer.writeUint32(img.cameraId);
    writer.writeString(img.name);

    writer.writeUint64FromNumber(img.points2D.length);
    for (const pt2D of img.points2D) {
      writer.writeFloat64(pt2D.xy[0]);
      writer.writeFloat64(pt2D.xy[1]);
      // Convert to COLMAP's uint64 format (UINT64_MAX for unmatched)
      writer.writeUint64(toBinaryPoint3DId(pt2D.point3DId));
    }
  }

  return writer.toArrayBuffer();
}

/**
 * Write points3D.bin
 *
 * Binary format:
 * - uint64: num_points
 * - Per point:
 *   - uint64: point3D_id
 *   - double[3]: xyz
 *   - uint8[3]: rgb
 *   - double: error
 *   - uint64: track_length
 *   - Per track element:
 *     - uint32: image_id
 *     - uint32: point2D_idx
 */
export function writePoints3DBinary(points3D: Map<Point3DId, Point3D>): ArrayBuffer {
  const writer = new BinaryWriter();

  writer.writeUint64FromNumber(points3D.size);

  for (const point3DId of sortedKeys(points3D)) {
    const pt = points3D.get(point3DId)!;

    writer.writeUint64(point3DId);
    writer.writeFloat64(pt.xyz[0]);
    writer.writeFloat64(pt.xyz[1]);
    writer.writeFloat64(pt.xyz[2]);
    writer.writeUint8(pt.rgb[0]);
    writer.writeUint8(pt.rgb[1]);
    writer.writeUint8(pt.rgb[2]);
    writer.writeFloat64(pt.error);

    writer.writeUint64FromNumber(pt.track.length);
    for (const trackEl of pt.track) {
      writer.writeUint32(trackEl.imageId);
      writer.writeUint32(trackEl.point2DIdx);
    }
  }

  return writer.toArrayBuffer();
}

// ============================================================================
// PLY EXPORT
// ============================================================================

/**
 * Export 3D points as PLY point cloud.
 * PLY is a common format supported by MeshLab, CloudCompare, and other 3D viewers.
 */
export function writePointsPLY(points3D: Map<Point3DId, Point3D>): string {
  const header = [
    'ply',
    'format ascii 1.0',
    `element vertex ${points3D.size}`,
    'property float x',
    'property float y',
    'property float z',
    'property uchar red',
    'property uchar green',
    'property uchar blue',
    'end_header',
  ].join('\n') + '\n';

  const data: string[] = [];
  for (const pt of points3D.values()) {
    data.push(`${pt.xyz[0]} ${pt.xyz[1]} ${pt.xyz[2]} ${pt.rgb[0]} ${pt.rgb[1]} ${pt.rgb[2]}`);
  }

  return header + data.join('\n') + '\n';
}

// ============================================================================
// DOWNLOAD HELPERS
// ============================================================================

/**
 * Download a file in the browser.
 */
export function downloadFile(data: ArrayBuffer | string, filename: string): void {
  const blob =
    typeof data === 'string'
      ? new Blob([data], { type: 'text/plain;charset=utf-8' })
      : new Blob([data], { type: 'application/octet-stream' });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export full reconstruction to COLMAP text format.
 * Downloads three files: cameras.txt, images.txt, points3D.txt
 */
export function exportReconstructionText(reconstruction: Reconstruction): void {
  downloadFile(writeCamerasText(reconstruction.cameras), 'cameras.txt');
  downloadFile(writeImagesText(reconstruction.images), 'images.txt');
  downloadFile(writePoints3DText(reconstruction.points3D), 'points3D.txt');
}

/**
 * Export full reconstruction to COLMAP binary format.
 * Downloads three files: cameras.bin, images.bin, points3D.bin
 */
export function exportReconstructionBinary(reconstruction: Reconstruction): void {
  downloadFile(writeCamerasBinary(reconstruction.cameras), 'cameras.bin');
  downloadFile(writeImagesBinary(reconstruction.images), 'images.bin');
  downloadFile(writePoints3DBinary(reconstruction.points3D), 'points3D.bin');
}

/**
 * Export point cloud as PLY file.
 */
export function exportPointsPLY(reconstruction: Reconstruction): void {
  downloadFile(writePointsPLY(reconstruction.points3D), 'points.ply');
}
