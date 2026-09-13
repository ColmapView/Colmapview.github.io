import { getPoint3DIdForIndex } from './pointCloudDataPolicy';
import type { Point3DIdLookup } from './types';

export interface SelectedPointOverlayOptions {
  pointCount: number;
  point3DIds: ArrayLike<bigint> | null | undefined;
  pointIdLookup?: Point3DIdLookup;
  positions: Float32Array;
  selectedPointIds: ReadonlySet<bigint>;
  highlightColor: [number, number, number];
  includeColors?: boolean;
}

export interface SelectedPointOverlayResult {
  selectedPositions: Float32Array | null;
  selectedColors: Float32Array | null;
}

export function computeSelectedPointOverlay({
  pointCount,
  point3DIds,
  pointIdLookup,
  positions,
  selectedPointIds,
  highlightColor,
  includeColors = true,
}: SelectedPointOverlayOptions): SelectedPointOverlayResult {
  if (selectedPointIds.size === 0) {
    return { selectedPositions: null, selectedColors: null };
  }

  if (pointIdLookup?.findIndex) {
    const indices: number[] = [];
    for (const id of selectedPointIds) {
      const index = pointIdLookup.findIndex(id);
      if (index >= 0 && index < pointCount) indices.push(index);
    }
    if (indices.length === 0) return { selectedPositions: null, selectedColors: null };
    // Preserve geometry order for identical overlay output, independent of Set order.
    indices.sort((a, b) => a - b);
    const selectedPositions = new Float32Array(indices.length * 3);
    const selectedColors = includeColors ? new Float32Array(indices.length * 3) : null;
    for (let i = 0; i < indices.length; i++) {
      const source = indices[i] * 3;
      const target = i * 3;
      selectedPositions[target] = positions[source];
      selectedPositions[target + 1] = positions[source + 1];
      selectedPositions[target + 2] = positions[source + 2];
      selectedColors?.set(highlightColor, target);
    }
    return { selectedPositions, selectedColors };
  }

  // Compact membership views deliberately bound their cached `.has` lookup.
  // The exceptional duplicate-ID scan needs constant-time membership even for
  // large views; this temporary Set is released with this computation.
  const membership = selectedPointIds instanceof Set ? selectedPointIds : new Set(selectedPointIds);
  let highlightCount = 0;
  for (let i = 0; i < pointCount; i++) {
    const point3DId = pointIdLookup ? pointIdLookup.get(i) : getPoint3DIdForIndex(point3DIds, i);
    if (point3DId !== undefined && membership.has(point3DId)) {
      highlightCount++;
    }
  }

  if (highlightCount === 0) {
    return { selectedPositions: null, selectedColors: null };
  }

  const selectedPositions = new Float32Array(highlightCount * 3);
  const selectedColors = includeColors ? new Float32Array(highlightCount * 3) : null;

  let outputIndex = 0;
  for (let i = 0; i < pointCount; i++) {
    const point3DId = pointIdLookup ? pointIdLookup.get(i) : getPoint3DIdForIndex(point3DIds, i);
    if (point3DId === undefined || !membership.has(point3DId)) {
      continue;
    }

    const sourceIndex = i * 3;
    const targetIndex = outputIndex * 3;
    selectedPositions[targetIndex] = positions[sourceIndex];
    selectedPositions[targetIndex + 1] = positions[sourceIndex + 1];
    selectedPositions[targetIndex + 2] = positions[sourceIndex + 2];
    selectedColors?.set(highlightColor, targetIndex);
    outputIndex++;
  }

  return { selectedPositions, selectedColors };
}
