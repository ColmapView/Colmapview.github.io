import type { CameraScaleFactor } from '../store/types';

type Point = readonly [number, number, number];

/** Frustum depth as a share of the camera bounding-box diagonal. */
const DIAGONAL_SHARE = 0.03;
/** Frustum depth relative to the median gap between neighbouring cameras. */
const NEIGHBOUR_SHARE = 1.5;
/** Cameras sampled for nearest-neighbour spacing; keeps 10k-image models cheap. */
const SPACING_SAMPLE = 256;

const FACTORS: readonly [CameraScaleFactor, number][] = [
  ['0.01', 0.01],
  ['0.1', 0.1],
  ['1', 1],
  ['10', 10],
  ['100', 100],
];
const SLIDER = { min: 0.05, max: 1, step: 0.05 };

function medianNeighbourSpacing(points: readonly Point[]): number {
  const stride = Math.max(1, Math.floor(points.length / SPACING_SAMPLE));
  const gaps: number[] = [];
  for (let i = 0; i < points.length; i += stride) {
    const [x, y, z] = points[i];
    let nearest = Infinity;
    for (let j = 0; j < points.length; j++) {
      if (j === i) continue;
      const d = Math.hypot(points[j][0] - x, points[j][1] - y, points[j][2] - z);
      if (d > 0 && d < nearest) nearest = d;
    }
    if (Number.isFinite(nearest)) gaps.push(nearest);
  }
  gaps.sort((a, b) => a - b);
  return gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
}

/**
 * Frustum size for a freshly loaded scene. The size is in world units, and
 * reconstructions range from normalized (cameras 0.001 apart) to aerial
 * surveys, so a fixed default can bury the scene or vanish. Returns the
 * factor and slider value closest to the target, or null when the cameras
 * give no scale.
 */
export function getAutoCameraScale(positions: readonly Point[]): { factor: CameraScaleFactor; scale: number } | null {
  const finite = positions.filter((p) => p.every(Number.isFinite));
  if (finite.length < 2) return null;

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of finite) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], p[axis]);
      max[axis] = Math.max(max[axis], p[axis]);
    }
  }
  const diagonal = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  if (!(diagonal > 0)) return null;

  const spacing = medianNeighbourSpacing(finite);
  const target = Math.min(DIAGONAL_SHARE * diagonal, spacing > 0 ? NEIGHBOUR_SHARE * spacing : Infinity);

  const [factor, multiplier] = FACTORS.find(([, value]) => target / value <= SLIDER.max) ?? FACTORS[FACTORS.length - 1];
  const snapped = Math.round(target / multiplier / SLIDER.step) * SLIDER.step;
  const scale = Math.min(SLIDER.max, Math.max(SLIDER.min, Number(snapped.toFixed(2))));
  return { factor, scale };
}
