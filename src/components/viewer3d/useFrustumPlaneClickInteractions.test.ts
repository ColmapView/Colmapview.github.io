import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildMouseEvent,
  buildPointerEvent,
  buildThreeMouseEvent,
  buildThreePointerEvent,
} from '../../test/builders';
import {
  resetSceneContextMenuGuard,
  wasSceneContextMenuHandledRecently,
} from './sceneContextMenuGuard';
import { useFrustumPlaneClickInteractions } from './useFrustumPlaneClickInteractions';

type HookOptions = Parameters<typeof useFrustumPlaneClickInteractions>[0];

function createOptions(overrides: Partial<HookOptions> = {}): HookOptions {
  return {
    disabled: false,
    imageId: 7,
    touchMode: false,
    onClick: vi.fn(),
    onContextMenu: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  resetSceneContextMenuGuard();
});

describe('useFrustumPlaneClickInteractions', () => {
  it('marks desktop right pointer-downs before the scene mouseup fallback runs', () => {
    const { result } = renderHook(() => useFrustumPlaneClickInteractions(createOptions()));

    act(() => {
      result.current.onPointerDown?.(buildThreePointerEvent({
        nativeEvent: buildPointerEvent({ button: 2 }),
      }));
    });

    expect(wasSceneContextMenuHandledRecently()).toBe(true);
  });

  it('keeps click and context-menu routing scoped to the active image', () => {
    const options = createOptions();
    const { result } = renderHook(() => useFrustumPlaneClickInteractions(options));
    const click = buildThreeMouseEvent({
      nativeEvent: buildMouseEvent(),
      stopPropagation: vi.fn(),
    });
    const contextMenu = buildThreeMouseEvent({
      nativeEvent: buildMouseEvent({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      }),
      stopPropagation: vi.fn(),
    });

    act(() => result.current.onClick?.(click));
    act(() => result.current.onContextMenu?.(contextMenu));

    expect(click.stopPropagation).toHaveBeenCalledOnce();
    expect(options.onClick).toHaveBeenCalledWith(7);
    expect(contextMenu.stopPropagation).toHaveBeenCalledOnce();
    expect(contextMenu.nativeEvent.preventDefault).toHaveBeenCalledOnce();
    expect(contextMenu.nativeEvent.stopPropagation).toHaveBeenCalledOnce();
    expect(options.onContextMenu).toHaveBeenCalledWith(7);
  });

  it('does not install desktop pointer or context-menu handlers when disabled or in touch mode', () => {
    const disabled = renderHook(() => useFrustumPlaneClickInteractions(createOptions({ disabled: true })));
    const touch = renderHook(() => useFrustumPlaneClickInteractions(createOptions({ touchMode: true })));

    expect(disabled.result.current.onPointerDown).toBeUndefined();
    expect(disabled.result.current.onContextMenu).toBeUndefined();
    expect(touch.result.current.onPointerDown).toBeUndefined();
    expect(touch.result.current.onContextMenu).toBeUndefined();
  });
});
