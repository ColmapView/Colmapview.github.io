import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { TOUCH } from '../../theme';
import { buildTouch, buildTouchEvent } from '../../test/builders';
import {
  handleTrackballTouchEnd,
  handleTrackballTouchMove,
  handleTrackballTouchStart,
  type TrackballTouchHandlersOptions,
} from './trackballTouchHandlers';

function ref<T>(current: T) {
  return { current };
}

function createAnimationTarget(): NonNullable<TrackballTouchHandlersOptions['animationTargetRef']['current']> {
  return {
    startPosition: new THREE.Vector3(),
    startQuaternion: new THREE.Quaternion(),
    startTarget: new THREE.Vector3(),
    startDistance: 1,
    endPosition: new THREE.Vector3(),
    endQuaternion: new THREE.Quaternion(),
    endTarget: new THREE.Vector3(),
    endDistance: 2,
    startTime: 0,
    duration: 100,
  };
}

function createOptions(overrides: Partial<TrackballTouchHandlersOptions> = {}): TrackballTouchHandlersOptions {
  return {
    canvas: document.createElement('canvas'),
    camera: new THREE.PerspectiveCamera(),
    cameraMode: 'orbit',
    flySpeed: 2,
    radius: 10,
    touchMode: true,
    rotateSpeed: 0.5,
    panSpeed: 0.1,
    applyRotation: vi.fn(),
    updateCamera: vi.fn(),
    isDraggingRef: ref(false),
    isPanningRef: ref(false),
    targetVecRef: ref(new THREE.Vector3()),
    cameraQuatRef: ref(new THREE.Quaternion()),
    distanceRef: ref(10),
    targetDistanceRef: ref(10),
    orthoZoomRef: ref(2),
    angularVelocityRef: ref({ x: 5, y: -3 }),
    smoothedVelocityRef: ref({ x: 2, y: -1 }),
    lastMouseRef: ref({ x: 0, y: 0 }),
    lastTimeRef: ref(0),
    animationTargetRef: ref(createAnimationTarget()),
    touchPointersRef: ref(new Map()),
    touchGestureRef: ref('none'),
    initialPinchDistanceRef: ref(0),
    initialPinchZoomRef: ref(0),
    lastTouchCenterRef: ref({ x: 0, y: 0 }),
    lastDoubleTapTimeRef: ref(0),
    lastTapPositionRef: ref({ x: 999, y: 999 }),
    dragStartPositionRef: ref({ x: 0, y: 0 }),
    hasDragThresholdPassedRef: ref(false),
    enabledRef: ref(true),
    draggingRef: ref(false),
    navActions: {
      clearNavigationHistory: vi.fn(),
    },
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('trackball touch handler policy', () => {
  it('starts a drag gesture and clears active fly animation', () => {
    vi.spyOn(performance, 'now').mockReturnValue(100);
    const options = createOptions();
    const resetView = vi.fn();

    handleTrackballTouchStart({
      event: buildTouchEvent({ type: 'touchstart', changedTouches: [buildTouch({ identifier: 1, clientX: 10, clientY: 15 })] }),
      resetView,
      ...options,
    });

    expect(resetView).not.toHaveBeenCalled();
    expect(options.touchPointersRef.current.get(1)).toMatchObject({ x: 10, y: 15, startX: 10, startY: 15 });
    expect(options.touchGestureRef.current).toBe('drag');
    expect(options.isDraggingRef.current).toBe(true);
    expect(options.draggingRef.current).toBe(true);
    expect(options.hasDragThresholdPassedRef.current).toBe(false);
    expect(options.angularVelocityRef.current).toEqual({ x: 0, y: 0 });
    expect(options.smoothedVelocityRef.current).toEqual({ x: 0, y: 0 });
    expect(options.dragStartPositionRef.current).toEqual({ x: 10, y: 15 });
    expect(options.lastMouseRef.current).toEqual({ x: 10, y: 15 });
    expect(options.lastTimeRef.current).toBe(100);
    expect(options.animationTargetRef.current).toBeNull();
  });

  it('resets the view and clears tap state on double tap', () => {
    vi.spyOn(performance, 'now').mockReturnValue(120);
    const options = createOptions({
      lastDoubleTapTimeRef: ref(100),
      lastTapPositionRef: ref({ x: 10, y: 10 }),
    });
    const resetView = vi.fn();

    handleTrackballTouchStart({
      event: buildTouchEvent({ type: 'touchstart', changedTouches: [buildTouch({ identifier: 1, clientX: 12, clientY: 11 })] }),
      resetView,
      ...options,
    });

    expect(resetView).toHaveBeenCalledTimes(1);
    expect(options.lastDoubleTapTimeRef.current).toBe(0);
    expect(options.lastTapPositionRef.current).toEqual({ x: 0, y: 0 });
    expect(options.touchPointersRef.current.size).toBe(0);
    expect(options.touchGestureRef.current).toBe('none');
  });

  it('waits for the drag threshold before applying touch rotation', () => {
    vi.spyOn(performance, 'now').mockReturnValue(100);
    const options = createOptions();

    handleTrackballTouchStart({
      event: buildTouchEvent({ type: 'touchstart', changedTouches: [buildTouch({ identifier: 1, clientX: 0, clientY: 0 })] }),
      resetView: vi.fn(),
      ...options,
    });
    handleTrackballTouchMove({
      event: buildTouchEvent({ type: 'touchmove', changedTouches: [buildTouch({ identifier: 1, clientX: 20, clientY: 0 })] }),
      ...options,
    });
    vi.mocked(options.applyRotation).mockClear();
    vi.mocked(options.navActions.clearNavigationHistory).mockClear();

    handleTrackballTouchMove({
      event: buildTouchEvent({ type: 'touchmove', changedTouches: [buildTouch({ identifier: 1, clientX: 30, clientY: 0 })] }),
      ...options,
    });

    expect(options.hasDragThresholdPassedRef.current).toBe(true);
    expect(options.applyRotation).toHaveBeenCalledWith(10 * options.rotateSpeed * TOUCH.orbitSensitivity, 0);
    expect(options.updateCamera).toHaveBeenCalled();
    expect(options.navActions.clearNavigationHistory).toHaveBeenCalledTimes(1);
    expect(options.lastMouseRef.current).toEqual({ x: 30, y: 0 });
    expect(options.angularVelocityRef.current.x).not.toBe(0);
  });

  it('updates orbit distance during a two-finger pinch', () => {
    vi.spyOn(performance, 'now').mockReturnValue(100);
    const options = createOptions();

    handleTrackballTouchStart({
      event: buildTouchEvent({
        type: 'touchstart',
        changedTouches: [
          buildTouch({ identifier: 1, clientX: 0, clientY: 0 }),
          buildTouch({ identifier: 2, clientX: 100, clientY: 0 }),
        ],
      }),
      resetView: vi.fn(),
      ...options,
    });
    handleTrackballTouchMove({
      event: buildTouchEvent({
        type: 'touchmove',
        changedTouches: [
          buildTouch({ identifier: 1, clientX: -50, clientY: 0 }),
          buildTouch({ identifier: 2, clientX: 150, clientY: 0 }),
        ],
      }),
      ...options,
    });

    expect(options.touchGestureRef.current).toBe('pinch');
    expect(options.isPanningRef.current).toBe(true);
    expect(options.initialPinchDistanceRef.current).toBe(100);
    expect(options.initialPinchZoomRef.current).toBe(10);
    expect(options.targetDistanceRef.current).toBeCloseTo(5);
    expect(options.lastTouchCenterRef.current).toEqual({ x: 50, y: 0 });
  });

  it('clears drag state and stale momentum when the final touch ends', () => {
    vi.spyOn(performance, 'now').mockReturnValue(100);
    const options = createOptions({
      angularVelocityRef: ref({ x: 1, y: 2 }),
      draggingRef: ref(true),
      isDraggingRef: ref(true),
      initialPinchDistanceRef: ref(20),
      lastTimeRef: ref(0),
      touchGestureRef: ref('drag'),
      touchPointersRef: ref(new Map([[1, { id: 1, x: 0, y: 0, startX: 0, startY: 0 }]])),
    });

    handleTrackballTouchEnd({
      event: buildTouchEvent({ type: 'touchend', changedTouches: [buildTouch({ identifier: 1, clientX: 0, clientY: 0 })] }),
      ...options,
    });

    expect(options.touchPointersRef.current.size).toBe(0);
    expect(options.draggingRef.current).toBe(false);
    expect(options.isDraggingRef.current).toBe(false);
    expect(options.isPanningRef.current).toBe(false);
    expect(options.touchGestureRef.current).toBe('none');
    expect(options.initialPinchDistanceRef.current).toBe(0);
    expect(options.angularVelocityRef.current).toEqual({ x: 0, y: 0 });
  });
});
