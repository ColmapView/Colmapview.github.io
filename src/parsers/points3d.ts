import { BinaryReader } from './BinaryReader';
import type { Point3D, TrackElement } from '../types/colmap';
import {
  parseColmapBigIntToken,
  parseColmapIntegerToken,
  parseColmapNumberToken,
  parseColmapNumberTokens,
} from './colmapTextTokens';

/**
 * Parse points3D.bin binary file
 *
 * Format:
 * - uint64: num_points
 * - Per point:
 *   - uint64: point3D_id
 *   - double[3]: xyz
 *   - uint8[3]: rgb
 *   - double: error (reprojection error in pixels)
 *   - uint64: track_length
 *   - Per track element:
 *     - uint32: image_id
 *     - uint32: point2D_idx
 */
export function parsePoints3DBinary(buffer: ArrayBuffer): Map<bigint, Point3D> {
  const reader = new BinaryReader(buffer);
  const points = new Map<bigint, Point3D>();

  const numPoints = reader.readUint64AsNumber();

  for (let i = 0; i < numPoints; i++) {
    const point3DId = reader.readUint64();

    const xyz: [number, number, number] = [
      reader.readFloat64(),
      reader.readFloat64(),
      reader.readFloat64(),
    ];

    const rgb: [number, number, number] = [
      reader.readUint8(),
      reader.readUint8(),
      reader.readUint8(),
    ];

    const error = reader.readFloat64();
    const trackLength = reader.readUint64AsNumber();

    const track: TrackElement[] = [];
    for (let j = 0; j < trackLength; j++) {
      track.push({
        imageId: reader.readUint32(),
        point2DIdx: reader.readUint32(),
      });
    }

    points.set(point3DId, { point3DId, xyz, rgb, error, track });
  }

  return points;
}

/**
 * Parse points3D.txt text file
 *
 * Format:
 * # 3D point list with one line of data per point:
 * #   POINT3D_ID, X, Y, Z, R, G, B, ERROR, TRACK[] as (IMAGE_ID, POINT2D_IDX)
 * # Number of points: N, mean track length: M
 * 63390 1.67241 0.292931 0.609726 115 121 122 1.33927 16 6542 15 7345 6 6714 14 7227
 */
export function parsePoints3DText(text: string): Map<bigint, Point3D> {
  const points = new Map<bigint, Point3D>();
  const lines = text.split('\n');

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.startsWith('#') || line.trim() === '') continue;

    const parts = line.trim().split(/\s+/);
    if (parts.length < 8) continue;

    const point3DId = parseColmapBigIntToken(parts[0]);
    const xyzValues = parseColmapNumberTokens(parts.slice(1, 4));
    const red = parseColmapIntegerToken(parts[4], { min: 0, max: 255 });
    const green = parseColmapIntegerToken(parts[5], { min: 0, max: 255 });
    const blue = parseColmapIntegerToken(parts[6], { min: 0, max: 255 });
    const error = parseColmapNumberToken(parts[7]);

    if (
      point3DId === null ||
      xyzValues === null ||
      red === null ||
      green === null ||
      blue === null ||
      error === null
    ) {
      continue;
    }

    const xyz: [number, number, number] = [
      xyzValues[0],
      xyzValues[1],
      xyzValues[2],
    ];
    const rgb: [number, number, number] = [
      red,
      green,
      blue,
    ];

    // Parse track elements (pairs of IMAGE_ID, POINT2D_IDX)
    const track: TrackElement[] = [];
    for (let i = 8; i + 1 < parts.length; i += 2) {
      const imageId = parseColmapIntegerToken(parts[i], { min: 0 });
      const point2DIdx = parseColmapIntegerToken(parts[i + 1], { min: 0 });

      if (imageId === null || point2DIdx === null) continue;

      track.push({
        imageId,
        point2DIdx,
      });
    }

    points.set(point3DId, { point3DId, xyz, rgb, error, track });
  }

  return points;
}
