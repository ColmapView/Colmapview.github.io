import type { CSSProperties } from 'react';
import type { Reconstruction } from '../../types/colmap';
import type { PointPickingMode } from '../../store';
import type { BoundingBox } from '../../wasm/types';
import { getImageWorldPosition } from '../../utils/colmapTransforms';
import { median, percentile } from '../../utils/mathUtils';

export interface SceneBounds {
  center: [number, number, number];
  radius: number;
}

export interface SceneWasmBoundsSource {
  hasPoints: () => boolean;
  getBoundingBox: () => BoundingBox | null;
}

export interface ScenePointerPosition {
  x: number;
  y: number;
}

export type SceneLayerKey =
  | 'points'
  | 'cameras'
  | 'matches'
  | 'rigs'
  | 'axes'
  | 'grid'
  | 'gizmo';

export type SceneLayerVisibility = Record<SceneLayerKey, boolean>;

export type SceneContextMenuAction =
  | 'open-context-menu'
  | 'clear-marker-right-click'
  | 'remove-last-selected-point'
  | 'reset-point-picking';

interface SceneContextMenuActionOptions {
  pickingMode: PointPickingMode;
  selectedPointsLength: number;
  markerRightClickHandled: boolean;
}

interface SceneLayerVisibilityOptions {
  isAlignmentMode: boolean;
  hasReconstruction: boolean;
  camerasVisible: boolean;
  axesVisible: boolean;
  gridVisible: boolean;
  gizmoVisible: boolean;
  isIdle: boolean;
  showAutoHideEditor: boolean;
  autoHideElements: Record<SceneLayerKey, boolean>;
}

export const DEFAULT_SCENE_BOUNDS: SceneBounds = {
  center: [0, 0, 0],
  radius: 5,
};

export const SCENE_CONTEXT_MENU_DRAG_THRESHOLD = 5;
export const DEFAULT_SCENE_BACKGROUND_COLOR = 'var(--ds-secondary)';

export function buildSceneBounds(
  reconstruction: Reconstruction | null,
  wasmReconstruction?: SceneWasmBoundsSource | null
): SceneBounds {
  if (!reconstruction) {
    return DEFAULT_SCENE_BOUNDS;
  }

  const images = Array.from(reconstruction.images.values());

  if (images.length > 0) {
    return buildCameraPositionBounds(images.map(getImageWorldPosition));
  }

  const wasmBounds = buildWasmPointBounds(wasmReconstruction);
  if (wasmBounds) {
    return wasmBounds;
  }

  return buildPointMapBounds(reconstruction) ?? DEFAULT_SCENE_BOUNDS;
}

export function getInitialSceneCameraPosition(
  reconstruction: Reconstruction | null,
  wasmReconstruction?: SceneWasmBoundsSource | null
): [number, number, number] {
  const wasmBounds = getWasmBoundingBox(wasmReconstruction);
  if (wasmBounds) {
    const maxDist = Math.max(
      Math.abs(wasmBounds.minX), Math.abs(wasmBounds.maxX),
      Math.abs(wasmBounds.minY), Math.abs(wasmBounds.maxY),
      Math.abs(wasmBounds.minZ), Math.abs(wasmBounds.maxZ)
    );
    return [0, 0, maxDist * 2];
  }

  if (!reconstruction?.points3D || reconstruction.points3D.size === 0) {
    return [0, 0, 5];
  }

  let maxDist = 0;
  for (const point of reconstruction.points3D.values()) {
    const dist = Math.sqrt(
      point.xyz[0] ** 2 + point.xyz[1] ** 2 + point.xyz[2] ** 2
    );
    maxDist = Math.max(maxDist, dist);
  }

  return [0, 0, maxDist * 2];
}

export function hasSceneContextMenuDragMoved(
  mouseDownPosition: ScenePointerPosition | null,
  currentPosition: ScenePointerPosition,
  threshold = SCENE_CONTEXT_MENU_DRAG_THRESHOLD
): boolean {
  if (!mouseDownPosition) return false;

  return (
    Math.abs(currentPosition.x - mouseDownPosition.x) > threshold ||
    Math.abs(currentPosition.y - mouseDownPosition.y) > threshold
  );
}

export function getSceneContextMenuAction({
  pickingMode,
  selectedPointsLength,
  markerRightClickHandled,
}: SceneContextMenuActionOptions): SceneContextMenuAction {
  if (pickingMode === 'off') {
    return 'open-context-menu';
  }

  if (markerRightClickHandled) {
    return 'clear-marker-right-click';
  }

  if (selectedPointsLength > 0) {
    return 'remove-last-selected-point';
  }

  return 'reset-point-picking';
}

export function shouldDeselectCanvasPointerMiss(
  button: number,
  frustumTapRecent: boolean
): boolean {
  return (button === 0 || button === 2) && !frustumTapRecent;
}

export function shouldHideSceneAutoHideElement(
  isIdle: boolean,
  showAutoHideEditor: boolean,
  autoHideEnabled: boolean
): boolean {
  return (isIdle || showAutoHideEditor) && autoHideEnabled;
}

export function getSceneContainerStyle(backgroundColor: string): CSSProperties {
  return {
    backgroundColor,
  };
}

export function getSceneErrorContainerStyle(backgroundColor?: string): CSSProperties {
  return {
    backgroundColor: backgroundColor ?? DEFAULT_SCENE_BACKGROUND_COLOR,
  };
}

export function getSceneLayerVisibility({
  isAlignmentMode,
  hasReconstruction,
  camerasVisible,
  axesVisible,
  gridVisible,
  gizmoVisible,
  isIdle,
  showAutoHideEditor,
  autoHideElements,
}: SceneLayerVisibilityOptions): SceneLayerVisibility {
  const shouldHide = (key: SceneLayerKey) => (
    shouldHideSceneAutoHideElement(isIdle, showAutoHideEditor, autoHideElements[key])
  );

  return {
    points: !shouldHide('points'),
    cameras: !isAlignmentMode && camerasVisible && !shouldHide('cameras'),
    matches: !isAlignmentMode && camerasVisible && !shouldHide('matches'),
    rigs: !isAlignmentMode && camerasVisible && !shouldHide('rigs'),
    axes: (axesVisible || isAlignmentMode) && !shouldHide('axes'),
    grid: gridVisible && !shouldHide('grid'),
    gizmo: !isAlignmentMode && hasReconstruction && gizmoVisible && !shouldHide('gizmo'),
  };
}

function buildCameraPositionBounds(positions: Array<{ x: number; y: number; z: number }>): SceneBounds {
  const xCoords: number[] = [];
  const yCoords: number[] = [];
  const zCoords: number[] = [];

  for (const pos of positions) {
    xCoords.push(pos.x);
    yCoords.push(pos.y);
    zCoords.push(pos.z);
  }

  const center: [number, number, number] = [
    median(xCoords),
    median(yCoords),
    median(zCoords),
  ];

  const sortedX = [...xCoords].sort((a, b) => a - b);
  const sortedY = [...yCoords].sort((a, b) => a - b);
  const sortedZ = [...zCoords].sort((a, b) => a - b);

  const rangeX = percentile(sortedX, 95) - percentile(sortedX, 5);
  const rangeY = percentile(sortedY, 95) - percentile(sortedY, 5);
  const rangeZ = percentile(sortedZ, 95) - percentile(sortedZ, 5);
  const radius = Math.max(rangeX, rangeY, rangeZ, 0.001) / 2;

  return { center, radius };
}

function buildWasmPointBounds(wasmReconstruction: SceneWasmBoundsSource | null | undefined): SceneBounds | null {
  const bbox = getWasmBoundingBox(wasmReconstruction);
  if (!bbox) return null;

  const center: [number, number, number] = [
    (bbox.minX + bbox.maxX) / 2,
    (bbox.minY + bbox.maxY) / 2,
    (bbox.minZ + bbox.maxZ) / 2,
  ];
  const radius = Math.max(
    bbox.maxX - bbox.minX,
    bbox.maxY - bbox.minY,
    bbox.maxZ - bbox.minZ
  ) / 2;
  return { center, radius: Math.max(radius, 0.001) };
}

function getWasmBoundingBox(wasmReconstruction: SceneWasmBoundsSource | null | undefined): BoundingBox | null {
  if (!wasmReconstruction?.hasPoints()) return null;
  return wasmReconstruction.getBoundingBox();
}

function buildPointMapBounds(reconstruction: Reconstruction): SceneBounds | null {
  if (!reconstruction.points3D || reconstruction.points3D.size === 0) {
    return null;
  }

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (const point of reconstruction.points3D.values()) {
    minX = Math.min(minX, point.xyz[0]);
    maxX = Math.max(maxX, point.xyz[0]);
    minY = Math.min(minY, point.xyz[1]);
    maxY = Math.max(maxY, point.xyz[1]);
    minZ = Math.min(minZ, point.xyz[2]);
    maxZ = Math.max(maxZ, point.xyz[2]);
  }

  const center: [number, number, number] = [
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2,
  ];
  const radius = Math.max(maxX - minX, maxY - minY, maxZ - minZ) / 2;

  return { center, radius };
}
