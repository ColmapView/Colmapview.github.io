import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildImage, buildPoint3D, buildReconstruction } from '../../test/builders';
import type { BoundingBox } from '../../wasm/types';
import {
  buildSceneBounds,
  DEFAULT_SCENE_BOUNDS,
  DEFAULT_SCENE_BACKGROUND_COLOR,
  getSceneContainerStyle,
  getSceneErrorContainerStyle,
  getSceneLayerVisibility,
  getSceneContextMenuAction,
  getSceneTransformGroupMatrix,
  getInitialSceneCameraPosition,
  hasSceneContextMenuDragMoved,
  shouldDeselectCanvasPointerMiss,
  shouldHideSceneAutoHideElement,
  type SceneLayerKey,
  type SceneWasmBoundsSource,
} from './scene3dViewModel';

function buildWasmBounds(bbox: BoundingBox | null): SceneWasmBoundsSource {
  return {
    hasPoints: vi.fn(() => bbox !== null),
    getBoundingBox: vi.fn(() => bbox),
  };
}

function buildAutoHideElements(enabledKeys: SceneLayerKey[] = []): Record<SceneLayerKey, boolean> {
  const enabled = new Set(enabledKeys);
  return {
    points: enabled.has('points'),
    cameras: enabled.has('cameras'),
    matches: enabled.has('matches'),
    rigs: enabled.has('rigs'),
    axes: enabled.has('axes'),
    grid: enabled.has('grid'),
    gizmo: enabled.has('gizmo'),
  };
}

describe('scene 3d view-model helpers', () => {
  it('uses default bounds when no reconstruction is loaded', () => {
    expect(buildSceneBounds(null)).toBe(DEFAULT_SCENE_BOUNDS);
    expect(getInitialSceneCameraPosition(null)).toEqual([0, 0, 5]);
  });

  it('builds robust scene bounds from camera world positions before point bounds', () => {
    const reconstruction = buildReconstruction({
      images: [
        buildImage({ imageId: 1, tvec: [0, 0, 0] }),
        buildImage({ imageId: 2, tvec: [-10, 0, 0] }),
        buildImage({ imageId: 3, tvec: [-20, 0, 0] }),
      ],
      points3D: [
        buildPoint3D({ point3DId: 1n, xyz: [-100, -100, -100] }),
        buildPoint3D({ point3DId: 2n, xyz: [100, 100, 100] }),
      ],
    });

    expect(buildSceneBounds(reconstruction, buildWasmBounds({
      minX: -50, minY: -50, minZ: -50, maxX: 50, maxY: 50, maxZ: 50,
    }))).toEqual({
      center: [10, 0, 0],
      radius: 9,
    });
  });

  it('uses WASM point bounds when there are no camera images', () => {
    const reconstruction = buildReconstruction({ images: [] });

    expect(buildSceneBounds(reconstruction, buildWasmBounds({
      minX: -2, minY: -4, minZ: 1, maxX: 6, maxY: 2, maxZ: 3,
    }))).toEqual({
      center: [2, -1, 2],
      radius: 4,
    });
  });

  it('uses JS point-map bounds when WASM bounds are unavailable', () => {
    const reconstruction = buildReconstruction({
      images: [],
      points3D: [
        buildPoint3D({ point3DId: 1n, xyz: [-2, -6, 1] }),
        buildPoint3D({ point3DId: 2n, xyz: [4, 2, 5] }),
      ],
    });

    expect(buildSceneBounds(reconstruction, buildWasmBounds(null))).toEqual({
      center: [1, -2, 3],
      radius: 4,
    });
  });

  it('derives initial camera position from WASM bounds first, then point-map distance', () => {
    const reconstruction = buildReconstruction({
      points3D: [
        buildPoint3D({ point3DId: 1n, xyz: [3, 4, 0] }),
        buildPoint3D({ point3DId: 2n, xyz: [0, 0, 2] }),
      ],
    });

    expect(getInitialSceneCameraPosition(reconstruction, buildWasmBounds({
      minX: -3, minY: -1, minZ: -2, maxX: 2, maxY: 4, maxZ: 1,
    }))).toEqual([0, 0, 8]);
    expect(getInitialSceneCameraPosition(reconstruction, buildWasmBounds(null))).toEqual([0, 0, 10]);
  });

  it('detects right-click drags only after the context menu movement threshold', () => {
    expect(hasSceneContextMenuDragMoved(null, { x: 20, y: 20 })).toBe(false);
    expect(hasSceneContextMenuDragMoved({ x: 10, y: 10 }, { x: 15, y: 15 })).toBe(false);
    expect(hasSceneContextMenuDragMoved({ x: 10, y: 10 }, { x: 16, y: 10 })).toBe(true);
    expect(hasSceneContextMenuDragMoved({ x: 10, y: 10 }, { x: 10, y: 16 })).toBe(true);
  });

  it('chooses scene context menu actions from point-picking state', () => {
    expect(getSceneContextMenuAction({
      pickingMode: 'off',
      selectedPointsLength: 2,
      markerRightClickHandled: true,
    })).toBe('open-context-menu');

    expect(getSceneContextMenuAction({
      pickingMode: 'distance-2pt',
      selectedPointsLength: 2,
      markerRightClickHandled: true,
    })).toBe('clear-marker-right-click');

    expect(getSceneContextMenuAction({
      pickingMode: 'distance-2pt',
      selectedPointsLength: 2,
      markerRightClickHandled: false,
    })).toBe('remove-last-selected-point');

    expect(getSceneContextMenuAction({
      pickingMode: 'normal-3pt',
      selectedPointsLength: 0,
      markerRightClickHandled: false,
    })).toBe('reset-point-picking');
  });

  it('deselects canvas misses only for empty left or right clicks without a recent frustum tap', () => {
    expect(shouldDeselectCanvasPointerMiss(0, false)).toBe(true);
    expect(shouldDeselectCanvasPointerMiss(2, false)).toBe(true);
    expect(shouldDeselectCanvasPointerMiss(1, false)).toBe(false);
    expect(shouldDeselectCanvasPointerMiss(0, true)).toBe(false);
    expect(shouldDeselectCanvasPointerMiss(2, true)).toBe(false);
  });

  it('hides auto-hide elements only when preview or idle state is active and the element opted in', () => {
    expect(shouldHideSceneAutoHideElement(true, false, true)).toBe(true);
    expect(shouldHideSceneAutoHideElement(false, true, true)).toBe(true);
    expect(shouldHideSceneAutoHideElement(false, false, true)).toBe(false);
    expect(shouldHideSceneAutoHideElement(true, true, false)).toBe(false);
  });

  it('builds the scene container background style', () => {
    expect(getSceneContainerStyle('#101820')).toEqual({
      backgroundColor: '#101820',
    });
  });

  it('builds the scene error background style with a design-token fallback', () => {
    expect(getSceneErrorContainerStyle('#ffffff')).toEqual({
      backgroundColor: '#ffffff',
    });
    expect(getSceneErrorContainerStyle()).toEqual({
      backgroundColor: DEFAULT_SCENE_BACKGROUND_COLOR,
    });
  });

  it('builds scene layer visibility from node state and auto-hide settings', () => {
    expect(getSceneLayerVisibility({
      isAlignmentMode: false,
      hasReconstruction: true,
      camerasVisible: true,
      axesVisible: true,
      gridVisible: true,
      gizmoVisible: true,
      isIdle: false,
      showAutoHideEditor: false,
      autoHideElements: buildAutoHideElements(),
    })).toEqual({
      points: true,
      cameras: true,
      matches: true,
      rigs: true,
      axes: true,
      grid: true,
      gizmo: true,
    });

    expect(getSceneLayerVisibility({
      isAlignmentMode: false,
      hasReconstruction: true,
      camerasVisible: true,
      axesVisible: true,
      gridVisible: true,
      gizmoVisible: true,
      isIdle: true,
      showAutoHideEditor: false,
      autoHideElements: buildAutoHideElements(['points', 'matches', 'grid']),
    })).toMatchObject({
      points: false,
      cameras: true,
      matches: false,
      rigs: true,
      axes: true,
      grid: false,
      gizmo: true,
    });
  });

  it('keeps alignment mode focused on points and orientation references', () => {
    expect(getSceneLayerVisibility({
      isAlignmentMode: true,
      hasReconstruction: true,
      camerasVisible: true,
      axesVisible: false,
      gridVisible: true,
      gizmoVisible: true,
      isIdle: false,
      showAutoHideEditor: false,
      autoHideElements: buildAutoHideElements(),
    })).toEqual({
      points: true,
      cameras: false,
      matches: false,
      rigs: false,
      axes: true,
      grid: true,
      gizmo: false,
    });
  });

  it('requires reconstruction and visible node state for gizmo, axes, grid, and camera layers', () => {
    expect(getSceneLayerVisibility({
      isAlignmentMode: false,
      hasReconstruction: false,
      camerasVisible: false,
      axesVisible: false,
      gridVisible: false,
      gizmoVisible: true,
      isIdle: false,
      showAutoHideEditor: true,
      autoHideElements: buildAutoHideElements(['gizmo', 'axes']),
    })).toEqual({
      points: true,
      cameras: false,
      matches: false,
      rigs: false,
      axes: false,
      grid: false,
      gizmo: false,
    });
  });
});

describe('scene transform group matrix', () => {
  it('passes a real transform matrix through by reference', () => {
    const matrix = new THREE.Matrix4().makeTranslation(1, 2, 3);
    expect(getSceneTransformGroupMatrix(matrix)).toBe(matrix);
  });

  it('falls back to identity so the group renders unconditionally', () => {
    // The group must ALWAYS wrap the transformable content: conditionally
    // adding it on the first non-identity transform remounts the whole
    // point/frustum/splat subtree mid-session (GPU re-upload spike while
    // e.g. a PSNR run is in flight).
    const fallback = getSceneTransformGroupMatrix(null);
    expect(fallback.equals(new THREE.Matrix4())).toBe(true);
  });
});
