import type { Image } from '../types/colmap';

/** Generic XYZ PLY vertices have no COLMAP IDs or tracks, even when integers happen to coincide. */
export function detachUntrackedCloudObservations(images: ReadonlyMap<number, Image>): number {
  let count = 0;
  for (const image of images.values()) for (const point of image.points2D) {
    if (point.point3DId !== -1n && point.point3DId !== 0xffffffffffffffffn) {
      point.point3DId = -1n; count++;
    }
  }
  return count;
}
