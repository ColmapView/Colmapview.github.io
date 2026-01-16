import type { Image, Point3D, ImageStats, ConnectedImagesIndex, GlobalStats } from '../types/colmap';

interface InternalImageStats {
  numPoints3D: number;
  totalError: number;
  errorCount: number;
  covisibleSet: Set<number>;
}

/**
 * Computes pre-computed statistics for all images and global reconstruction stats
 * in a single pass through points3D.
 * This is O(P * T) where P = number of 3D points and T = average track length,
 * but only runs once at load time instead of O(n * m * k) on every render.
 */
export function computeImageStats(
  images: Map<number, Image>,
  points3D: Map<bigint, Point3D>
): { imageStats: Map<number, ImageStats>; connectedImagesIndex: ConnectedImagesIndex; globalStats: GlobalStats } {
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

  // Initialize global stats accumulators
  let globalTotalError = 0;
  let globalErrorCount = 0;
  let globalTotalObservations = 0;
  let globalMinError = Infinity;
  let globalMaxError = -Infinity;
  let globalMinTrack = Infinity;
  let globalMaxTrack = -Infinity;

  // Single pass through points3D to compute all stats
  for (const point3D of points3D.values()) {
    const trackImageIds = point3D.track.map(t => t.imageId);
    const error = point3D.error;
    const hasValidError = error >= 0;
    const trackLength = point3D.track.length;

    // Update global stats
    globalTotalObservations += trackLength;
    if (trackLength < globalMinTrack) globalMinTrack = trackLength;
    if (trackLength > globalMaxTrack) globalMaxTrack = trackLength;
    if (hasValidError) {
      globalTotalError += error;
      globalErrorCount++;
      if (error < globalMinError) globalMinError = error;
      if (error > globalMaxError) globalMaxError = error;
    }

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

  // Build global stats object
  const totalPoints = points3D.size;
  const globalStats: GlobalStats = {
    minError: globalErrorCount > 0 ? globalMinError : 0,
    maxError: globalErrorCount > 0 ? globalMaxError : 0,
    avgError: globalErrorCount > 0 ? globalTotalError / globalErrorCount : 0,
    minTrackLength: totalPoints > 0 ? globalMinTrack : 0,
    maxTrackLength: totalPoints > 0 ? globalMaxTrack : 0,
    avgTrackLength: totalPoints > 0 ? globalTotalObservations / totalPoints : 0,
    totalObservations: globalTotalObservations,
    totalPoints,
  };

  return { imageStats, connectedImagesIndex, globalStats };
}
