import { renderHook } from '@testing-library/react';
import type { ThreeEvent } from '@react-three/fiber';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOUCH } from '../../theme/sizing';
import {
  resetFrustumTouchGuards,
  setActiveSceneTouchPointerCount,
  wasFrustumTouchDownRecent,
} from './frustumTouchGuards';
import {
  resetSceneContextMenuGuard,
  wasSceneContextMenuHandledRecently,
} from './sceneContextMenuGuard';
import { useSphericalCameraHitTargetTouchInteractions } from './useSphericalCameraHitTargetTouchInteractions';

const FRUSTUMS = [{ image: { imageId: 7 } }, { image: { imageId: 9 } }];

function spherePointerEvent(
  instanceId: number | undefined,
  overrides: Partial<{ pointerId: number; pointerType: string; button: number; clientX: number; clientY: number }> = {}
) {
  const nativeEvent = { pointerId: 1, pointerType: 'touch', button: 0, clientX: 10, clientY: 20, ...overrides };
  return { instanceId, nativeEvent, stopPropagation: vi.fn() } as unknown as ThreeEvent<PointerEvent>;
}

function dispatchWindowPointerMove(pointerId: number, clientX: number, clientY: number) {
  const event = new Event('pointermove');
  Object.assign(event, { pointerId, clientX, clientY });
  window.dispatchEvent(event);
}

afterEach(() => {
  vi.useRealTimers();
  resetFrustumTouchGuards();
  resetSceneContextMenuGuard();
});

describe('useSphericalCameraHitTargetTouchInteractions (touch mode)', () => {
  function renderInteractions() {
    const onContextMenu = vi.fn();
    const onLongPress = vi.fn();
    const { result, unmount } = renderHook(() =>
      useSphericalCameraHitTargetTouchInteractions({
        frustums: FRUSTUMS,
        touchMode: true,
        onContextMenu,
        onLongPress,
      })
    );
    return { result, onContextMenu, onLongPress, unmount };
  }

  it('fires the long-press for a stationary lone touch on the pressed instance', () => {
    vi.useFakeTimers();
    const { result, onLongPress } = renderInteractions();

    result.current.onPointerDown!(spherePointerEvent(0));
    setActiveSceneTouchPointerCount(1);
    vi.advanceTimersByTime(TOUCH.longPressDelay);

    expect(onLongPress).toHaveBeenCalledWith(7);
  });

  it('does not fire while the armed pointer drags past the tap radius', () => {
    vi.useFakeTimers();
    const { result, onLongPress } = renderInteractions();

    result.current.onPointerDown!(spherePointerEvent(0));
    setActiveSceneTouchPointerCount(1);
    dispatchWindowPointerMove(1, 60, 20);
    vi.advanceTimersByTime(TOUCH.longPressDelay);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('does not fire during a pinch (second scene touch pointer active)', () => {
    vi.useFakeTimers();
    const { result, onLongPress } = renderInteractions();

    result.current.onPointerDown!(spherePointerEvent(0));
    setActiveSceneTouchPointerCount(2);
    vi.advanceTimersByTime(TOUCH.longPressDelay);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('never arms a long-press for mouse pointers, but keeps the tap context-menu action', () => {
    vi.useFakeTimers();
    const { result, onContextMenu, onLongPress } = renderInteractions();

    result.current.onPointerDown!(spherePointerEvent(0, { pointerType: 'mouse' }));
    vi.advanceTimersByTime(TOUCH.longPressDelay);
    expect(onLongPress).not.toHaveBeenCalled();

    result.current.onPointerUp!(spherePointerEvent(0, { pointerType: 'mouse' }));
    expect(onContextMenu).toHaveBeenCalledWith(7);
  });

  it('suppresses the tap context-menu action after a fired long-press', () => {
    vi.useFakeTimers();
    const { result, onContextMenu, onLongPress } = renderInteractions();

    result.current.onPointerDown!(spherePointerEvent(0));
    setActiveSceneTouchPointerCount(1);
    vi.advanceTimersByTime(TOUCH.longPressDelay);
    expect(onLongPress).toHaveBeenCalledTimes(1);

    result.current.onPointerUp!(spherePointerEvent(0));
    expect(onContextMenu).not.toHaveBeenCalled();
  });

  it('opens the context menu on a short stationary tap and stops propagation', () => {
    vi.useFakeTimers();
    const { result, onContextMenu } = renderInteractions();

    result.current.onPointerDown!(spherePointerEvent(0, { clientX: 10, clientY: 10 }));
    const tapUp = spherePointerEvent(0, { clientX: 12, clientY: 12 });
    result.current.onPointerUp!(tapUp);

    expect(tapUp.stopPropagation).toHaveBeenCalledOnce();
    expect(onContextMenu).toHaveBeenCalledWith(7);
  });

  it('marks the scene touch-down guard only for touch pointers', () => {
    const { result } = renderInteractions();

    result.current.onPointerDown!(spherePointerEvent(0, { pointerType: 'mouse' }));
    expect(wasFrustumTouchDownRecent()).toBe(false);

    result.current.onPointerDown!(spherePointerEvent(0, { pointerType: 'touch' }));
    expect(wasFrustumTouchDownRecent()).toBe(true);
  });

  it('cancels a pending long-press on unmount', () => {
    vi.useFakeTimers();
    const { result, onLongPress, unmount } = renderInteractions();

    result.current.onPointerDown!(spherePointerEvent(0));
    setActiveSceneTouchPointerCount(1);
    unmount();
    vi.advanceTimersByTime(TOUCH.longPressDelay);

    expect(onLongPress).not.toHaveBeenCalled();
  });
});

describe('useSphericalCameraHitTargetTouchInteractions (non-touch mode)', () => {
  it('has no pointer-up and marks the scene context-menu guard on a right pointer-down', () => {
    const onContextMenu = vi.fn();
    const onLongPress = vi.fn();
    const { result } = renderHook(() =>
      useSphericalCameraHitTargetTouchInteractions({
        frustums: FRUSTUMS,
        touchMode: false,
        onContextMenu,
        onLongPress,
      })
    );

    expect(result.current.onPointerUp).toBeUndefined();

    result.current.onPointerDown!(spherePointerEvent(0, { pointerType: 'mouse', button: 2 }));
    expect(wasSceneContextMenuHandledRecently()).toBe(true);
  });
});
