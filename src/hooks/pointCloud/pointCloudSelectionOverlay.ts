import { getPoint3DIdForIndex } from './pointCloudDataPolicy';

export interface SelectedPointOverlayOptions {
  pointCount: number;
  point3DIds: ArrayLike<bigint> | null | undefined;
  positions: Float32Array;
  selectedPointIds: Set<bigint>;
  highlightColor: [number, number, number];
}

export interface SelectedPointOverlayResult {
  selectedPositions: Float32Array | null;
  selectedColors: Float32Array | null;
}

export function computeSelectedPointOverlay({
  pointCount,
  point3DIds,
  positions,
  selectedPointIds,
  highlightColor,
}: SelectedPointOverlayOptions): SelectedPointOverlayResult {
  if (selectedPointIds.size === 0) {
    return { selectedPositions: null, selectedColors: null };
  }

  let highlightCount = 0;
  for (let i = 0; i < pointCount; i++) {
    const point3DId = getPoint3DIdForIndex(point3DIds, i);
    if (selectedPointIds.has(point3DId)) {
      highlightCount++;
    }
  }

  if (highlightCount === 0) {
    return { selectedPositions: null, selectedColors: null };
  }

  const selectedPositions = new Float32Array(highlightCount * 3);
  const selectedColors = new Float32Array(highlightCount * 3);

  let outputIndex = 0;
  for (let i = 0; i < pointCount; i++) {
    const point3DId = getPoint3DIdForIndex(point3DIds, i);
    if (!selectedPointIds.has(point3DId)) {
      continue;
    }

    const sourceIndex = i * 3;
    const targetIndex = outputIndex * 3;
    selectedPositions[targetIndex] = positions[sourceIndex];
    selectedPositions[targetIndex + 1] = positions[sourceIndex + 1];
    selectedPositions[targetIndex + 2] = positions[sourceIndex + 2];
    selectedColors[targetIndex] = highlightColor[0];
    selectedColors[targetIndex + 1] = highlightColor[1];
    selectedColors[targetIndex + 2] = highlightColor[2];
    outputIndex++;
  }

  return { selectedPositions, selectedColors };
}
