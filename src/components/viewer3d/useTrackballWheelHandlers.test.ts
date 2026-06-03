import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { useCameraStore, usePointCloudStore } from '../../store';
import { buildWheelEvent } from '../../test/builders';
import {
  handleTrackballWheel,
  useTrackballWheelHandlers,
} from './useTrackballWheelHandlers';

function ref<T>(current: T) {
  return { current };
}

type TrackballWheelHandlersOptions = Parameters<typeof useTrackballWheelHandlers>[0];

function createAnimationTarget(): NonNullable<TrackballWheelHandlersOptions['animationTargetRef']['current']> {
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

function createOptions(overrides: Partial<TrackballWheelHandlersOptions> = {}): TrackballWheelHandlersOptions {
  const camera = new THREE.PerspectiveCamera();

  return {
    canvas: document.createElement('canvas'),
    camera,
    cameraMode: 'orbit' as const,
    flySpeed: 2,
    radius: 5,
    zoomSpeed: 0.01,
    cameraQuatRef: ref(new THREE.Quaternion()),
    targetDistanceRef: ref(10),
    orthoZoomRef: ref(2),
    wheelHandledRef: ref(false),
    animationTargetRef: ref(createAnimationTarget()),
    enabledRef: ref(true),
    navActions: {
      clearNavigationHistory: vi.fn(),
    },
    camerasActions: {
      setScale: vi.fn(),
    },
    pointsActions: {
      setSize: vi.fn(),
    },
    ...overrides,
  };
}

function createWheelEvent({
  deltaY = 10,
  altKey = false,
  ctrlKey = false,
  defaultPrevented = false,
}: {
  deltaY?: number;
  altKey?: boolean;
  ctrlKey?: boolean;
  defaultPrevented?: boolean;
} = {}): WheelEvent {
  return buildWheelEvent({
    deltaY,
    altKey,
    ctrlKey,
    defaultPrevented,
    preventDefault: vi.fn(),
  });
}

afterEach(() => {
  useCameraStore.setState(useCameraStore.getInitialState());
  usePointCloudStore.setState(usePointCloudStore.getInitialState());
  vi.restoreAllMocks();
});

describe('trackball wheel handlers', () => {
  it('skips wheel events already handled by selected-image FOV capture', () => {
    const options = createOptions();
    options.wheelHandledRef.current = true;
    const event = createWheelEvent();

    handleTrackballWheel({ event, ...options });

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(options.wheelHandledRef.current).toBe(false);
    expect(options.navActions.clearNavigationHistory).not.toHaveBeenCalled();
  });

  it('prevents default but leaves camera state alone while disabled', () => {
    const options = createOptions();
    options.enabledRef.current = false;
    const event = createWheelEvent();

    handleTrackballWheel({ event, ...options });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(options.targetDistanceRef.current).toBe(10);
    expect(options.navActions.clearNavigationHistory).not.toHaveBeenCalled();
    expect(options.animationTargetRef.current).not.toBeNull();
  });

  it('routes Alt-wheel to camera scale actions', () => {
    const options = createOptions();
    useCameraStore.setState({ cameraScale: 2 });

    handleTrackballWheel({ event: createWheelEvent({ altKey: true }), ...options });

    expect(options.camerasActions.setScale).toHaveBeenCalledWith(1.8);
    expect(options.navActions.clearNavigationHistory).not.toHaveBeenCalled();
  });

  it('routes Ctrl-wheel to point size actions', () => {
    const options = createOptions();
    usePointCloudStore.setState({ pointSize: 5 });

    handleTrackballWheel({ event: createWheelEvent({ ctrlKey: true }), ...options });

    expect(options.pointsActions.setSize).toHaveBeenCalledWith(4.5);
    expect(options.navActions.clearNavigationHistory).not.toHaveBeenCalled();
  });

  it('updates perspective target distance and cancels animation for navigation wheel input', () => {
    const options = createOptions();
    const event = createWheelEvent();

    handleTrackballWheel({ event, ...options });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(options.navActions.clearNavigationHistory).toHaveBeenCalledOnce();
    expect(options.animationTargetRef.current).toBeNull();
    expect(options.targetDistanceRef.current).toBe(11);
  });

  it('updates orthographic zoom and projection matrix for navigation wheel input', () => {
    const camera = new THREE.OrthographicCamera();
    const updateProjectionMatrix = vi.spyOn(camera, 'updateProjectionMatrix');
    const options = createOptions({ camera });

    handleTrackballWheel({ event: createWheelEvent(), ...options });

    expect(options.orthoZoomRef.current).toBeCloseTo(2 / 1.1);
    expect(camera.zoom).toBeCloseTo(2 / 1.1);
    expect(updateProjectionMatrix).toHaveBeenCalledOnce();
  });

  it('moves the camera forward or backward in fly mode', () => {
    const camera = new THREE.PerspectiveCamera();
    const options = createOptions({ camera, cameraMode: 'fly' });

    handleTrackballWheel({ event: createWheelEvent(), ...options });

    expect(camera.position.toArray()).toEqual([0, 0, 0.1]);
  });

  it('registers and unregisters canvas wheel listeners', () => {
    const options = createOptions();
    const { unmount } = renderHook(() => useTrackballWheelHandlers(options));

    act(() => {
      options.canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 10, cancelable: true }));
    });

    expect(options.targetDistanceRef.current).toBe(11);

    unmount();

    act(() => {
      options.canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 10, cancelable: true }));
    });

    expect(options.targetDistanceRef.current).toBe(11);
  });

  it('uses latest wheel options after rerender without re-registering listeners', () => {
    const canvas = document.createElement('canvas');
    const firstClearNavigationHistory = vi.fn();
    const secondClearNavigationHistory = vi.fn();
    const initialDistance = ref(10);
    const latestDistance = ref(20);
    const addEventListener = vi.spyOn(canvas, 'addEventListener');
    const removeEventListener = vi.spyOn(canvas, 'removeEventListener');
    const options = createOptions({
      canvas,
      targetDistanceRef: initialDistance,
      navActions: {
        clearNavigationHistory: firstClearNavigationHistory,
      },
    });
    const { rerender, unmount } = renderHook(
      ({ hookOptions }: { hookOptions: TrackballWheelHandlersOptions }) => useTrackballWheelHandlers(hookOptions),
      { initialProps: { hookOptions: options } }
    );

    rerender({
      hookOptions: {
        ...options,
        targetDistanceRef: latestDistance,
        navActions: {
          clearNavigationHistory: secondClearNavigationHistory,
        },
      },
    });

    act(() => {
      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 10, cancelable: true }));
    });

    expect(initialDistance.current).toBe(10);
    expect(latestDistance.current).toBe(22);
    expect(firstClearNavigationHistory).not.toHaveBeenCalled();
    expect(secondClearNavigationHistory).toHaveBeenCalledOnce();
    expect(addEventListener).toHaveBeenCalledTimes(1);
    expect(removeEventListener).not.toHaveBeenCalled();

    unmount();

    expect(removeEventListener).toHaveBeenCalledTimes(1);
  });
});
