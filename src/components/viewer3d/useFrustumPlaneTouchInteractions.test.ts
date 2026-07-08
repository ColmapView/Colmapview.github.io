import { renderHook } from '@testing-library/react';
import type { ThreeEvent } from '@react-three/fiber';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOUCH } from '../../theme/sizing';
import { resetFrustumTouchGuards, setActiveSceneTouchPointerCount } from './frustumTouchGuards';
import { useFrustumPlaneTouchInteractions } from './useFrustumPlaneTouchInteractions';

function planePointerEvent(overrides: Partial<{ pointerId: number; pointerType: string; clientX: number; clientY: number }> = {}) {
  const nativeEvent = { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 20, ...overrides };
  return { nativeEvent, stopPropagation: vi.fn() } as unknown as ThreeEvent<PointerEvent>;
}

function dispatchWindowPointerMove(pointerId: number, clientX: number, clientY: number) {
  const event = new Event('pointermove');
  Object.assign(event, { pointerId, clientX, clientY });
  window.dispatchEvent(event);
}

afterEach(() => {
  vi.useRealTimers();
  resetFrustumTouchGuards();
});

describe('useFrustumPlaneTouchInteractions long-press', () => {
  function renderInteractions(overrides: { isSelected?: boolean } = {}) {
    const onContextMenu = vi.fn();
    const onLongPress = vi.fn();
    const setTouchTransparent = vi.fn();
    const { result } = renderHook(() =>
      useFrustumPlaneTouchInteractions({
        enabled: true,
        imageId: 7,
        isSelected: overrides.isSelected ?? false,
        onContextMenu,
        onLongPress,
        setTouchTransparent,
      })
    );
    return { result, onContextMenu, onLongPress, setTouchTransparent };
  }

  it('fires the long-press for a stationary lone touch', () => {
    vi.useFakeTimers();
    const { result, onLongPress } = renderInteractions();

    result.current.onPointerDown!(planePointerEvent());
    setActiveSceneTouchPointerCount(1);
    vi.advanceTimersByTime(TOUCH.longPressDelay);

    expect(onLongPress).toHaveBeenCalledWith(7);
  });

  it('does not fire while dragging (finger moved past the tap radius)', () => {
    vi.useFakeTimers();
    const { result, onLongPress } = renderInteractions();

    result.current.onPointerDown!(planePointerEvent());
    setActiveSceneTouchPointerCount(1);
    dispatchWindowPointerMove(1, 60, 20);
    vi.advanceTimersByTime(TOUCH.longPressDelay);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('does not fire during a pinch (second scene touch pointer active)', () => {
    vi.useFakeTimers();
    const { result, onLongPress } = renderInteractions();

    result.current.onPointerDown!(planePointerEvent());
    setActiveSceneTouchPointerCount(2);
    vi.advanceTimersByTime(TOUCH.longPressDelay);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('never arms a long-press for mouse pointers, but keeps mouse tap actions', () => {
    vi.useFakeTimers();
    const { result, onLongPress, onContextMenu } = renderInteractions();

    result.current.onPointerDown!(planePointerEvent({ pointerType: 'mouse' }));
    vi.advanceTimersByTime(TOUCH.longPressDelay);
    expect(onLongPress).not.toHaveBeenCalled();

    result.current.onPointerUp!(planePointerEvent({ pointerType: 'mouse' }));
    expect(onContextMenu).toHaveBeenCalledWith(7);
  });

  it('suppresses the tap action after a fired long-press', () => {
    vi.useFakeTimers();
    const { result, onContextMenu, onLongPress } = renderInteractions();

    result.current.onPointerDown!(planePointerEvent());
    setActiveSceneTouchPointerCount(1);
    vi.advanceTimersByTime(TOUCH.longPressDelay);
    expect(onLongPress).toHaveBeenCalledTimes(1);

    result.current.onPointerUp!(planePointerEvent());
    expect(onContextMenu).not.toHaveBeenCalled();
  });
});
