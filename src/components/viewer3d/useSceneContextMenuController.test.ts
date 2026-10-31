import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { usePointPickingStore, useUIStore } from '../../store';
import { TOUCH } from '../../theme/sizing';
import { getActiveSceneTouchPointerCount, resetFrustumTouchGuards } from './frustumTouchGuards';
import { useSceneContextMenuController } from './useSceneContextMenuController';

interface PointerEventOverrides {
  pointerId?: number;
  clientX?: number;
  clientY?: number;
  pointerType?: string;
}

function pointerEvent(overrides: PointerEventOverrides = {}): ReactPointerEvent {
  return {
    clientX: 10,
    clientY: 20,
    pointerId: 1,
    pointerType: 'touch',
    ...overrides,
  } as unknown as ReactPointerEvent;
}

function contextMenuEvent(nativePointerType?: string): ReactMouseEvent {
  return {
    clientX: 10,
    clientY: 20,
    preventDefault: vi.fn(),
    nativeEvent: (nativePointerType ? { pointerType: nativePointerType } : {}) as MouseEvent,
  } as unknown as ReactMouseEvent;
}

// Touch long-press only undoes point picks; the custom menu is desktop-only.
function armPointPick(): void {
  const picking = usePointPickingStore.getState();
  picking.setPickingMode('distance-2pt');
  picking.addSelectedPoint({ position: new THREE.Vector3(), point3DId: 1n });
}

function pickedPointCount(): number {
  return usePointPickingStore.getState().selectedPoints.length;
}

afterEach(() => {
  // Unmount first: resetting the stores under a mounted hook is an update outside act().
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  // Full reset: zustand set() copies action references into new state objects,
  // so a spied action would otherwise leak (with its call history) across tests.
  useUIStore.setState(useUIStore.getInitialState(), true);
  usePointPickingStore.getState().reset();
  resetFrustumTouchGuards();
});

describe('useSceneContextMenuController', () => {
  it('clears pending scene long-press timers on unmount', () => {
    vi.useFakeTimers();
    useUIStore.getState().setTouchMode(true, 'url');
    armPointPick();
    const { result, unmount } = renderHook(() => useSceneContextMenuController());

    act(() => result.current.handleTouchPointerDown(pointerEvent()));
    unmount();
    act(() => vi.advanceTimersByTime(TOUCH.longPressDelay));

    expect(pickedPointCount()).toBe(1);
  });

  it('clears pending scene long-press timers when touch mode is disabled', () => {
    vi.useFakeTimers();
    useUIStore.getState().setTouchMode(true, 'url');
    armPointPick();
    const { result, rerender } = renderHook(() => useSceneContextMenuController());

    act(() => result.current.handleTouchPointerDown(pointerEvent()));
    act(() => useUIStore.getState().setTouchMode(false, 'url'));
    rerender();
    act(() => vi.advanceTimersByTime(TOUCH.longPressDelay));

    expect(pickedPointCount()).toBe(1);
  });

  it('never opens the custom menu from a touch long-press', () => {
    vi.useFakeTimers();
    useUIStore.getState().setTouchMode(true, 'url');
    const openContextMenu = vi.spyOn(useUIStore.getState(), 'openContextMenu');
    const { result } = renderHook(() => useSceneContextMenuController());

    act(() => result.current.handleTouchPointerDown(pointerEvent({ pointerId: 1 })));
    act(() => vi.advanceTimersByTime(TOUCH.longPressDelay));

    expect(openContextMenu).not.toHaveBeenCalled();
  });

  it('undoes the last picked point after a stationary single-finger long-press', () => {
    vi.useFakeTimers();
    useUIStore.getState().setTouchMode(true, 'url');
    armPointPick();
    const { result } = renderHook(() => useSceneContextMenuController());

    act(() => result.current.handleTouchPointerDown(pointerEvent({ pointerId: 1 })));
    act(() => vi.advanceTimersByTime(TOUCH.longPressDelay));

    expect(pickedPointCount()).toBe(0);
  });

  it('does not fire when a second finger joins before the delay (pinch)', () => {
    vi.useFakeTimers();
    useUIStore.getState().setTouchMode(true, 'url');
    armPointPick();
    const { result } = renderHook(() => useSceneContextMenuController());

    act(() => result.current.handleTouchPointerDown(pointerEvent({ pointerId: 1, clientX: 10, clientY: 20 })));
    act(() => result.current.handleTouchPointerDown(pointerEvent({ pointerId: 2, clientX: 120, clientY: 220 })));
    // Typical pinch: both fingers move while the gesture is held past the delay.
    act(() => result.current.handleTouchPointerMove(pointerEvent({ pointerId: 2, clientX: 160, clientY: 260 })));
    act(() => vi.advanceTimersByTime(TOUCH.longPressDelay));

    expect(pickedPointCount()).toBe(1);
  });

  it('does not fire after one finger of a two-finger gesture lifts', () => {
    vi.useFakeTimers();
    useUIStore.getState().setTouchMode(true, 'url');
    armPointPick();
    const { result } = renderHook(() => useSceneContextMenuController());

    act(() => result.current.handleTouchPointerDown(pointerEvent({ pointerId: 1 })));
    act(() => result.current.handleTouchPointerDown(pointerEvent({ pointerId: 2, clientX: 120, clientY: 220 })));
    act(() => result.current.handleTouchPointerUp(pointerEvent({ pointerId: 2, clientX: 120, clientY: 220 })));
    act(() => vi.advanceTimersByTime(TOUCH.longPressDelay));

    expect(pickedPointCount()).toBe(1);
  });

  it('cancels the long-press when the pointer is cancelled (browser takes the gesture)', () => {
    vi.useFakeTimers();
    useUIStore.getState().setTouchMode(true, 'url');
    armPointPick();
    const { result } = renderHook(() => useSceneContextMenuController());

    act(() => result.current.handleTouchPointerDown(pointerEvent({ pointerId: 1 })));
    act(() => result.current.handleTouchPointerCancel(pointerEvent({ pointerId: 1 })));
    act(() => vi.advanceTimersByTime(TOUCH.longPressDelay));

    expect(pickedPointCount()).toBe(1);
  });

  it('ignores touch-derived native contextmenu events in touch mode', () => {
    useUIStore.getState().setTouchMode(true, 'url');
    const openContextMenu = vi.spyOn(useUIStore.getState(), 'openContextMenu');
    const { result } = renderHook(() => useSceneContextMenuController());

    const event = contextMenuEvent('touch');
    act(() => result.current.handleContextMenu(event));

    // The OS long-press menu stays suppressed, and touch never opens the app menu.
    expect(event.preventDefault).toHaveBeenCalled();
    expect(openContextMenu).not.toHaveBeenCalled();
  });

  it('still opens the menu for mouse-derived contextmenu in touch mode', () => {
    useUIStore.getState().setTouchMode(true, 'url');
    const openContextMenu = vi.spyOn(useUIStore.getState(), 'openContextMenu');
    const { result } = renderHook(() => useSceneContextMenuController());

    act(() => result.current.handleContextMenu(contextMenuEvent()));

    expect(openContextMenu).toHaveBeenCalledWith(10, 20);
  });

  it('publishes the active scene touch-pointer count for mesh-level long-press gates', () => {
    useUIStore.getState().setTouchMode(true, 'url');
    const { result, unmount } = renderHook(() => useSceneContextMenuController());

    expect(getActiveSceneTouchPointerCount()).toBe(0);
    act(() => result.current.handleTouchPointerDown(pointerEvent({ pointerId: 1 })));
    expect(getActiveSceneTouchPointerCount()).toBe(1);
    act(() => result.current.handleTouchPointerDown(pointerEvent({ pointerId: 2, clientX: 120, clientY: 220 })));
    expect(getActiveSceneTouchPointerCount()).toBe(2);
    act(() => result.current.handleTouchPointerUp(pointerEvent({ pointerId: 2, clientX: 120, clientY: 220 })));
    expect(getActiveSceneTouchPointerCount()).toBe(1);
    unmount();
    expect(getActiveSceneTouchPointerCount()).toBe(0);
  });
});
