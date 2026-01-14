import type { Image, Point3D, ImageStats, ConnectedImagesIndex } from '../types/colmap';

interface InternalImageStats {
  numPoints3D: number;
  totalError: number;
  errorCount: number;
  covisibleSet: Set<number>;
}

/**
 * Computes pre-computed statistics for all images in a single pass through points3D.
 * This is O(P * T) where P = number of 3D points and T = average track length,
 * but only runs once at load time instead of O(n * m * k) on every render.
 */
export function computeImageStats(
  images: Map<number, Image>,
  points3D: Map<bigint, Point3D>
): { imageStats: Map<number, ImageStats>; connectedImagesIndex: ConnectedImagesIndex } {
  // Initialize stats for all images
  const internalStats = new Map<number, InternalImageStats>();
  for (const imageId of images.keys()) {
    internalStats.set(imageId, {
      numPoints3D: 0,
      totalError: 0,
      errorCount: 0,
      covisibleSet: new Set<number>(),
    });
  }

  // Initialize connected images index
  const connectedImagesIndex: ConnectedImagesIndex = new Map();
  for (const imageId of images.keys()) {
    connectedImagesIndex.set(imageId, new Map());
  }

  // Single pass through points3D to compute all stats
  for (const point3D of points3D.values()) {
    const trackImageIds = point3D.track.map(t => t.imageId);
    const error = point3D.error;
    const hasValidError = error >= 0;

    // For each image in the track, update its stats
    for (const trackElem of point3D.track) {
      const stat = internalStats.get(trackElem.imageId);
      if (stat) {
        stat.numPoints3D++;
        if (hasValidError) {
          stat.totalError += error;
          stat.errorCount++;
        }
        // Add all other images in this track as covisible
        for (const otherId of trackImageIds) {
          if (otherId !== trackElem.imageId) {
            stat.covisibleSet.add(otherId);
          }
        }
      }
    }

    // Build connected images index (pairwise connections)
    for (let i = 0; i < trackImageIds.length; i++) {
      for (let j = i + 1; j < trackImageIds.length; j++) {
        const id1 = trackImageIds[i];
        const id2 = trackImageIds[j];

        // Increment both directions
        const map1 = connectedImagesIndex.get(id1);
        const map2 = connectedImagesIndex.get(id2);

        if (map1) {
          map1.set(id2, (map1.get(id2) || 0) + 1);
        }
        if (map2) {
          map2.set(id1, (map2.get(id1) || 0) + 1);
        }
      }
    }
  }

  // Convert internal stats to final format
  const imageStats = new Map<number, ImageStats>();
  for (const [imageId, stat] of internalStats) {
    imageStats.set(imageId, {
      numPoints3D: stat.numPoints3D,
      avgError: stat.errorCount > 0 ? stat.totalError / stat.errorCount : 0,
      covisibleCount: stat.covisibleSet.size,
    });
  }

  return { imageStats, connectedImagesIndex };
}
