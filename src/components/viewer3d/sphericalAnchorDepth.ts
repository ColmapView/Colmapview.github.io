/**
 * Depth anchor for the spherical undistorted portal.
 *
 * The (U) portal disk samples the panorama through the CAPTURE CENTER C, so its
 * imagery aligns exactly only with content AT the disk's plane depth. We anchor
 * that depth at L* = the median Euclidean distance from C to the 3D points the
 * selected image OBSERVES, computed in GROUP space (the same space as
 * `frustum.position` and the raw reconstruction point positions). Points near L*
 * then overlay the imagery from any viewpoint instead of drifting as the user
 * orbits. See sphericalUndistortion.ts for the full derivation and error model.
 *
 * We deliberately use the median RADIAL (Euclidean) distance as the single planar
 * anchor: it is robust to outliers and is the depth that minimises the dominant
 * baseline·|1/L − 1/L*| overlay error across the observed points. A second-order
 * plane-vs-shell term (∝ cosφ for points off the viewer axis) is inherent to
 * pinning a spherical ray field onto one flat plane and is left as residual.
 *
 * Access pattern mirrors computeSelectedPointOverlay / the point-cloud fast path:
 * the observed ids come from `reconstruction.imageToPoint3DIds`, and positions
 * come from the WASM flat arrays (getPoint3DIds()/getPositions()), with the
 * on-demand points3D Map as the JS-fallback source. A single linear scan over the
 * point set gathers the observed distances (memoised per selection by the caller,
 * the same cost model as the selected-point overlay); the median then sorts only
 * the O(observations) gathered distances.
 */
import { getPoint3DIdForIndex } from '../../hooks/pointCloud/pointCloudDataPolicy';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** WASM flat-array position source (zero-copy views), index-aligned. */
export interface WasmPointPositions {
  /** Flat point positions [x,y,z, ...] in group space. */
  positions: ArrayLike<number> | null | undefined;
  /** Point ids aligned with `positions`; null => sequential BigInt(i+1). */
  point3DIds: ArrayLike<bigint> | null | undefined;
  /** Number of points. */
  pointCount: number;
}

/** On-demand JS position source (only the xyz is needed here). */
export type PointPositionMap = ReadonlyMap<bigint, { xyz: readonly [number, number, number] }>;

export interface MedianObservedPointDepthParams {
  /**
   * IDs of the 3D points the selected image observes
   * (reconstruction.imageToPoint3DIds.get(imageId)). Empty/null => 0-observed
   * fallback.
   */
  observedPointIds: ReadonlySet<bigint> | null | undefined;
  /** Primary position source: WASM flat arrays. */
  wasm?: WasmPointPositions | null;
  /** Fallback position source when WASM points are unavailable (JS/export path). */
  points3D?: PointPositionMap | null;
  /** Camera center C in GROUP space (same space as the point positions). */
  cameraCenter: Vec3;
  /** Sphere radius; drives the no-points fallback (10r) and the >= 2r clamp. */
  radius: number;
}

/** Median of a numeric array (sorts a copy; input is not mutated). Empty => NaN. */
export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function distanceFrom(px: number, py: number, pz: number, c: Vec3): number {
  return Math.hypot(px - c.x, py - c.y, pz - c.z);
}

function hasWasmPoints(wasm: WasmPointPositions | null | undefined): wasm is WasmPointPositions {
  return !!wasm && !!wasm.positions && wasm.pointCount > 0;
}

/** Distances from the camera center to the points the image observes. */
function collectObservedDistances(params: MedianObservedPointDepthParams): number[] {
  const { observedPointIds, wasm, points3D, cameraCenter } = params;
  const out: number[] = [];
  if (!observedPointIds || observedPointIds.size === 0) return out;

  if (hasWasmPoints(wasm)) {
    const { positions, point3DIds, pointCount } = wasm;
    for (let i = 0; i < pointCount; i++) {
      const id = getPoint3DIdForIndex(point3DIds, i);
      if (!observedPointIds.has(id)) continue;
      out.push(distanceFrom(positions![i * 3], positions![i * 3 + 1], positions![i * 3 + 2], cameraCenter));
    }
    return out;
  }

  if (points3D) {
    for (const id of observedPointIds) {
      const point = points3D.get(id);
      if (!point) continue;
      out.push(distanceFrom(point.xyz[0], point.xyz[1], point.xyz[2], cameraCenter));
    }
  }
  return out;
}

/** Distances from the camera center to ALL points (the 0-observed fallback). */
function collectAllDistances(params: MedianObservedPointDepthParams): number[] {
  const { wasm, points3D, cameraCenter } = params;
  const out: number[] = [];

  if (hasWasmPoints(wasm)) {
    const { positions, pointCount } = wasm;
    for (let i = 0; i < pointCount; i++) {
      out.push(distanceFrom(positions![i * 3], positions![i * 3 + 1], positions![i * 3 + 2], cameraCenter));
    }
    return out;
  }

  if (points3D) {
    for (const point of points3D.values()) {
      out.push(distanceFrom(point.xyz[0], point.xyz[1], point.xyz[2], cameraCenter));
    }
  }
  return out;
}

/**
 * Anchor depth L* for the spherical portal disk.
 *
 * 1. Median distance from `cameraCenter` to the OBSERVED points.
 * 2. If the image observes none, median distance to ALL points.
 * 3. If there are no points at all, 10 x radius.
 * The result is clamped to >= 2 x radius so the disk always sits outside the sphere.
 */
export function computeMedianObservedPointDepth(params: MedianObservedPointDepthParams): number {
  const minDepth = 2 * params.radius;

  const observed = collectObservedDistances(params);
  if (observed.length > 0) return Math.max(median(observed), minDepth);

  const all = collectAllDistances(params);
  if (all.length > 0) return Math.max(median(all), minDepth);

  return Math.max(10 * params.radius, minDepth);
}
