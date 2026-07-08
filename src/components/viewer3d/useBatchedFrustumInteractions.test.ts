import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildMouseEvent,
  buildPointerEvent,
  buildThreeMouseEvent,
  buildThreePointerEvent,
} from '../../test/builders';
import { TOUCH } from '../../theme/sizing';
import { clearBodyCursor } from '../../utils/bodyCursor';
import { CAMERA_FRUSTUM_CURSOR_OWNER } from './cameraFrustumConstants';
import { resetFrustumTouchGuards, setActiveSceneTouchPointerCount } from './frustumTouchGuards';
import {
  resetSceneContextMenuGuard,
  wasSceneContextMenuHandledRecently,
} from './sceneContextMenuGuard';
import { useBatchedFrustumInteractions } from './useBatchedFrustumInteractions';

type HookOptions = Parameters<typeof useBatchedFrustumInteractions>[0];

function createOptions(overrides: Partial<HookOptions> = {}): HookOptions {
  return {
    frustums: [
      { image: { imageId: 1 } },
      { image: { imageId: 2 } },
    ],
    selectedImageId: null,
    touchMode: false,
    isDragging: () => false,
    onHover: vi.fn(),
    onClick: vi.fn(),
    onContextMenu: vi.fn(),
    onLongPress: vi.fn(),
    ...overrides,
  };
}

function pointerEvent(instanceId: number | undefined, x = 10, y = 20, button = 0) {
  return buildThreePointerEvent({
    instanceId,
    nativeEvent: buildPointerEvent({
      button,
      clientX: x,
      clientY: y,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    }),
    stopPropagation: vi.fn(),
  });
}

function mouseEvent(instanceId: number | undefined) {
  return buildThreeMouseEvent({
    instanceId,
    nativeEvent: buildMouseEvent({
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    }),
    stopPropagation: vi.fn(),
  });
}

function batchedTouchEvent(
  instanceId: number,
  overrides: Partial<{ pointerId: number; pointerType: string; clientX: number; clientY: number }> = {}
) {
  return {
    instanceId,
    nativeEvent: { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 20, ...overrides },
    stopPropagation: vi.fn(),
  };
}

function dispatchWindowPointerMove(pointerId: number, clientX: number, clientY: number) {
  const event = new Event('pointermove');
  Object.assign(event, { pointerId, clientX, clientY });
  window.dispatchEvent(event);
}

afterEach(() => {
  vi.useRealTimers();
  resetSceneContextMenuGuard();
  resetFrustumTouchGuards();
  clearBodyCursor(CAMERA_FRUSTUM_CURSOR_OWNER);
  document.body.style.cursor = '';
});

describe('useBatchedFrustumInteractions', () => {
  it('tracks hover tooltip state and cursor ownership for unselected instances', () => {
    const options = createOptions();
    const { result } = renderHook(() => useBatchedFrustumInteractions(options));
    const over = pointerEvent(1, 30, 40);

    act(() => result.current.interactionHandlers.onPointerOver(over));

    expect(over.stopPropagation).toHaveBeenCalledOnce();
    expect(options.onHover).toHaveBeenCalledWith(2);
    expect(document.body.style.cursor).toBe('pointer');
    expect(result.current.tooltipData).toEqual({ instanceId: 1, x: 30, y: 40 });
    expect(result.current.tooltipFrustum).toBe(options.frustums[1]);

    act(() => result.current.interactionHandlers.onPointerMove(pointerEvent(1, 35, 45)));

    expect(result.current.tooltipData).toEqual({ instanceId: 1, x: 35, y: 45 });

    act(() => result.current.interactionHandlers.onPointerOut());

    expect(options.onHover).toHaveBeenLastCalledWith(null);
    expect(result.current.tooltipData).toBeNull();
    expect(document.body.style.cursor).toBe('');
  });

  it('ignores selected, missing, and dragging hover targets', () => {
    const options = createOptions({
      selectedImageId: 1,
      isDragging: () => true,
    });
    const { result, rerender } = renderHook((hookOptions: HookOptions) => useBatchedFrustumInteractions(hookOptions), {
      initialProps: options,
    });

    act(() => result.current.interactionHandlers.onPointerOver(pointerEvent(0)));

    expect(options.onHover).not.toHaveBeenCalled();
    expect(result.current.tooltipData).toBeNull();

    rerender(createOptions({ selectedImageId: 1 }));

    act(() => result.current.interactionHandlers.onPointerOver(pointerEvent(0)));
    act(() => result.current.interactionHandlers.onPointerOver(pointerEvent(undefined)));

    expect(result.current.tooltipData).toBeNull();
  });

  it('routes desktop click and context-menu actions for unselected instances', () => {
    const options = createOptions();
    const { result } = renderHook(() => useBatchedFrustumInteractions(options));
    const click = mouseEvent(0);
    const context = mouseEvent(1);

    act(() => result.current.interactionHandlers.onClick(click));
    act(() => result.current.interactionHandlers.onContextMenu(context));

    expect(click.stopPropagation).toHaveBeenCalledOnce();
    expect(options.onClick).toHaveBeenCalledWith(1);
    expect(context.stopPropagation).toHaveBeenCalledOnce();
    expect(context.nativeEvent.preventDefault).toHaveBeenCalledOnce();
    expect(context.nativeEvent.stopPropagation).toHaveBeenCalledOnce();
    expect(options.onContextMenu).toHaveBeenCalledWith(2);
  });

  it('marks desktop right pointer-downs so the scene fallback does not open quick access', () => {
    const options = createOptions();
    const { result } = renderHook(() => useBatchedFrustumInteractions(options));

    act(() => result.current.interactionHandlers.onPointerDown?.(pointerEvent(1, 30, 40, 2)));

    expect(wasSceneContextMenuHandledRecently()).toBe(true);
  });

  it('uses touch handlers for long-press, short tap, and movement cancellation', () => {
    vi.useFakeTimers();
    const options = createOptions({ touchMode: true });
    const { result } = renderHook(() => useBatchedFrustumInteractions(options));

    act(() => result.current.interactionHandlers.onPointerDown?.(batchedTouchEvent(0, { clientX: 10, clientY: 10 })));
    setActiveSceneTouchPointerCount(1);
    act(() => vi.advanceTimersByTime(TOUCH.longPressDelay));
    act(() => result.current.interactionHandlers.onPointerUp?.(batchedTouchEvent(0, { clientX: 10, clientY: 10 })));

    expect(options.onLongPress).toHaveBeenCalledWith(1);
    expect(options.onContextMenu).not.toHaveBeenCalled();

    act(() => result.current.interactionHandlers.onPointerDown?.(batchedTouchEvent(1, { clientX: 20, clientY: 20 })));
    act(() => vi.advanceTimersByTime(TOUCH.longPressDelay - 1));
    const tapUp = batchedTouchEvent(1, { clientX: 22, clientY: 22 });
    act(() => result.current.interactionHandlers.onPointerUp?.(tapUp));

    expect(tapUp.stopPropagation).toHaveBeenCalledOnce();
    expect(options.onContextMenu).toHaveBeenCalledWith(2);

    act(() => result.current.interactionHandlers.onPointerDown?.(batchedTouchEvent(1, { clientX: 0, clientY: 0 })));
    act(() => result.current.interactionHandlers.onPointerUp?.(batchedTouchEvent(1, { clientX: 16, clientY: 0 })));

    expect(options.onContextMenu).toHaveBeenCalledTimes(1);
  });

  it('suppresses selected touch taps and cancels the pending long-press on unmount', () => {
    vi.useFakeTimers();
    const options = createOptions({ selectedImageId: 2, touchMode: true });
    const { result, unmount } = renderHook(() => useBatchedFrustumInteractions(options));

    act(() => result.current.interactionHandlers.onPointerDown?.(batchedTouchEvent(1, { clientX: 10, clientY: 10 })));
    act(() => result.current.interactionHandlers.onPointerUp?.(batchedTouchEvent(1, { clientX: 10, clientY: 10 })));

    expect(options.onContextMenu).not.toHaveBeenCalled();

    act(() => result.current.interactionHandlers.onPointerDown?.(batchedTouchEvent(0, { clientX: 10, clientY: 10 })));
    setActiveSceneTouchPointerCount(1);
    unmount();
    act(() => vi.advanceTimersByTime(TOUCH.longPressDelay));

    expect(options.onLongPress).not.toHaveBeenCalled();
  });
});

describe('batched long-press', () => {
  it('fires the long-press for a stationary lone touch on the pressed instance', () => {
    vi.useFakeTimers();
    const options = createOptions({ touchMode: true });
    const { result } = renderHook(() => useBatchedFrustumInteractions(options));

    act(() => result.current.interactionHandlers.onPointerDown?.(batchedTouchEvent(0)));
    setActiveSceneTouchPointerCount(1);
    act(() => vi.advanceTimersByTime(TOUCH.longPressDelay));

    expect(options.onLongPress).toHaveBeenCalledWith(1);
  });

  it('does not fire while the armed pointer drags past the tap radius', () => {
    vi.useFakeTimers();
    const options = createOptions({ touchMode: true });
    const { result } = renderHook(() => useBatchedFrustumInteractions(options));

    act(() => result.current.interactionHandlers.onPointerDown?.(batchedTouchEvent(0)));
    setActiveSceneTouchPointerCount(1);
    dispatchWindowPointerMove(1, 60, 20);
    act(() => vi.advanceTimersByTime(TOUCH.longPressDelay));

    expect(options.onLongPress).not.toHaveBeenCalled();
  });

  it('does not fire during a pinch (second scene touch pointer active)', () => {
    vi.useFakeTimers();
    const options = createOptions({ touchMode: true });
    const { result } = renderHook(() => useBatchedFrustumInteractions(options));

    act(() => result.current.interactionHandlers.onPointerDown?.(batchedTouchEvent(0)));
    setActiveSceneTouchPointerCount(2);
    act(() => vi.advanceTimersByTime(TOUCH.longPressDelay));

    expect(options.onLongPress).not.toHaveBeenCalled();
  });

  it('never arms a long-press for mouse pointers but keeps the tap context-menu action', () => {
    vi.useFakeTimers();
    const options = createOptions({ touchMode: true });
    const { result } = renderHook(() => useBatchedFrustumInteractions(options));

    act(() => result.current.interactionHandlers.onPointerDown?.(batchedTouchEvent(0, { pointerType: 'mouse' })));
    act(() => vi.advanceTimersByTime(TOUCH.longPressDelay));
    expect(options.onLongPress).not.toHaveBeenCalled();

    act(() => result.current.interactionHandlers.onPointerUp?.(batchedTouchEvent(0, { pointerType: 'mouse' })));
    expect(options.onContextMenu).toHaveBeenCalledWith(1);
  });

  it('suppresses the tap context-menu action after a fired long-press', () => {
    vi.useFakeTimers();
    const options = createOptions({ touchMode: true });
    const { result } = renderHook(() => useBatchedFrustumInteractions(options));

    act(() => result.current.interactionHandlers.onPointerDown?.(batchedTouchEvent(0)));
    setActiveSceneTouchPointerCount(1);
    act(() => vi.advanceTimersByTime(TOUCH.longPressDelay));
    expect(options.onLongPress).toHaveBeenCalledTimes(1);

    act(() => result.current.interactionHandlers.onPointerUp?.(batchedTouchEvent(0)));
    expect(options.onContextMenu).not.toHaveBeenCalled();
  });
});
