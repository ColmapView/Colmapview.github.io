import type { PointerEvent as ReactPointerEvent } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePointPickingStore, useUIStore } from '../../store';
import { TOUCH } from '../../theme/sizing';
import { useSceneContextMenuController } from './useSceneContextMenuController';

function pointerEvent(pointerType = 'touch'): ReactPointerEvent {
  return {
    clientX: 10,
    clientY: 20,
    pointerType,
  } as unknown as ReactPointerEvent;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  useUIStore.getState().closeContextMenu();
  useUIStore.getState().setTouchMode(false, 'url');
  usePointPickingStore.getState().reset();
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
});
