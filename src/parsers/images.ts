import { BinaryReader } from './BinaryReader';
import { assertDeclaredColmapTextSchema, isPhotometricImagesText } from './photometricColmap';
import type { Image, Point2D } from '../types/colmap';
import {
  parseColmapBigIntToken,
  parseColmapIntegerToken,
  parseColmapNumberToken,
  parseColmapNumberTokens,
} from './colmapTextTokens';

/**
 * Parse images.bin binary file
 *
 * Format:
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
 *     - uint64: point3D_id (-1 if not triangulated)
 *
 * @param buffer - The binary buffer to parse
 * @param skipPoints2D - If true, skip storing 2D point data for memory optimization (lite mode).
 *                       For large datasets (1GB+ images.bin), this reduces memory by ~80-90%.
 */
export function parseImagesBinary(
  buffer: ArrayBuffer,
  skipPoints2D: boolean = false
): Map<number, Image> {
  const reader = new BinaryReader(buffer);
  const images = new Map<number, Image>();

  const numImages = reader.readUint64AsNumber();

  for (let i = 0; i < numImages; i++) {
    const imageId = reader.readUint32();

    // Read quaternion (qw, qx, qy, qz)
    const qvec: [number, number, number, number] = [
      reader.readFloat64(),
      reader.readFloat64(),
      reader.readFloat64(),
      reader.readFloat64(),
    ];

    // Read translation (tx, ty, tz)
    const tvec: [number, number, number] = [
      reader.readFloat64(),
      reader.readFloat64(),
      reader.readFloat64(),
    ];

    const cameraId = reader.readUint32();
    const name = reader.readString();

    const numPoints2D = reader.readUint64AsNumber();
    const points2D: Point2D[] = [];

    if (skipPoints2D) {
      // Skip all points2D data: each point is 8 + 8 + 8 = 24 bytes (x, y, point3D_id)
      reader.skip(numPoints2D * 24);
    } else {
      for (let j = 0; j < numPoints2D; j++) {
        const x = reader.readFloat64();
        const y = reader.readFloat64();
        const point3DId = reader.readInt64(); // signed, -1 means not triangulated

        points2D.push({
          xy: [x, y],
          point3DId: point3DId,
        });
      }
    }

    images.set(imageId, {
      imageId,
      qvec,
      tvec,
      cameraId,
      name,
      points2D,
      numPoints2D, // Always store the count
    });
  }

  return images;
}

/**
 * Parse images.txt text file
 *
 * Format:
 * # Image list with two lines of data per image:
 * #   IMAGE_ID, QW, QX, QY, QZ, TX, TY, TZ, CAMERA_ID, NAME
 * #   POINTS2D[] as (X, Y, POINT3D_ID)
 * # Number of images: N, mean observations per image: M
 * 1 0.851773 0.0165051 0.503764 -0.142941 -0.737434 1.02973 3.74354 1 image001.jpg
 * 2362.39 248.498 58396 1784.7 268.254 59027 1784.7 268.254 -1
 */
function isUnambiguousImageHeader(line: string, photometric: boolean): boolean {
  // Avoid splitting potentially huge, purely numeric observation rows twice.
  if (!/[^\d.eE+\-\s]/.test(line)) return false;
  const parts = line.trim().split(/\s+/);
  if (parts.length < (photometric ? 15 : 10)) return false;
  const cameraOffset = photometric ? 11 : 8;
  if (parseColmapIntegerToken(parts[0], { min: 0 }) === null
    || parseColmapNumberTokens(parts.slice(1, 8)) === null
    || parseColmapIntegerToken(parts[cameraOffset], { min: 0 }) === null) return false;
  // Observation rows contain only numbers. Requiring a nonnumeric name avoids
  // interpreting a long, valid observation row as another image header.
  const name = photometric ? parts.slice(12, -2) : parts.slice(9);
  return name.some(token => parseColmapNumberToken(token) === null);
}

export function parseImagesText(text: string, skipPoints2D = false): Map<number, Image> {
  assertDeclaredColmapTextSchema(text, 'images');
  const images = new Map<number, Image>();
  const photometric = isPhotometricImagesText(text);
  const lines = text.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    // Skip comments and empty lines
    if (line.startsWith('#') || line === '') {
      i++;
      continue;
    }

    // Parse image header line
    const headerParts = line.split(/\s+/);
    if (headerParts.length < (photometric ? 15 : 10)) {
      i++;
      continue;
    }

    const imageId = parseColmapIntegerToken(headerParts[0], { min: 0 });
    const qvecValues = parseColmapNumberTokens(headerParts.slice(1, 5));
    const tvecValues = parseColmapNumberTokens(headerParts.slice(5, 8));
    const cameraId = parseColmapIntegerToken(headerParts[photometric ? 11 : 8], { min: 0 });
    const name = photometric ? headerParts.slice(12, -2).join(' ') : headerParts.slice(9).join(' ');

    if (imageId === null || qvecValues === null || tvecValues === null || cameraId === null) {
      i++;
      continue;
    }

    const qvec: [number, number, number, number] = [
      qvecValues[0],
      qvecValues[1],
      qvecValues[2],
      qvecValues[3],
    ];
    const tvec: [number, number, number] = [
      tvecValues[0],
      tvecValues[1],
      tvecValues[2],
    ];

    // Parse points2D line (next line)
    i++;
    const points2D: Point2D[] = [];
    // Some camera-only exports omit empty observation rows entirely. Preserve
    // the next pose rather than consuming it as an invalid observation row.
    const nextIsHeader = i < lines.length && isUnambiguousImageHeader(lines[i], photometric);

    if (!nextIsHeader && !skipPoints2D && i < lines.length && !lines[i].startsWith('#')) {
      const pointsLine = lines[i].trim();
      if (pointsLine !== '') {
        const pointsParts = pointsLine.split(/\s+/);

        // Points are in triplets: X, Y, POINT3D_ID
        const stride = photometric ? 4 : 3;
        for (let j = 0; j + stride - 1 < pointsParts.length; j += stride) {
          const x = parseColmapNumberToken(pointsParts[j]);
          const y = parseColmapNumberToken(pointsParts[j + 1]);
          const point3DId = parseColmapBigIntToken(pointsParts[j + stride - 1]);

          if (x === null || y === null || point3DId === null) continue;

          points2D.push({
            xy: [x, y],
            point3DId,
          });
        }
      }
    }

    images.set(imageId, {
      imageId,
      qvec,
      tvec,
      cameraId,
      name,
      points2D,
    });

    if (!nextIsHeader) i++;
  }

  return images;
}
