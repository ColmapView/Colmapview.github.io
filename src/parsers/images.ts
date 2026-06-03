import { BinaryReader } from './BinaryReader';
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
export function parseImagesText(text: string): Map<number, Image> {
  const images = new Map<number, Image>();
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
    if (headerParts.length < 10) {
      i++;
      continue;
    }

    const imageId = parseColmapIntegerToken(headerParts[0], { min: 0 });
    const qvecValues = parseColmapNumberTokens(headerParts.slice(1, 5));
    const tvecValues = parseColmapNumberTokens(headerParts.slice(5, 8));
    const cameraId = parseColmapIntegerToken(headerParts[8], { min: 0 });
    const name = headerParts[9];

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

    if (i < lines.length && !lines[i].startsWith('#')) {
      const pointsLine = lines[i].trim();
      if (pointsLine !== '') {
        const pointsParts = pointsLine.split(/\s+/);

        // Points are in triplets: X, Y, POINT3D_ID
        for (let j = 0; j + 2 < pointsParts.length; j += 3) {
          const x = parseColmapNumberToken(pointsParts[j]);
          const y = parseColmapNumberToken(pointsParts[j + 1]);
          const point3DId = parseColmapBigIntToken(pointsParts[j + 2]);

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

    i++;
  }

  return images;
}
