import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildMouseEvent, buildPointerEvent } from '../../test/builders';
import {
  handleTrackballContextMenu,
  handleTrackballPointerDown,
  handleTrackballPointerLockChange,
  handleTrackballPointerMove,
  handleTrackballPointerUp,
  type TrackballPointerHandlersOptions,
} from './trackballPointerHandlers';
import { useTrackballPointerHandlers } from './useTrackballPointerHandlers';

function ref<T>(current: T) {
  return { current };
}

function createAnimationTarget(): NonNullable<TrackballPointerHandlersOptions['animationTargetRef']['current']> {
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

function createOptions(overrides: Partial<TrackballPointerHandlersOptions> = {}): TrackballPointerHandlersOptions {
  const canvas = document.createElement('canvas');
  canvas.requestPointerLock = vi.fn();

  return {
    canvas,
    camera: new THREE.PerspectiveCamera(),
    cameraMode: 'orbit',
    flySpeed: 2,
    pointerLock: true,
    pickingMode: 'off',
    radius: 10,
    autoRotateMode: 'off',
    touchMode: false,
    rotateSpeed: 0.5,
    panSpeed: 0.1,
    applyRotation: vi.fn(),
    updateCamera: vi.fn(),
    isDraggingRef: ref(false),
    isPanningRef: ref(false),
    pointerLockRequestedRef: ref(true),
    targetVecRef: ref(new THREE.Vector3()),
    cameraQuatRef: ref(new THREE.Quaternion()),
    distanceRef: ref(10),
    angularVelocityRef: ref({ x: 9, y: -8 }),
    smoothedVelocityRef: ref({ x: 7, y: -6 }),
    lastMouseRef: ref({ x: 0, y: 0 }),
    lastTimeRef: ref(0),
    animationTargetRef: ref(createAnimationTarget()),
    enabledRef: ref(true),
    draggingRef: ref(false),
    navActions: {
      setAutoRotateMode: vi.fn(),
      clearNavigationHistory: vi.fn(),
    },
    ...overrides,
  };
}

function pointerEvent({
  button = 0,
  clientX = 10,
  clientY = 20,
  pointerType = 'mouse',
}: {
  button?: number;
  clientX?: number;
  clientY?: number;
  pointerType?: string;
} = {}): PointerEvent {
  return buildPointerEvent({ button, clientX, clientY, pointerType });
}

function mouseEvent({
  clientX = 10,
  clientY = 20,
  movementX = 0,
  movementY = 0,
  shiftKey = false,
}: {
  clientX?: number;
  clientY?: number;
  movementX?: number;
  movementY?: number;
  shiftKey?: boolean;
} = {}): MouseEvent {
  return buildMouseEvent({ clientX, clientY, movementX, movementY, shiftKey });
}

function setPointerLockElement(element: Element | null): void {
  Object.defineProperty(document, 'pointerLockElement', {
    configurable: true,
    value: element,
  });
}

afterEach(() => {
  setPointerLockElement(null);
  vi.restoreAllMocks();
});

describe('trackball pointer handlers', () => {
  it('starts rotation after pointer down once controls stay enabled', async () => {
    const options = createOptions();

    handleTrackballPointerDown({ event: pointerEvent({ clientX: 14, clientY: 22 }), ...options });
    await Promise.resolve();

    expect(options.lastMouseRef.current).toEqual({ x: 14, y: 22 });
    expect(options.isDraggingRef.current).toBe(true);
    expect(options.draggingRef.current).toBe(true);
    expect(options.angularVelocityRef.current).toEqual({ x: 0, y: 0 });
    expect(options.smoothedVelocityRef.current).toEqual({ x: 0, y: 0 });
    expect(options.pointerLockRequestedRef.current).toBe(false);
    expect(options.animationTargetRef.current).toBeNull();
  });

  it('ignores touch pointer down events while touch mode owns gestures', async () => {
    const options = createOptions({ touchMode: true });

    handleTrackballPointerDown({ event: pointerEvent({ pointerType: 'touch' }), ...options });
    await Promise.resolve();

    expect(options.lastMouseRef.current).toEqual({ x: 0, y: 0 });
    expect(options.isDraggingRef.current).toBe(false);
  });

  it('starts panning and disables auto-rotate for middle or right button drags', async () => {
    const options = createOptions({ autoRotateMode: 'clockwise' });

    handleTrackballPointerDown({ event: pointerEvent({ button: 2 }), ...options });
    await Promise.resolve();

    expect(options.isPanningRef.current).toBe(true);
    expect(options.draggingRef.current).toBe(true);
    expect(options.navActions.setAutoRotateMode).toHaveBeenCalledWith('off');
  });

  it('rotates on pointer movement, clears navigation history, and requests pointer lock', () => {
    const options = createOptions({
      isDraggingRef: ref(true),
      lastMouseRef: ref({ x: 10, y: 20 }),
      pointerLockRequestedRef: ref(false),
    });

    handleTrackballPointerMove({ event: mouseEvent({ clientX: 14, clientY: 18 }), ...options });

    expect(options.navActions.clearNavigationHistory).toHaveBeenCalledOnce();
    expect(options.canvas.requestPointerLock).toHaveBeenCalledOnce();
    expect(options.pointerLockRequestedRef.current).toBe(true);
    expect(options.applyRotation).toHaveBeenCalledWith(2, -1);
    expect(options.updateCamera).toHaveBeenCalledOnce();
    expect(options.lastMouseRef.current).toEqual({ x: 14, y: 18 });
  });

  it('stops active drag state when controls are disabled during pointer movement', () => {
    const options = createOptions({
      enabledRef: ref(false),
      isDraggingRef: ref(true),
      draggingRef: ref(true),
    });

    handleTrackballPointerMove({ event: mouseEvent(), ...options });

    expect(options.isDraggingRef.current).toBe(false);
    expect(options.draggingRef.current).toBe(false);
    expect(options.angularVelocityRef.current).toEqual({ x: 0, y: 0 });
    expect(options.applyRotation).not.toHaveBeenCalled();
  });

  it('pans the orbit target on pointer movement', () => {
    const options = createOptions({
      isPanningRef: ref(true),
      lastMouseRef: ref({ x: 0, y: 0 }),
    });

    handleTrackballPointerMove({ event: mouseEvent({ clientX: 10, clientY: -5 }), ...options });

    expect(options.navActions.clearNavigationHistory).toHaveBeenCalledOnce();
    expect(options.targetVecRef.current.toArray()).toEqual([-10, -5, 0]);
    expect(options.updateCamera).toHaveBeenCalledOnce();
  });

  it('strafes the camera in fly mode when panning', () => {
    const camera = new THREE.PerspectiveCamera();
    const options = createOptions({
      camera,
      cameraMode: 'fly',
      isPanningRef: ref(true),
      lastMouseRef: ref({ x: 0, y: 0 }),
    });

    handleTrackballPointerMove({ event: mouseEvent({ clientX: 10, clientY: -5, shiftKey: true }), ...options });

    expect(camera.position.toArray()).toEqual([-60, -30, 0]);
  });

  it('applies recent momentum and exits pointer lock on pointer up', () => {
    const options = createOptions({
      isDraggingRef: ref(true),
      angularVelocityRef: ref({ x: 3, y: -2 }),
      lastTimeRef: ref(100),
    });
    vi.spyOn(performance, 'now').mockReturnValue(120);
    document.exitPointerLock = vi.fn();
    setPointerLockElement(options.canvas);

    handleTrackballPointerUp(options);

    expect(options.applyRotation).toHaveBeenCalledWith(3, -2);
    expect(options.updateCamera).toHaveBeenCalledOnce();
    expect(options.isDraggingRef.current).toBe(false);
    expect(options.pointerLockRequestedRef.current).toBe(false);
    expect(document.exitPointerLock).toHaveBeenCalledOnce();
  });

  it('clears motion when pointer lock exits during a drag', () => {
    const options = createOptions({
      isDraggingRef: ref(true),
      isPanningRef: ref(true),
      draggingRef: ref(true),
    });
    setPointerLockElement(null);

    handleTrackballPointerLockChange(options);

    expect(options.angularVelocityRef.current).toEqual({ x: 0, y: 0 });
    expect(options.smoothedVelocityRef.current).toEqual({ x: 0, y: 0 });
    expect(options.isDraggingRef.current).toBe(false);
    expect(options.isPanningRef.current).toBe(false);
    expect(options.draggingRef.current).toBe(false);
  });

  it('prevents the native context menu', () => {
    const event = buildMouseEvent({ preventDefault: vi.fn() });

    handleTrackballContextMenu(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('registers and unregisters native pointer listeners', () => {
    const options = createOptions({
      isDraggingRef: ref(true),
      lastMouseRef: ref({ x: 0, y: 0 }),
    });
    const { unmount } = renderHook(() => useTrackballPointerHandlers(options));

    act(() => {
      document.dispatchEvent(new MouseEvent('pointermove', { clientX: 4, clientY: 2 }));
    });

    expect(options.applyRotation).toHaveBeenCalledOnce();

    unmount();

    act(() => {
      document.dispatchEvent(new MouseEvent('pointermove', { clientX: 8, clientY: 4 }));
    });

    expect(options.applyRotation).toHaveBeenCalledOnce();
  });

  it('uses latest pointer options after rerender without re-registering canvas listeners', () => {
    const canvas = document.createElement('canvas');
    canvas.requestPointerLock = vi.fn();
    const firstApplyRotation = vi.fn();
    const secondApplyRotation = vi.fn();
    const addEventListener = vi.spyOn(canvas, 'addEventListener');
    const removeEventListener = vi.spyOn(canvas, 'removeEventListener');
    const options = createOptions({
      canvas,
      isDraggingRef: ref(true),
      lastMouseRef: ref({ x: 0, y: 0 }),
      pointerLockRequestedRef: ref(true),
      applyRotation: firstApplyRotation,
    });
    const { rerender, unmount } = renderHook(
      ({ hookOptions }: { hookOptions: TrackballPointerHandlersOptions }) => useTrackballPointerHandlers(hookOptions),
      { initialProps: { hookOptions: options } }
    );

    rerender({
      hookOptions: {
        ...options,
        applyRotation: secondApplyRotation,
      },
    });

    act(() => {
      document.dispatchEvent(new MouseEvent('pointermove', { clientX: 4, clientY: 2 }));
    });

    expect(firstApplyRotation).not.toHaveBeenCalled();
    expect(secondApplyRotation).toHaveBeenCalledOnce();
    expect(addEventListener).toHaveBeenCalledTimes(1);
    expect(removeEventListener).not.toHaveBeenCalled();

    unmount();

    expect(removeEventListener).toHaveBeenCalledTimes(1);
  });
});
