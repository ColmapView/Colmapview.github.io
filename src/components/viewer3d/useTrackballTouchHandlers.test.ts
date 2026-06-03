import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildTouch, buildTouchEvent } from '../../test/builders';
import {
  useTrackballTouchHandlers,
  type TrackballTouchHandlersOptions,
} from './useTrackballTouchHandlers';

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
    angularVelocityRef: ref({ x: 0, y: 0 }),
    smoothedVelocityRef: ref({ x: 0, y: 0 }),
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

describe('trackball touch handlers', () => {
  it('uses latest touch options after rerender without re-registering listeners', () => {
    const canvas = document.createElement('canvas');
    const firstApplyRotation = vi.fn();
    const secondApplyRotation = vi.fn();
    const addEventListener = vi.spyOn(canvas, 'addEventListener');
    const removeEventListener = vi.spyOn(canvas, 'removeEventListener');
    const options = createOptions({
      canvas,
      applyRotation: firstApplyRotation,
    });
    const { rerender, unmount } = renderHook(
      ({ hookOptions }: { hookOptions: TrackballTouchHandlersOptions }) => useTrackballTouchHandlers(hookOptions),
      { initialProps: { hookOptions: options } }
    );

    act(() => {
      canvas.dispatchEvent(buildTouchEvent({
        type: 'touchstart',
        changedTouches: [buildTouch({ identifier: 1, clientX: 0, clientY: 0 })],
      }));
      canvas.dispatchEvent(buildTouchEvent({
        type: 'touchmove',
        changedTouches: [buildTouch({ identifier: 1, clientX: 20, clientY: 0 })],
      }));
    });
    firstApplyRotation.mockClear();

    rerender({
      hookOptions: {
        ...options,
        applyRotation: secondApplyRotation,
      },
    });

    act(() => {
      canvas.dispatchEvent(buildTouchEvent({
        type: 'touchmove',
        changedTouches: [buildTouch({ identifier: 1, clientX: 30, clientY: 0 })],
      }));
    });

    expect(firstApplyRotation).not.toHaveBeenCalled();
    expect(secondApplyRotation).toHaveBeenCalledWith(7.5, 0);
    expect(options.navActions.clearNavigationHistory).toHaveBeenCalled();
    expect(addEventListener).toHaveBeenCalledTimes(4);
    expect(removeEventListener).not.toHaveBeenCalled();

    unmount();

    expect(removeEventListener).toHaveBeenCalledTimes(4);
  });
});
