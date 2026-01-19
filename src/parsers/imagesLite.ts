import { BinaryReader } from './BinaryReader';
import type { Image } from '../types/colmap';

/**
 * Memory-optimized parser for images.bin that skips storing 2D point data.
 *
 * For large datasets (1GB+ images.bin), the standard parser can cause OOM
 * because it creates millions of Point2D objects. This lite version:
 * - Stores only numPoints2D count instead of the full array
 * - Skips xy coordinates entirely
 * - Uses empty points2D array (features that need it will need refactoring)
 *
 * Memory savings: ~80-90% reduction for images data
 */
export function parseImagesBinaryLite(buffer: ArrayBuffer): Map<number, Image> {
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

    // Skip all points2D data: each point is 8 + 8 + 8 = 24 bytes (x, y, point3D_id)
    reader.skip(numPoints2D * 24);

    images.set(imageId, {
      imageId,
      qvec,
      tvec,
      cameraId,
      name,
      points2D: [], // Empty - use imageToPoint3DIds from computeImageStats instead
      // Store count for display purposes
      _numPoints2D: numPoints2D,
    } as Image & { _numPoints2D: number });
  }

  return images;
}

