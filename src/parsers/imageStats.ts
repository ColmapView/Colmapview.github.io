import type { Image, Point3D, ImageStats, ConnectedImagesIndex, GlobalStats, Point3DId, ImageId } from '../types/colmap';
import type { WasmReconstructionWrapper } from '../wasm/reconstruction';

interface InternalImageStats {
  numPoints3D: number;
  totalError: number;
  errorCount: number;
  covisibleSet: Set<number>;
}

/**
 * Maps each image to the set of 3D point IDs it observes.
 * Computed from points3D tracks, used for highlighting when points2D is not available.
 */
export type ImageToPoint3DIdsMap = Map<ImageId, Set<Point3DId>>;

/**
 * Computes pre-computed statistics for all images and global reconstruction stats
 * in a single pass through points3D.
 * This is O(P * T) where P = number of 3D points and T = average track length,
 * but only runs once at load time instead of O(n * m * k) on every render.
 */
export function computeImageStats(
  images: Map<number, Image>,
  points3D: Map<bigint, Point3D>
): {
  imageStats: Map<number, ImageStats>;
  connectedImagesIndex: ConnectedImagesIndex;
  globalStats: GlobalStats;
  imageToPoint3DIds: ImageToPoint3DIdsMap;
} {
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

  // Initialize image to point3D IDs mapping (for highlighting without points2D)
  const imageToPoint3DIds: ImageToPoint3DIdsMap = new Map();
  for (const imageId of images.keys()) {
    imageToPoint3DIds.set(imageId, new Set());
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

      // Build reverse mapping: imageId -> set of point3D IDs it observes
      const point3DSet = imageToPoint3DIds.get(trackElem.imageId);
      if (point3DSet) {
        point3DSet.add(point3D.point3DId);
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

  return { imageStats, connectedImagesIndex, globalStats, imageToPoint3DIds };
}

/**
 * Computes image statistics from WASM CSR track data instead of points3D Map.
 * This avoids building the expensive points3D Map in JS memory.
 *
 * Uses the same algorithm as computeImageStats but reads from WASM typed arrays.
 */
export function computeImageStatsFromWasm(
  images: Map<number, Image>,
  wasm: WasmReconstructionWrapper
): {
  imageStats: Map<number, ImageStats>;
  connectedImagesIndex: ConnectedImagesIndex;
  globalStats: GlobalStats;
  imageToPoint3DIds: ImageToPoint3DIdsMap;
} {
  // Get WASM arrays
  const pointCount = wasm.pointCount;
  const errors = wasm.getErrors();
  const trackOffsets = wasm.getTrackOffsets();
  const trackImageIds = wasm.getTrackImageIds();
  const point3DIds = wasm.getPoint3DIds();

  // Initialize stats for all images
  interface InternalImageStats {
    numPoints3D: number;
    totalError: number;
    errorCount: number;
    covisibleSet: Set<number>;
  }

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

  // Initialize image to point3D IDs mapping (for highlighting without points2D)
  const imageToPoint3DIds: ImageToPoint3DIdsMap = new Map();
  for (const imageId of images.keys()) {
    imageToPoint3DIds.set(imageId, new Set());
  }

  // Initialize global stats accumulators
  let globalTotalError = 0;
  let globalErrorCount = 0;
  let globalTotalObservations = 0;
  let globalMinError = Infinity;
  let globalMaxError = -Infinity;
  let globalMinTrack = Infinity;
  let globalMaxTrack = -Infinity;

  // Process each point using WASM CSR data
  if (trackOffsets && trackImageIds && errors) {
    for (let pointIdx = 0; pointIdx < pointCount; pointIdx++) {
      const trackStart = trackOffsets[pointIdx];
      const trackEnd = trackOffsets[pointIdx + 1];
      const trackLength = trackEnd - trackStart;

      const error = errors[pointIdx];
      const hasValidError = error >= 0;

      // Get point3D ID for reverse mapping
      const point3DId = point3DIds ? point3DIds[pointIdx] : BigInt(pointIdx + 1);

      // Collect track image IDs for this point
      const trackImageIdList: number[] = [];
      for (let j = trackStart; j < trackEnd; j++) {
        trackImageIdList.push(trackImageIds[j]);
      }

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
      for (const trackImageId of trackImageIdList) {
        const stat = internalStats.get(trackImageId);
        if (stat) {
          stat.numPoints3D++;
          if (hasValidError) {
            stat.totalError += error;
            stat.errorCount++;
          }
          // Add all other images in this track as covisible
          for (const otherId of trackImageIdList) {
            if (otherId !== trackImageId) {
              stat.covisibleSet.add(otherId);
            }
          }
        }

        // Build reverse mapping: imageId -> set of point3D IDs it observes
        const point3DSet = imageToPoint3DIds.get(trackImageId);
        if (point3DSet) {
          point3DSet.add(point3DId);
        }
      }

      // Build connected images index (pairwise connections)
      for (let i = 0; i < trackImageIdList.length; i++) {
        for (let j = i + 1; j < trackImageIdList.length; j++) {
          const id1 = trackImageIdList[i];
          const id2 = trackImageIdList[j];

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
  const totalPoints = pointCount;
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

  return { imageStats, connectedImagesIndex, globalStats, imageToPoint3DIds };
}
