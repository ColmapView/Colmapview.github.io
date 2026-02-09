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

/** A single track entry yielded by the track iterator. */
interface TrackEntry {
  error: number;
  trackImageIds: number[];
  point3DId: Point3DId;
}

/** Return type shared by both public compute functions. */
interface ImageStatsResult {
  imageStats: Map<number, ImageStats>;
  connectedImagesIndex: ConnectedImagesIndex;
  globalStats: GlobalStats;
  imageToPoint3DIds: ImageToPoint3DIdsMap;
}

/**
 * Shared core that computes all stats from an iterable of track entries.
 * Both computeImageStats and computeImageStatsFromWasm delegate to this.
 */
function computeStatsFromTracks(
  images: Map<number, Image>,
  tracks: Iterable<TrackEntry>,
  totalPoints: number,
): ImageStatsResult {
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

  // Single pass through all tracks
  for (const { error, trackImageIds, point3DId } of tracks) {
    const trackLength = trackImageIds.length;
    const hasValidError = error >= 0;

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
    for (const trackImageId of trackImageIds) {
      const stat = internalStats.get(trackImageId);
      if (stat) {
        stat.numPoints3D++;
        if (hasValidError) {
          stat.totalError += error;
          stat.errorCount++;
        }
        // Add all other images in this track as covisible
        for (const otherId of trackImageIds) {
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
 * Computes pre-computed statistics for all images and global reconstruction stats
 * in a single pass through points3D.
 * This is O(P * T) where P = number of 3D points and T = average track length,
 * but only runs once at load time instead of O(n * m * k) on every render.
 */
export function computeImageStats(
  images: Map<number, Image>,
  points3D: Map<bigint, Point3D>
): ImageStatsResult {
  function* iterateTracks(): Generator<TrackEntry> {
    for (const point3D of points3D.values()) {
      yield {
        error: point3D.error,
        trackImageIds: point3D.track.map(t => t.imageId),
        point3DId: point3D.point3DId,
      };
    }
  }

  return computeStatsFromTracks(images, iterateTracks(), points3D.size);
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
): ImageStatsResult {
  // Get WASM arrays
  const pointCount = wasm.pointCount;
  const errors = wasm.getErrors();
  const trackOffsets = wasm.getTrackOffsets();
  const trackImageIdsArr = wasm.getTrackImageIds();
  const point3DIds = wasm.getPoint3DIds();

  function* iterateTracks(): Generator<TrackEntry> {
    if (!trackOffsets || !trackImageIdsArr || !errors) return;

    for (let pointIdx = 0; pointIdx < pointCount; pointIdx++) {
      const trackStart = trackOffsets[pointIdx];
      const trackEnd = trackOffsets[pointIdx + 1];

      // Collect track image IDs for this point
      const trackImageIds: number[] = [];
      for (let j = trackStart; j < trackEnd; j++) {
        trackImageIds.push(trackImageIdsArr[j]);
      }

      yield {
        error: errors[pointIdx],
        trackImageIds,
        point3DId: point3DIds ? point3DIds[pointIdx] : BigInt(pointIdx + 1),
      };
    }
  }

  return computeStatsFromTracks(images, iterateTracks(), pointCount);
}
