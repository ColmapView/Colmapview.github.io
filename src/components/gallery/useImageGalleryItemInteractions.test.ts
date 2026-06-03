import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOUCH } from '../../theme';
import {
  buildReactMouseEvent,
  buildReactPointerEvent,
  buildReactTouchEvent,
  buildTouch,
} from '../../test/builders';
import { clearBodyCursor } from '../../utils/bodyCursor';
import { useImageGalleryItemInteractions } from './useImageGalleryItemInteractions';

type HookOptions = Parameters<typeof useImageGalleryItemInteractions>[0];

function createOptions(overrides: Partial<HookOptions> = {}): HookOptions {
  return {
    imageId: 42,
    isSelected: false,
    isScrolling: false,
    touchMode: false,
    onClick: vi.fn(),
    onDoubleClick: vi.fn(),
    onRightClick: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
  clearBodyCursor('image-gallery');
  document.body.style.cursor = '';
});

describe('useImageGalleryItemInteractions', () => {
  it('routes clicks to select or details depending on selected state', () => {
    const options = createOptions();
    const { result, rerender } = renderHook(
      (hookOptions: HookOptions) => useImageGalleryItemInteractions(hookOptions),
      { initialProps: options }
    );

    act(() => {
      result.current.itemHandlers.onClick?.(buildReactMouseEvent<HTMLDivElement>());
    });

    expect(options.onClick).toHaveBeenCalledWith(42);
    expect(options.onDoubleClick).not.toHaveBeenCalled();

    rerender({
      ...options,
      isSelected: true,
    });

    act(() => {
      result.current.itemHandlers.onClick?.(buildReactMouseEvent<HTMLDivElement>());
    });

    expect(options.onDoubleClick).toHaveBeenCalledWith(42);
  });

  it('prevents context menu and routes right-click actions', () => {
    const options = createOptions();
    const preventDefault = vi.fn();
    const { result } = renderHook(() => useImageGalleryItemInteractions(options));

    act(() => {
      result.current.itemHandlers.onContextMenu?.(buildReactMouseEvent<HTMLDivElement>({ preventDefault }));
    });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(options.onRightClick).toHaveBeenCalledWith(42);
  });

  it('tracks hover position and body cursor for desktop pointer events', () => {
    const { result } = renderHook(() => useImageGalleryItemInteractions(createOptions()));

    act(() => {
      result.current.itemHandlers.onPointerOver?.(buildReactPointerEvent<HTMLDivElement>({
        clientX: 12,
        clientY: 34,
      }));
    });

    expect(result.current.hovered).toBe(true);
    expect(result.current.mousePos).toEqual({ x: 12, y: 34 });
    expect(document.body.style.cursor).toBe('pointer');

    act(() => {
      result.current.itemHandlers.onPointerMove?.(buildReactPointerEvent<HTMLDivElement>({
        clientX: 56,
        clientY: 78,
      }));
    });

    expect(result.current.mousePos).toEqual({ x: 56, y: 78 });

    act(() => {
      result.current.itemHandlers.onPointerOut?.(buildReactPointerEvent<HTMLDivElement>());
    });

    expect(result.current.hovered).toBe(false);
    expect(result.current.mousePos).toBeNull();
    expect(document.body.style.cursor).toBe('');
  });

  it('clears hover state and body cursor when scrolling starts', () => {
    const options = createOptions();
    const { result, rerender } = renderHook(
      (hookOptions: HookOptions) => useImageGalleryItemInteractions(hookOptions),
      { initialProps: options }
    );

    act(() => {
      result.current.itemHandlers.onPointerOver?.(buildReactPointerEvent<HTMLDivElement>({
        clientX: 1,
        clientY: 2,
      }));
    });

    expect(result.current.hovered).toBe(true);
    expect(document.body.style.cursor).toBe('pointer');

    act(() => {
      rerender({
        ...options,
        isScrolling: true,
      });
    });

    expect(result.current.hovered).toBe(false);
    expect(result.current.mousePos).toBeNull();
    expect(document.body.style.cursor).toBe('');

    act(() => {
      result.current.itemHandlers.onPointerOver?.(buildReactPointerEvent<HTMLDivElement>({
        clientX: 3,
        clientY: 4,
      }));
    });

    expect(result.current.hovered).toBe(false);
    expect(result.current.mousePos).toBeNull();
    expect(document.body.style.cursor).toBe('');
  });

  it('uses touch handlers for touch mode and triggers long-press actions', () => {
    vi.useFakeTimers();
    const options = createOptions({ touchMode: true });
    const { result } = renderHook(() => useImageGalleryItemInteractions(options));

    expect(result.current.itemHandlers.onClick).toBeUndefined();

    act(() => {
      result.current.itemHandlers.onPointerOver?.(buildReactPointerEvent<HTMLDivElement>({
        clientX: 1,
        clientY: 2,
      }));
    });

    expect(result.current.hovered).toBe(false);
    expect(document.body.style.cursor).toBe('');

    act(() => {
      result.current.itemHandlers.onTouchStart?.(buildReactTouchEvent({
        touches: [buildTouch({ clientX: 10, clientY: 20 })],
      }));
      vi.advanceTimersByTime(TOUCH.longPressDelay);
    });

    expect(options.onRightClick).toHaveBeenCalledWith(42);
  });
});
