import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

afterEach(() => {
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
    const openContextMenu = vi.spyOn(useUIStore.getState(), 'openContextMenu');
    const { result, unmount } = renderHook(() => useSceneContextMenuController());

    act(() => result.current.handleTouchPointerDown(pointerEvent()));
    unmount();
    act(() => vi.advanceTimersByTime(TOUCH.longPressDelay));

    expect(openContextMenu).not.toHaveBeenCalled();
  });

  it('clears pending scene long-press timers when touch mode is disabled', () => {
    vi.useFakeTimers();
    useUIStore.getState().setTouchMode(true, 'url');
    const openContextMenu = vi.spyOn(useUIStore.getState(), 'openContextMenu');
    const { result, rerender } = renderHook(() => useSceneContextMenuController());

    act(() => result.current.handleTouchPointerDown(pointerEvent()));
    act(() => useUIStore.getState().setTouchMode(false, 'url'));
    rerender();
    act(() => vi.advanceTimersByTime(TOUCH.longPressDelay));

    expect(openContextMenu).not.toHaveBeenCalled();
  });

  it('opens the menu after a stationary single-finger long-press', () => {
    vi.useFakeTimers();
    useUIStore.getState().setTouchMode(true, 'url');
    const openContextMenu = vi.spyOn(useUIStore.getState(), 'openContextMenu');
    const { result } = renderHook(() => useSceneContextMenuController());

    act(() => result.current.handleTouchPointerDown(pointerEvent({ pointerId: 1 })));
    act(() => vi.advanceTimersByTime(TOUCH.longPressDelay));

    expect(openContextMenu).toHaveBeenCalledWith(10, 20);
  });

  it('does not open the menu when a second finger joins before the delay (pinch)', () => {
    vi.useFakeTimers();
    useUIStore.getState().setTouchMode(true, 'url');
    const openContextMenu = vi.spyOn(useUIStore.getState(), 'openContextMenu');
    const { result } = renderHook(() => useSceneContextMenuController());

    act(() => result.current.handleTouchPointerDown(pointerEvent({ pointerId: 1, clientX: 10, clientY: 20 })));
    act(() => result.current.handleTouchPointerDown(pointerEvent({ pointerId: 2, clientX: 120, clientY: 220 })));
    // Typical pinch: both fingers move while the gesture is held past the delay.
    act(() => result.current.handleTouchPointerMove(pointerEvent({ pointerId: 2, clientX: 160, clientY: 260 })));
    act(() => vi.advanceTimersByTime(TOUCH.longPressDelay));

    expect(openContextMenu).not.toHaveBeenCalled();
  });

  it('does not open the menu after one finger of a two-finger gesture lifts', () => {
    vi.useFakeTimers();
    useUIStore.getState().setTouchMode(true, 'url');
    const openContextMenu = vi.spyOn(useUIStore.getState(), 'openContextMenu');
    const { result } = renderHook(() => useSceneContextMenuController());

    act(() => result.current.handleTouchPointerDown(pointerEvent({ pointerId: 1 })));
    act(() => result.current.handleTouchPointerDown(pointerEvent({ pointerId: 2, clientX: 120, clientY: 220 })));
    act(() => result.current.handleTouchPointerUp(pointerEvent({ pointerId: 2, clientX: 120, clientY: 220 })));
    act(() => vi.advanceTimersByTime(TOUCH.longPressDelay));

    expect(openContextMenu).not.toHaveBeenCalled();
  });

  it('cancels the long-press when the pointer is cancelled (browser takes the gesture)', () => {
    vi.useFakeTimers();
    useUIStore.getState().setTouchMode(true, 'url');
    const openContextMenu = vi.spyOn(useUIStore.getState(), 'openContextMenu');
    const { result } = renderHook(() => useSceneContextMenuController());

    act(() => result.current.handleTouchPointerDown(pointerEvent({ pointerId: 1 })));
    act(() => result.current.handleTouchPointerCancel(pointerEvent({ pointerId: 1 })));
    act(() => vi.advanceTimersByTime(TOUCH.longPressDelay));

    expect(openContextMenu).not.toHaveBeenCalled();
  });

  it('ignores touch-derived native contextmenu events in touch mode', () => {
    useUIStore.getState().setTouchMode(true, 'url');
    const openContextMenu = vi.spyOn(useUIStore.getState(), 'openContextMenu');
    const { result } = renderHook(() => useSceneContextMenuController());

    const event = contextMenuEvent('touch');
    act(() => result.current.handleContextMenu(event));

    // The OS long-press menu stays suppressed, but the app menu is owned by the
    // controller's own long-press timer - not by this synthesized event.
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
